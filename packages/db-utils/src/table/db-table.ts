import {
  type FlatOf,
  type PrimaryKeyOf,
  type OwnPropsOf,
  type NavPropsOf,
  type TAtscriptAnnotatedType,
  type TAtscriptDataType,
  type Validator,
  ValidatorError,
} from '@atscript/typescript/utils'

import type { FilterExpr } from '@uniqu/core'

import type { BaseDbAdapter } from '../base-adapter'
import type { AtscriptDbTableLike, AtscriptDbWritable } from '../types'
import { DbError } from '../db-error'
import type { TGenericLogger } from '../logger'
import { resolveArrayOps, getArrayOpsFields } from '../patch/array-ops-resolver'
import { decomposePatch } from '../patch/patch-decomposer'
import { AtscriptDbReadable } from './db-readable'
import { resolveRelationTargetTable } from './relation-loader'
import { createDbValidatorPlugin, type DbValidationContext } from '../db-validator-plugin'
import type { IntegrityStrategy } from '../strategies/integrity'
import { NativeIntegrity } from '../strategies/integrity'
import { ApplicationIntegrity } from '../strategies/application-integrity'
import type {
  TCascadeResolver,
  TDbDeleteResult,
  TDbInsertManyResult,
  TDbInsertResult,
  TDbUpdateResult,
  TFkLookupResolver,
  TTableResolver,
  TWriteTableResolver,
} from '../types'

export { resolveDesignType } from './db-readable'

/**
 * Generic database table abstraction driven by Atscript `@db.*` annotations.
 *
 * Extends {@link AtscriptDbReadable} (read operations, field metadata, query
 * translation, relation loading) with write operations, validators, and
 * schema management.
 *
 * ```typescript
 * const adapter = new MongoAdapter(db)
 * const users = new AtscriptDbTable(UsersType, adapter)
 * await users.insertOne({ name: 'John', email: 'john@example.com' })
 * ```
 *
 * @typeParam T - The Atscript annotated type for this table.
 * @typeParam DataType - The inferred data shape from the annotated type.
 */
export class AtscriptDbTable<
  T extends TAtscriptAnnotatedType = TAtscriptAnnotatedType,
  DataType = TAtscriptDataType<T>,
  FlatType = FlatOf<T>,
  A extends BaseDbAdapter = BaseDbAdapter,
  IdType = PrimaryKeyOf<T>,
  OwnProps = OwnPropsOf<T>,
  NavType extends Record<string, unknown> = NavPropsOf<T>,
> extends AtscriptDbReadable<T, DataType, FlatType, A, IdType, OwnProps, NavType> {

  // ── Cascade resolver ─────────────────────────────────────────────────────

  protected _cascadeResolver?: TCascadeResolver
  protected _fkLookupResolver?: TFkLookupResolver

  // ── Integrity strategy ──────────────────────────────────────────────────

  protected readonly _integrity: IntegrityStrategy

  // ── Validators ────────────────────────────────────────────────────────────

  protected readonly validators = new Map<string, Validator<T, DataType>>()

  constructor(
    _type: T,
    adapter: A,
    logger?: TGenericLogger,
    _tableResolver?: TTableResolver,
    _writeTableResolver?: TWriteTableResolver
  ) {
    super(_type, adapter, logger, _tableResolver)
    if (_writeTableResolver) {
      this._writeTableResolver = _writeTableResolver
    }
    this._integrity = adapter.supportsNativeForeignKeys()
      ? new NativeIntegrity()
      : new ApplicationIntegrity()
  }

  /**
   * Sets the cascade resolver for application-level cascade deletes.
   * Called by DbSpace after table creation.
   */
  setCascadeResolver(resolver: TCascadeResolver): void {
    this._cascadeResolver = resolver
  }

  /**
   * Sets the FK lookup resolver for application-level FK validation.
   * Called by DbSpace after table creation.
   */
  setFkLookupResolver(resolver: TFkLookupResolver): void {
    this._fkLookupResolver = resolver
  }

  // ── Validation ────────────────────────────────────────────────────────────

  /**
   * Returns a cached validator for the given purpose.
   * Built with adapter plugins from {@link BaseDbAdapter.getValidatorPlugins}.
   *
   * Standard purposes: `'insert'`, `'update'`, `'patch'`.
   * Adapters may define additional purposes.
   */
  public getValidator(purpose: string): Validator<T, DataType> {
    if (!this.validators.has(purpose)) {
      const validator = this._buildValidator(purpose)
      this.validators.set(purpose, validator)
    }
    return this.validators.get(purpose)!
  }

  // ── CRUD operations ───────────────────────────────────────────────────────

  /**
   * Inserts a single record. Delegates to {@link insertMany} for unified
   * nested creation support.
   */
  public async insertOne(
    payload: Partial<DataType> & Record<string, unknown>,
    opts?: { maxDepth?: number }
  ): Promise<TDbInsertResult> {
    const result = await this.insertMany([payload], opts)
    return { insertedId: result.insertedIds[0] }
  }

  /**
   * Inserts multiple records with batch-optimized nested creation.
   *
   * Supports **nested creation**: if payloads include data for navigation
   * fields (`@db.rel.to` / `@db.rel.from`), related records are created
   * automatically in batches. TO dependencies are batch-created first
   * (their PKs become our FKs), FROM dependents are batch-created after
   * (they receive our PKs as their FKs). Fully recursive — nested records
   * with their own nav data trigger further batch inserts at each level.
   * Recursive up to `maxDepth` (default 3).
   */
  public async insertMany(
    payloads: Array<Partial<DataType> & Record<string, unknown>>,
    opts?: { maxDepth?: number }
  ): Promise<TDbInsertManyResult> {
    this._ensureBuilt()
    const maxDepth = opts?.maxDepth ?? 3
    const depth = (opts as { _depth?: number })?._depth ?? 0
    const canNest = depth < maxDepth && this._writeTableResolver && this._meta.navFields.size > 0
    if (!canNest && this._meta.navFields.size > 0) { this._checkDepthOverflow(payloads as Array<Record<string, unknown>>, maxDepth) }

    return this._enrichFkViolation(() => this.adapter.withTransaction(async () => {
      // Clone + apply defaults (keep originals for FROM phase)
      const items = payloads.map(p => this._applyDefaults({ ...p }))

      // Validate full payload (including nav fields) before any writes
      const validator = this.getValidator('insert')
      const ctx: DbValidationContext = { mode: 'insert' }
      this._validateBatch(validator, items, ctx)

      // Phase 1: Batch TO dependencies (they must exist before we can set our FKs)
      if (canNest) {
        await this._batchInsertNestedTo(items, maxDepth, depth)
      }

      // Strip nav fields, prepare for write
      const prepared: Array<Record<string, unknown>> = []
      for (const data of items) {
        for (const navField of this._meta.navFields) { delete data[navField] }
        prepared.push(this._fieldMapper.prepareForWrite(data, this._meta, this.adapter))
      }

      // Validate FK references (application-level, for adapters without native FK support)
      await this._integrity.validateForeignKeys(items, this._meta, this._fkLookupResolver, this._writeTableResolver)

      // Pre-validate FROM children (types + FK constraints) before the main insert.
      // Catches errors early (before the parent is committed), essential for
      // adapters without transaction support.
      if (canNest) {
        await this._preValidateNestedFrom(payloads as Array<Record<string, unknown>>)
      }

      // Phase 2: Batch main insert
      const result = await this.adapter.insertMany(prepared)

      // Phase 3: Batch FROM dependents (they need our PKs)
      if (canNest) {
        await this._batchInsertNestedFrom(payloads, result.insertedIds, maxDepth, depth)
      }

      // Phase 4: Batch VIA relations (insert targets + junction entries)
      if (canNest) {
        await this._batchInsertNestedVia(payloads, result.insertedIds, maxDepth, depth)
      }

      return result
    }))
  }

  /**
   * Replaces a single record identified by primary key(s).
   * Delegates to {@link bulkReplace} for unified nested relation support.
   */
  public async replaceOne(
    payload: DataType & Record<string, unknown>,
    opts?: { maxDepth?: number }
  ): Promise<TDbUpdateResult> {
    return this.bulkReplace([payload], opts)
  }

  /**
   * Replaces multiple records with deep nested relation support.
   *
   * Supports all relation types (TO, FROM, VIA). TO dependencies are
   * replaced first (their PKs become our FKs), FROM dependents are replaced
   * after (they receive our PKs as their FKs), VIA relations clear and
   * re-create junction rows. Fully recursive up to `maxDepth` (default 3).
   */
  public async bulkReplace(
    payloads: Array<DataType & Record<string, unknown>>,
    opts?: { maxDepth?: number }
  ): Promise<TDbUpdateResult> {
    this._ensureBuilt()
    const maxDepth = opts?.maxDepth ?? 3
    const depth = (opts as { _depth?: number })?._depth ?? 0
    const canNest = depth < maxDepth && this._writeTableResolver && this._meta.navFields.size > 0
    if (!canNest && this._meta.navFields.size > 0) { this._checkDepthOverflow(payloads as Array<Record<string, unknown>>, maxDepth) }

    return this._enrichFkViolation(() => this.adapter.withTransaction(async () => {
      // Phase 0: Setup — clone + defaults, validate full payload (including nav fields)
      const items = payloads.map(p => this._applyDefaults({ ...p }))
      const originals = canNest ? payloads.map(p => ({ ...p })) : []

      const validator = this.getValidator('bulkReplace')
      const ctx: DbValidationContext = { mode: 'replace' }
      this._validateBatch(validator, items, ctx)

      // Phase 1: TO dependencies (replace parents)
      if (canNest) {
        await this._batchReplaceNestedTo(items, maxDepth, depth)
      }

      // Validate FK references (application-level, for adapters without native FK support)
      await this._integrity.validateForeignKeys(items, this._meta, this._fkLookupResolver, this._writeTableResolver)

      // Pre-validate FROM children (types + FK constraints) before the main replace
      if (canNest) {
        await this._preValidateNestedFrom(originals)
      }

      // Phase 2: Main replace — strip nav fields, prepare, replace each
      let matchedCount = 0
      let modifiedCount = 0
      for (const data of items) {
        for (const navField of this._meta.navFields) { delete data[navField] }
        const filter = this._extractPrimaryKeyFilter(data)
        const prepared = this._fieldMapper.prepareForWrite(data, this._meta, this.adapter)
        const result = await this.adapter.replaceOne(
          this._fieldMapper.translateFilter(filter, this._meta),
          prepared
        )
        matchedCount += result.matchedCount
        modifiedCount += result.modifiedCount
      }

      // Phase 3: FROM dependencies (replace children)
      if (canNest) {
        await this._batchReplaceNestedFrom(originals, maxDepth, depth)
      }

      // Phase 4: VIA dependencies (replace junction records)
      if (canNest) {
        await this._batchReplaceNestedVia(originals, maxDepth, depth)
      }

      return { matchedCount, modifiedCount }
    }))
  }

  /**
   * Partially updates a single record identified by primary key(s).
   * Delegates to {@link bulkUpdate} for unified nested relation support.
   */
  public async updateOne(
    payload: Partial<DataType> & Record<string, unknown>,
    opts?: { maxDepth?: number }
  ): Promise<TDbUpdateResult> {
    return this.bulkUpdate([payload], opts)
  }

  /**
   * Partially updates multiple records with deep nested relation support.
   *
   * Only TO relations (1:1, N:1) are supported for patching. FROM/VIA
   * relations will error — use {@link bulkReplace} for those.
   * Recursive up to `maxDepth` (default 3).
   */
  public async bulkUpdate(
    payloads: Array<Partial<DataType> & Record<string, unknown>>,
    opts?: { maxDepth?: number }
  ): Promise<TDbUpdateResult> {
    this._ensureBuilt()
    const maxDepth = opts?.maxDepth ?? 3
    const depth = (opts as { _depth?: number })?._depth ?? 0
    const canNest = depth < maxDepth && this._writeTableResolver && this._meta.navFields.size > 0
    if (!canNest && this._meta.navFields.size > 0) { this._checkDepthOverflow(payloads as Array<Record<string, unknown>>, maxDepth) }

    return this._enrichFkViolation(() => this.adapter.withTransaction(async () => {
      // Phase 0: Setup — validate full payload (plugin checks nav field constraints)
      const validator = this.getValidator('bulkUpdate')
      const ctx: DbValidationContext = { mode: 'patch', flatMap: this.flatMap }
      this._validateBatch(validator, payloads as Array<Record<string, unknown>>, ctx)

      // Preserve originals for FROM/VIA phase (nav fields are stripped in Phase 2)
      const originals = canNest ? payloads.map(p => ({ ...p }) as Record<string, unknown>) : []

      // Phase 1: TO relation patches
      if (canNest) {
        await this._batchPatchNestedTo(payloads as Array<Record<string, unknown>>, maxDepth, depth)
      }

      // Validate FK references (application-level, for adapters without native FK support)
      await this._integrity.validateForeignKeys(payloads as Array<Record<string, unknown>>, this._meta, this._fkLookupResolver, this._writeTableResolver, true)

      // Phase 2: Main patch — strip nav fields, decompose, update each
      let matchedCount = 0
      let modifiedCount = 0
      for (const payload of payloads) {
        const data = { ...payload } as Record<string, unknown>
        for (const navField of this._meta.navFields) { delete data[navField] }
        const filter = this._extractPrimaryKeyFilter(data)

        // Strip PK fields from data — they're in the filter, not in the SET clause
        for (const pk of this._meta.primaryKeys) { delete data[pk] }

        // Skip if nothing left to update (e.g. only nav props + PK in payload)
        if (Object.keys(data).length === 0) {
          matchedCount += 1
          modifiedCount += 0
          continue
        }

        let result: TDbUpdateResult
        const translatedFilter = this._fieldMapper.translateFilter(filter, this._meta)
        if (this.adapter.supportsNativePatch()) {
          result = await this.adapter.nativePatch(translatedFilter, data)
        } else {
          const update = decomposePatch(data, this as AtscriptDbTable)
          const translatedUpdate = this._fieldMapper.translatePatchKeys(update, this._meta)

          // Resolve array ops via read-modify-write if any __$ keys present
          const arrayOpsFields = getArrayOpsFields(translatedUpdate)
          if (arrayOpsFields.size > 0) {
            const current = await this.adapter.findOne({ filter: translatedFilter, controls: {} }) as Record<string, unknown> | null
            const resolved = resolveArrayOps(translatedUpdate, current, this as AtscriptDbTable)
            result = await this.adapter.updateOne(translatedFilter, resolved)
          } else {
            result = await this.adapter.updateOne(translatedFilter, translatedUpdate)
          }
        }
        matchedCount += result.matchedCount
        modifiedCount += result.modifiedCount
      }

      // Phase 3: FROM relation patches
      if (canNest) {
        await this._batchPatchNestedFrom(originals, maxDepth, depth)
      }

      // Phase 4: VIA relation patches
      if (canNest) {
        await this._batchPatchNestedVia(originals, maxDepth, depth)
      }

      return { matchedCount, modifiedCount }
    }))
  }

  /**
   * Deletes a single record by any type-compatible identifier — primary key
   * or single-field unique index. Uses the same resolution logic as `findById`.
   *
   * When the adapter does not support native foreign keys (e.g. MongoDB),
   * cascade and setNull actions are applied before the delete.
   */
  public async deleteOne(id: IdType): Promise<TDbDeleteResult> {
    this._ensureBuilt()
    const filter = this._resolveIdFilter(id)
    if (!filter) {
      return { deletedCount: 0 }
    }
    if (this._integrity.needsCascade(this._cascadeResolver)) {
      return this._remapDeleteFkViolation(() => this.adapter.withTransaction(async () => {
        await this._integrity.cascadeBeforeDelete(filter, this.tableName, this._meta, this._cascadeResolver!, f => this._fieldMapper.translateFilter(f, this._meta), this.adapter)
        return this.adapter.deleteOne(this._fieldMapper.translateFilter(filter, this._meta))
      }))
    }
    return this._remapDeleteFkViolation(() => this.adapter.deleteOne(this._fieldMapper.translateFilter(filter, this._meta)))
  }

  // ── Batch operations ──────────────────────────────────────────────────────

  public async updateMany(
    filter: FilterExpr<FlatType>,
    data: Partial<DataType> & Record<string, unknown>
  ): Promise<TDbUpdateResult> {
    this._ensureBuilt()
    await this._integrity.validateForeignKeys([data as Record<string, unknown>], this._meta, this._fkLookupResolver, this._writeTableResolver, true)
    return this._enrichFkViolation(() => this.adapter.updateMany(
      this._fieldMapper.translateFilter(filter as FilterExpr, this._meta),
      this._fieldMapper.prepareForWrite({ ...data }, this._meta, this.adapter)
    ))
  }

  public async replaceMany(
    filter: FilterExpr<FlatType>,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult> {
    this._ensureBuilt()
    await this._integrity.validateForeignKeys([data], this._meta, this._fkLookupResolver, this._writeTableResolver)
    return this._enrichFkViolation(() => this.adapter.replaceMany(
      this._fieldMapper.translateFilter(filter as FilterExpr, this._meta),
      this._fieldMapper.prepareForWrite({ ...data }, this._meta, this.adapter)
    ))
  }

  public async deleteMany(filter: FilterExpr<FlatType>): Promise<TDbDeleteResult> {
    this._ensureBuilt()
    if (this._integrity.needsCascade(this._cascadeResolver)) {
      return this._remapDeleteFkViolation(() => this.adapter.withTransaction(async () => {
        await this._integrity.cascadeBeforeDelete(filter as FilterExpr, this.tableName, this._meta, this._cascadeResolver!, f => this._fieldMapper.translateFilter(f, this._meta), this.adapter)
        return this.adapter.deleteMany(this._fieldMapper.translateFilter(filter as FilterExpr, this._meta))
      }))
    }
    return this._remapDeleteFkViolation(() => this.adapter.deleteMany(this._fieldMapper.translateFilter(filter as FilterExpr, this._meta)))
  }

  // ── Schema operations ─────────────────────────────────────────────────────

  /**
   * Synchronizes indexes between Atscript definitions and the database.
   */
  public async syncIndexes(): Promise<void> {
    this._ensureBuilt()
    return this.adapter.syncIndexes()
  }

  /**
   * Ensures the table/collection exists in the database.
   */
  public async ensureTable(): Promise<void> {
    this._ensureBuilt()
    return this.adapter.ensureTable()
  }

  // ── Internal: write preparation ───────────────────────────────────────────

  /**
   * Applies default values for fields that are missing from the payload.
   * Defaults handled natively by the DB engine are skipped — the field stays
   * absent so the DB's own DEFAULT clause applies.
   */
  protected _applyDefaults(data: Record<string, unknown>): Record<string, unknown> {
    const nativeValues = this.adapter.supportsNativeValueDefaults()
    const nativeFns = this.adapter.nativeDefaultFns()
    for (const [field, def] of this._meta.defaults.entries()) {
      if (data[field] === undefined) {
        if (def.kind === 'value' && !nativeValues) {
          const fieldType = this._meta.flatMap?.get(field)
          const designType = fieldType?.type.kind === '' && (fieldType.type as { designType: string }).designType
          data[field] = designType === 'string' ? def.value : JSON.parse(def.value)
        } else if (def.kind === 'fn' && !nativeFns.has(def.fn)) {
          switch (def.fn) {
            case 'now': { data[field] = Date.now(); break }
            case 'uuid': { data[field] = crypto.randomUUID(); break }
            // 'increment' is left to the DB (e.g. INTEGER PRIMARY KEY in SQLite)
          }
        }
      }
    }
    return data
  }


  /**
   * Extracts primary key field(s) from a payload to build a filter.
   */
  protected _extractPrimaryKeyFilter(payload: Record<string, unknown>): FilterExpr {
    const pkFields = this.primaryKeys
    if (pkFields.length === 0) {
      throw new DbError('NOT_FOUND', [{ path: '', message: 'No primary key defined — cannot extract filter' }])
    }
    const filter: FilterExpr = {}
    for (const field of pkFields) {
      if (payload[field] === undefined) {
        throw new DbError('NOT_FOUND', [{ path: field, message: `Missing primary key field "${field}" in payload` }])
      }
      const fieldType = this.flatMap.get(field)
      filter[field] = fieldType
        ? this.adapter.prepareId(payload[field], fieldType)
        : payload[field]
    }
    return filter
  }

  /**
   * Pre-validate items (type validation + FK constraints) without inserting them.
   * Used by parent tables to validate FROM children before the main insert,
   * ensuring errors are caught before the parent is committed.
   *
   * @param opts.excludeFkTargetTable - Skip FK validation to this table (the parent).
   */
  public async preValidateItems(
    items: Array<Record<string, unknown>>,
    opts?: { excludeFkTargetTable?: string }
  ): Promise<void> {
    this._ensureBuilt()

    // Type validation: apply defaults, validate full payload
    const validator = this.getValidator('insert')
    const ctx: DbValidationContext = { mode: 'insert' }
    const prepared = items.map(raw => this._applyDefaults({ ...raw }))
    this._validateBatch(validator, prepared, ctx)

    // FK validation
    await this._integrity.validateForeignKeys(items, this._meta, this._fkLookupResolver, this._writeTableResolver, false, opts?.excludeFkTargetTable)
  }

  // ── Internal: batch nested creation ──────────────────────────────────────

  /**
   * Batch-creates TO dependencies before the main insert.
   * For each `@db.rel.to` relation, collects all inline parent objects
   * across items, batch-inserts them on the target table (recursively),
   * and wires the returned IDs back as FK values on the source items.
   */
  private async _batchInsertNestedTo(
    items: Array<Record<string, unknown>>,
    maxDepth: number,
    depth: number
  ): Promise<void> {
    for (const [navField, relation] of this._meta.relations) {
      if (relation.direction !== 'to') { continue }

      const targetTable = this._writeTableResolver!(relation.targetType())
      if (!targetTable) { continue }
      const fk = this._findFKForRelation(relation)
      if (!fk) { continue }

      const parents: Array<Record<string, unknown>> = []
      const sourceIndices: number[] = []
      for (let i = 0; i < items.length; i++) {
        const nested = items[i][navField]
        if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
          parents.push(nested as Record<string, unknown>)
          sourceIndices.push(i)
        }
      }
      if (parents.length === 0) { continue }

      const result = await targetTable.insertMany(parents, { maxDepth, _depth: depth + 1 })

      for (let j = 0; j < sourceIndices.length; j++) {
        if (fk.localFields.length === 1) {
          items[sourceIndices[j]][fk.localFields[0]] = result.insertedIds[j]
        }
      }
    }
  }

  /**
   * Pre-validates FROM children (type + FK constraints) before the main insert.
   * Catches errors early before the parent record is committed, essential for
   * adapters without transaction support.
   */
  private async _preValidateNestedFrom(
    originals: Array<Record<string, unknown>>
  ): Promise<void> {
    for (const [navField, relation] of this._meta.relations) {
      if (relation.direction !== 'from') { continue }

      if (!this._writeTableResolver) { continue }
      const targetTable = this._writeTableResolver(relation.targetType())
      if (!targetTable) { continue }

      // Find the FK field(s) on the child that reference this parent table.
      // These will be auto-filled during the actual insert, so we set placeholder
      // values to satisfy required-field validation.
      const remoteFK = this._findRemoteFK(targetTable, this.tableName, relation.alias)

      const allChildren: Array<Record<string, unknown>> = []
      for (const orig of originals) {
        const children = orig[navField]
        if (!Array.isArray(children)) { continue }
        for (const child of children) {
          const childData = { ...(child as Record<string, unknown>) }
          // Set placeholder values for the FK-to-parent fields
          if (remoteFK) {
            for (const field of remoteFK.fields) {
              if (!(field in childData)) { childData[field] = 0 }
            }
          }
          allChildren.push(childData)
        }
      }
      if (allChildren.length === 0) { continue }

      // Validate types + FKs to third tables, excluding the FK back to this
      // (parent) table since the parent record doesn't exist yet
      await this._wrapNestedError(navField, () =>
        targetTable.preValidateItems(allChildren, { excludeFkTargetTable: this.tableName })
      )
    }
  }

  /**
   * Batch-creates FROM dependents after the main insert.
   * For each `@db.rel.from` relation, collects all child objects across
   * items (setting the FK to the corresponding parent's ID), and
   * batch-inserts them on the target table (recursively).
   */
  private async _batchInsertNestedFrom(
    originals: Array<Record<string, unknown>>,
    parentIds: unknown[],
    maxDepth: number,
    depth: number
  ): Promise<void> {
    for (const [navField, relation] of this._meta.relations) {
      if (relation.direction !== 'from') { continue }

      const targetTable = this._writeTableResolver!(relation.targetType())
      if (!targetTable) { continue }
      const remoteFK = this._findRemoteFK(targetTable, this.tableName, relation.alias)
      if (!remoteFK) { continue }

      const allChildren: Array<Record<string, unknown>> = []
      for (let i = 0; i < originals.length; i++) {
        const children = originals[i][navField]
        if (!Array.isArray(children)) { continue }
        for (const child of children) {
          const childData = { ...(child as Record<string, unknown>) }
          if (remoteFK.fields.length === 1) {
            childData[remoteFK.fields[0]] = parentIds[i]
          }
          allChildren.push(childData)
        }
      }
      if (allChildren.length === 0) { continue }

      await this._wrapNestedError(navField, () =>
        targetTable.insertMany(allChildren, { maxDepth, _depth: depth + 1 })
      )
    }
  }

  /**
   * Batch-creates VIA (M:N) targets and junction entries after the main insert.
   * For each `@db.rel.via` relation, collects inline target objects,
   * batch-inserts them on the target table, then creates junction rows
   * linking parent PKs to target PKs.
   */
  private async _batchInsertNestedVia(
    originals: Array<Record<string, unknown>>,
    parentIds: unknown[],
    maxDepth: number,
    depth: number
  ): Promise<void> {
    for (const [navField, relation] of this._meta.relations) {
      if (relation.direction !== 'via' || !relation.viaType) { continue }

      const targetTable = this._writeTableResolver!(relation.targetType())
      if (!targetTable) { continue }
      const junctionTable = this._writeTableResolver!(relation.viaType())
      if (!junctionTable) { continue }

      const targetTableName = resolveRelationTargetTable(relation)

      const fkToThis = this._findRemoteFK(junctionTable, this.tableName)
      if (!fkToThis) { continue }
      const fkToTarget = this._findRemoteFK(junctionTable, targetTableName)
      if (!fkToTarget) { continue }

      const targetPKField = targetTable.primaryKeys[0]
      if (!targetPKField || fkToTarget.fields.length !== 1 || fkToThis.fields.length !== 1) { continue }

      for (let i = 0; i < originals.length; i++) {
        const targets = originals[i][navField]
        if (!Array.isArray(targets) || targets.length === 0) { continue }

        const parentPK = parentIds[i]
        if (parentPK === undefined) { continue }

        // Separate existing targets (have PK) from new targets (need insert)
        const newTargets: Array<Record<string, unknown>> = []
        const existingIds: unknown[] = []
        for (const t of targets) {
          const rec = t as Record<string, unknown>
          const pk = rec[targetPKField]
          if (pk !== undefined && pk !== null) {
            existingIds.push(pk)
          } else {
            newTargets.push({ ...rec })
          }
        }

        // a) Insert only new target records
        const allTargetIds: unknown[] = [...existingIds]
        if (newTargets.length > 0) {
          const targetResult = await targetTable.insertMany(newTargets, { maxDepth, _depth: depth + 1 })
          allTargetIds.push(...targetResult.insertedIds)
        }

        // b) Insert junction rows linking parent to all targets
        if (allTargetIds.length > 0) {
          const junctionRows = allTargetIds.map(targetId => ({
            [fkToThis.fields[0]]: parentPK,
            [fkToTarget.fields[0]]: targetId,
          }))
          await junctionTable.insertMany(junctionRows, { maxDepth: 0 })
        }
      }
    }
  }

  // ── Internal: nav prop checking ─────────────────────────────────────────

  /**
   * Checks if any payload contains navigational data that would be silently
   * dropped because maxDepth is 0. Only called for top-level (user-facing)
   * calls, not internal recursive ones.
   */
  private _checkDepthOverflow(
    payloads: Array<Record<string, unknown>>,
    maxDepth: number,
  ): void {
    if (this._meta.navFields.size === 0) { return }
    for (const payload of payloads) {
      for (const navField of this._meta.navFields) {
        if (payload[navField] !== undefined) {
          throw new Error(
            `Nested data in '${navField}' exceeds maxDepth (${maxDepth}). ` +
            `Increase maxDepth or strip nested data before writing.`
          )
        }
      }
    }
  }

  /**
   * Validates a batch of items using the given validator and context.
   * Wraps per-item validation errors with array index paths for batch operations.
   */
  private _validateBatch(
    validator: Validator<T, DataType>,
    items: Array<Record<string, unknown>>,
    ctx: DbValidationContext
  ): void {
    for (let i = 0; i < items.length; i++) {
      try {
        validator.validate(items[i] as DataType, false, ctx)
      } catch (error) {
        if (error instanceof ValidatorError && items.length > 1) {
          throw new ValidatorError(error.errors.map(err => ({
            ...err,
            path: `[${i}].${err.path}`,
          })))
        }
        throw error
      }
    }
  }

  /**
   * Wraps an async nested operation and prefixes error paths with the nav field context.
   * This ensures errors from child table operations (e.g., FK violations on a comment)
   * get paths like `comments[0].authorId` instead of just `authorId`.
   */
  private static _prefixErrorPaths(
    errors: Array<{ path: string; message: string }>,
    prefix: string
  ): Array<{ path: string; message: string }> {
    return errors.map(err => ({
      ...err,
      path: err.path ? `${prefix}.${err.path}` : prefix,
    }))
  }

  private async _wrapNestedError<R>(navField: string, fn: () => Promise<R>): Promise<R> {
    try {
      return await fn()
    } catch (error) {
      if (error instanceof ValidatorError) {
        throw new ValidatorError(AtscriptDbTable._prefixErrorPaths(error.errors, navField))
      }
      if (error instanceof DbError) {
        throw new DbError(error.code, AtscriptDbTable._prefixErrorPaths(error.errors, navField))
      }
      throw error
    }
  }

  /**
   * Catches `DbError('FK_VIOLATION')` with empty paths (from adapters that
   * enforce FKs natively but can't report which field failed) and enriches
   * the error with all FK field names from table metadata.
   */
  private async _enrichFkViolation<R>(fn: () => Promise<R>): Promise<R> {
    try {
      return await fn()
    } catch (error) {
      if (error instanceof DbError && error.code === 'FK_VIOLATION' && error.errors.every(err => !err.path)) {
        const msg = error.errors[0]?.message ?? error.message
        const errors: Array<{ path: string; message: string }> = []
        for (const [, fk] of this._meta.foreignKeys) {
          for (const field of fk.fields) {
            errors.push({ path: field, message: msg })
          }
        }
        throw new DbError('FK_VIOLATION', errors.length > 0 ? errors : error.errors)
      }
      throw error
    }
  }

  /**
   * Wraps a delete operation: catches native `FK_VIOLATION` errors (e.g. SQLite
   * RESTRICT) and re-throws as `CONFLICT` (409) with a descriptive message.
   * During DELETE, an FK violation is always a RESTRICT constraint — cascade and
   * setNull are handled at the app level or natively without errors.
   */
  private async _remapDeleteFkViolation<R>(fn: () => Promise<R>): Promise<R> {
    try {
      return await fn()
    } catch (error) {
      if (error instanceof DbError && error.code === 'FK_VIOLATION') {
        throw new DbError('CONFLICT', [{
          path: this.tableName,
          message: `Cannot delete from "${this.tableName}": referenced by child records (RESTRICT)`,
        }])
      }
      throw error
    }
  }

  // ── Internal: batch nested replace ──────────────────────────────────────

  /**
   * Batch-replaces TO dependencies before the main replace.
   * Mirrors {@link _batchInsertNestedTo} but calls bulkReplace.
   */
  private async _batchReplaceNestedTo(
    items: Array<Record<string, unknown>>,
    maxDepth: number,
    depth: number
  ): Promise<void> {
    for (const [navField, relation] of this._meta.relations) {
      if (relation.direction !== 'to') { continue }

      const targetTable = this._writeTableResolver!(relation.targetType())
      if (!targetTable) { continue }
      const fk = this._findFKForRelation(relation)
      if (!fk) { continue }

      const parents: Array<Record<string, unknown>> = []
      const sourceIndices: number[] = []
      for (let i = 0; i < items.length; i++) {
        const nested = items[i][navField]
        if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
          parents.push(nested as Record<string, unknown>)
          sourceIndices.push(i)
        }
      }
      if (parents.length === 0) { continue }

      await targetTable.bulkReplace(parents, { maxDepth, _depth: depth + 1 })

      // Wire FK values back from the nested objects' PKs
      for (let j = 0; j < sourceIndices.length; j++) {
        if (fk.localFields.length === 1 && fk.targetFields.length === 1) {
          items[sourceIndices[j]][fk.localFields[0]] = parents[j][fk.targetFields[0]]
        }
      }
    }
  }

  /**
   * Batch-replaces FROM dependents after the main replace.
   * Mirrors {@link _batchInsertNestedFrom} but calls bulkReplace.
   */
  private async _batchReplaceNestedFrom(
    originals: Array<Record<string, unknown>>,
    maxDepth: number,
    depth: number
  ): Promise<void> {
    for (const [navField, relation] of this._meta.relations) {
      if (relation.direction !== 'from') { continue }

      const targetTable = this._writeTableResolver!(relation.targetType())
      if (!targetTable) { continue }
      const remoteFK = this._findRemoteFK(targetTable, this.tableName, relation.alias)
      if (!remoteFK) { continue }

      const childPKs = [...targetTable.primaryKeys]
      for (const original of originals) {
        const children = original[navField]
        if (!Array.isArray(children)) { continue }
        const parentPK = this._meta.primaryKeys.length === 1 ? original[this._meta.primaryKeys[0]] : undefined
        if (parentPK === undefined || remoteFK.fields.length !== 1) { continue }
        const fkField = remoteFK.fields[0]

        // Wire FK on each child and separate by PK presence
        const toReplace: Array<Record<string, unknown>> = []
        const toInsert: Array<Record<string, unknown>> = []
        const newPKSet = new Set<string>()
        for (const child of children) {
          const childData = { ...(child as Record<string, unknown>) }
          childData[fkField] = parentPK
          const hasPK = childPKs.length > 0 && childPKs.every(pk => childData[pk] !== undefined)
          if (hasPK) {
            newPKSet.add(childPKs.map(pk => String(childData[pk])).join('\0'))
            toReplace.push(childData)
          } else {
            toInsert.push(childData)
          }
        }

        // Fetch existing children to find orphans
        const existing = await targetTable.findMany({
          filter: { [fkField]: parentPK },
          controls: childPKs.length > 0 ? { $select: [...childPKs] } : {},
        })

        // Delete orphans (existing children not in the new set)
        for (const row of existing) {
          const pkKey = childPKs.map(pk => String(row[pk])).join('\0')
          if (!newPKSet.has(pkKey)) {
            const orphanFilter: Record<string, unknown> = {}
            for (const pk of childPKs) { orphanFilter[pk] = row[pk] }
            await targetTable.deleteMany(orphanFilter)
          }
        }

        // Replace children with PKs (update in place, preserving identity)
        if (toReplace.length > 0) {
          await this._wrapNestedError(navField, () =>
            targetTable.bulkReplace(toReplace, { maxDepth, _depth: depth + 1 })
          )
        }
        // Insert new children without PKs
        if (toInsert.length > 0) {
          await this._wrapNestedError(navField, () =>
            targetTable.insertMany(toInsert, { maxDepth, _depth: depth + 1 })
          )
        }
      }
    }
  }

  /**
   * Handles VIA (M:N) relations during replace.
   * Deletes existing junction rows, replaces target records, inserts new junction rows.
   */
  private async _batchReplaceNestedVia(
    originals: Array<Record<string, unknown>>,
    maxDepth: number,
    depth: number
  ): Promise<void> {
    for (const [navField, relation] of this._meta.relations) {
      if (relation.direction !== 'via' || !relation.viaType) { continue }

      const targetTable = this._writeTableResolver!(relation.targetType())
      if (!targetTable) { continue }
      const junctionTable = this._writeTableResolver!(relation.viaType())
      if (!junctionTable) { continue }

      const targetTableName = resolveRelationTargetTable(relation)

      const fkToThis = this._findRemoteFK(junctionTable, this.tableName)
      if (!fkToThis) { continue }
      const fkToTarget = this._findRemoteFK(junctionTable, targetTableName)
      if (!fkToTarget) { continue }

      const targetPKField = targetTable.primaryKeys[0]
      if (!targetPKField || fkToTarget.fields.length !== 1 || fkToThis.fields.length !== 1) { continue }

      for (const original of originals) {
        const targets = original[navField]
        if (!Array.isArray(targets)) { continue }

        const parentPK = this._meta.primaryKeys.length === 1 ? original[this._meta.primaryKeys[0]] : undefined
        if (parentPK === undefined) { continue }

        // a) Delete existing junction rows
        await junctionTable.deleteMany({ [fkToThis.fields[0]]: parentPK })

        // Separate targets: existing (ID-only ref), replace (ID + data), new (no ID)
        const toReplace: Array<Record<string, unknown>> = []
        const toInsert: Array<Record<string, unknown>> = []
        const existingIds: unknown[] = []
        for (const t of targets) {
          const rec = t as Record<string, unknown>
          const pk = rec[targetPKField]
          if (pk !== undefined && pk !== null) {
            const keys = Object.keys(rec).filter(k => k !== targetPKField)
            if (keys.length > 0) {
              toReplace.push({ ...rec })
            }
            existingIds.push(pk)
          } else {
            toInsert.push({ ...rec })
          }
        }

        // b) Replace target records that have PK + data
        if (toReplace.length > 0) {
          await targetTable.bulkReplace(toReplace, { maxDepth, _depth: depth + 1 })
        }

        // c) Insert new target records and collect their IDs
        const allTargetIds: unknown[] = [...existingIds]
        if (toInsert.length > 0) {
          const insertResult = await targetTable.insertMany(toInsert, { maxDepth, _depth: depth + 1 })
          allTargetIds.push(...insertResult.insertedIds)
        }

        // d) Insert new junction rows
        if (allTargetIds.length > 0) {
          const junctionRows = allTargetIds.map(targetId => ({
            [fkToThis.fields[0]]: parentPK,
            [fkToTarget.fields[0]]: targetId,
          }))
          await junctionTable.insertMany(junctionRows, { maxDepth: 0 })
        }
      }
    }
  }

  // ── Internal: batch nested patch ────────────────────────────────────────

  /**
   * Batch-patches TO dependencies before the main patch.
   * Reads FK values from DB if not present in the payload.
   */
  private async _batchPatchNestedTo(
    items: Array<Record<string, unknown>>,
    maxDepth: number,
    depth: number
  ): Promise<void> {
    for (const [navField, relation] of this._meta.relations) {
      if (relation.direction !== 'to') { continue }

      const targetTable = this._writeTableResolver!(relation.targetType())
      if (!targetTable) { continue }
      const fk = this._findFKForRelation(relation)
      if (!fk) { continue }

      const patches: Array<Record<string, unknown>> = []
      for (const item of items) {
        const nested = item[navField]
        if (!nested || typeof nested !== 'object' || Array.isArray(nested)) { continue }

        const patch = { ...(nested as Record<string, unknown>) }

        // Get FK value from payload, or read from DB
        let fkValue = fk.localFields.length === 1 ? item[fk.localFields[0]] : undefined
        if (fkValue === undefined) {
          // Need to read current record to get FK
          const pkFilter = this._extractPrimaryKeyFilter(item) as FilterExpr<OwnProps>
          const current = await this.findOne({ filter: pkFilter, controls: {} })
          if (!current) {
            throw new DbError('NOT_FOUND', [{ path: navField, message: `Cannot patch relation '${navField}' — source record not found` }])
          }
          fkValue = fk.localFields.length === 1 ? (current as Record<string, unknown>)[fk.localFields[0]] : undefined
        }

        if (fkValue === null || fkValue === undefined) {
          throw new DbError('FK_VIOLATION', [{ path: fk.localFields[0], message: `Cannot patch relation '${navField}' — foreign key '${fk.localFields[0]}' is null` }])
        }

        // Inject target PK into the nested patch
        if (fk.targetFields.length === 1) {
          patch[fk.targetFields[0]] = fkValue
        }

        patches.push(patch)
      }
      if (patches.length === 0) { continue }

      await targetTable.bulkUpdate(patches, { maxDepth, _depth: depth + 1 })
    }
  }

  /**
   * Batch-patches FROM (1:N) dependencies after the main patch.
   *
   * Supports patch operators:
   * - Plain array → $replace semantics (delete orphans + replace/insert)
   * - `{ $replace }` → same as plain array
   * - `{ $insert }` → insert new children with FK wired
   * - `{ $remove }` → delete children by PK
   * - `{ $update }` → patch children by PK
   * - `{ $upsert }` → update if PK present, insert otherwise
   */
  private async _batchPatchNestedFrom(
    originals: Array<Record<string, unknown>>,
    maxDepth: number,
    depth: number
  ): Promise<void> {
    for (const [navField, relation] of this._meta.relations) {
      if (relation.direction !== 'from') { continue }

      const targetTable = this._writeTableResolver!(relation.targetType())
      if (!targetTable) { continue }
      const remoteFK = this._findRemoteFK(targetTable, this.tableName, relation.alias)
      if (!remoteFK) { continue }

      const childPKs = [...targetTable.primaryKeys]

      for (const original of originals) {
        const navValue = original[navField]
        if (navValue === undefined || navValue === null) { continue }

        const parentPK = this._meta.primaryKeys.length === 1 ? original[this._meta.primaryKeys[0]] : undefined
        if (parentPK === undefined || remoteFK.fields.length !== 1) { continue }
        const fkField = remoteFK.fields[0]

        // Determine operations
        const ops = this._extractNavPatchOps(navValue)

        // $replace — full replacement (delete orphans + replace/insert)
        if (ops.replace) {
          await this._fromReplace(targetTable, ops.replace, parentPK, fkField, childPKs, navField, maxDepth, depth)
        }

        // $remove — delete children by PK
        if (ops.remove) {
          for (const child of ops.remove) {
            const rec = child as Record<string, unknown>
            const pkFilter: Record<string, unknown> = {}
            for (const pk of childPKs) { pkFilter[pk] = rec[pk] }
            pkFilter[fkField] = parentPK // ensure scoped to this parent
            await targetTable.deleteMany(pkFilter)
          }
        }

        // $update — patch children by PK
        if (ops.update && ops.update.length > 0) {
          const items = ops.update.map(child => {
            const rec = { ...(child as Record<string, unknown>) }
            rec[fkField] = parentPK
            return rec
          })
          await this._wrapNestedError(navField, () =>
            targetTable.bulkUpdate(items, { maxDepth, _depth: depth + 1 })
          )
        }

        // $upsert — update if has PK, insert otherwise
        if (ops.upsert) {
          const toUpdate: Array<Record<string, unknown>> = []
          const toInsert: Array<Record<string, unknown>> = []
          for (const child of ops.upsert) {
            const rec = { ...(child as Record<string, unknown>) }
            rec[fkField] = parentPK
            const hasPK = childPKs.length > 0 && childPKs.every(pk => rec[pk] !== undefined)
            if (hasPK) {
              toUpdate.push(rec)
            } else {
              toInsert.push(rec)
            }
          }
          if (toUpdate.length > 0) {
            await this._wrapNestedError(navField, () =>
              targetTable.bulkUpdate(toUpdate, { maxDepth, _depth: depth + 1 })
            )
          }
          if (toInsert.length > 0) {
            await this._wrapNestedError(navField, () =>
              targetTable.insertMany(toInsert, { maxDepth, _depth: depth + 1 })
            )
          }
        }

        // $insert — insert new children with FK wired
        if (ops.insert && ops.insert.length > 0) {
          const items = ops.insert.map(child => {
            const rec = { ...(child as Record<string, unknown>) }
            rec[fkField] = parentPK
            return rec
          })
          await this._wrapNestedError(navField, () =>
            targetTable.insertMany(items, { maxDepth, _depth: depth + 1 })
          )
        }
      }
    }
  }

  /**
   * FROM $replace helper: mirrors `_batchReplaceNestedFrom` logic for a single parent.
   */
  private async _fromReplace(
    targetTable: AtscriptDbTableLike & AtscriptDbWritable,
    children: unknown[],
    parentPK: unknown,
    fkField: string,
    childPKs: string[],
    navField: string,
    maxDepth: number,
    depth: number
  ): Promise<void> {
    const toReplace: Array<Record<string, unknown>> = []
    const toInsert: Array<Record<string, unknown>> = []
    const newPKSet = new Set<string>()
    for (const child of children) {
      const childData = { ...(child as Record<string, unknown>) }
      childData[fkField] = parentPK
      const hasPK = childPKs.length > 0 && childPKs.every(pk => childData[pk] !== undefined)
      if (hasPK) {
        newPKSet.add(childPKs.map(pk => String(childData[pk])).join('\0'))
        toReplace.push(childData)
      } else {
        toInsert.push(childData)
      }
    }

    // Fetch existing children to find orphans
    const existing = await targetTable.findMany({
      filter: { [fkField]: parentPK },
      controls: childPKs.length > 0 ? { $select: [...childPKs] } : {},
    })

    // Delete orphans
    for (const row of existing) {
      const pkKey = childPKs.map(pk => String(row[pk])).join('\0')
      if (!newPKSet.has(pkKey)) {
        const orphanFilter: Record<string, unknown> = {}
        for (const pk of childPKs) { orphanFilter[pk] = row[pk] }
        await targetTable.deleteMany(orphanFilter)
      }
    }

    if (toReplace.length > 0) {
      await this._wrapNestedError(navField, () =>
        targetTable.bulkReplace(toReplace, { maxDepth, _depth: depth + 1 })
      )
    }
    if (toInsert.length > 0) {
      await this._wrapNestedError(navField, () =>
        targetTable.insertMany(toInsert, { maxDepth, _depth: depth + 1 })
      )
    }
  }

  /**
   * Batch-patches VIA (M:N) dependencies after the main patch.
   *
   * Supports patch operators:
   * - Plain array → $replace semantics (clear junctions + rebuild)
   * - `{ $replace }` → same as plain array
   * - `{ $insert }` → insert new targets + junction rows
   * - `{ $remove }` → delete junction rows for target PKs
   * - `{ $update }` → update target records by PK (junction untouched)
   * - `{ $upsert }` → update target if PK present, insert otherwise; ensure junction
   */
  private async _batchPatchNestedVia(
    originals: Array<Record<string, unknown>>,
    maxDepth: number,
    depth: number
  ): Promise<void> {
    for (const [navField, relation] of this._meta.relations) {
      if (relation.direction !== 'via' || !relation.viaType) { continue }

      const targetTable = this._writeTableResolver!(relation.targetType())
      if (!targetTable) { continue }
      const junctionTable = this._writeTableResolver!(relation.viaType())
      if (!junctionTable) { continue }

      const targetTableName = resolveRelationTargetTable(relation)

      const fkToThis = this._findRemoteFK(junctionTable, this.tableName)
      if (!fkToThis) { continue }
      const fkToTarget = this._findRemoteFK(junctionTable, targetTableName)
      if (!fkToTarget) { continue }

      const targetPKField = targetTable.primaryKeys[0]
      if (!targetPKField || fkToTarget.fields.length !== 1 || fkToThis.fields.length !== 1) { continue }

      for (const original of originals) {
        const navValue = original[navField]
        if (navValue === undefined || navValue === null) { continue }

        const parentPK = this._meta.primaryKeys.length === 1 ? original[this._meta.primaryKeys[0]] : undefined
        if (parentPK === undefined) { continue }

        const ops = this._extractNavPatchOps(navValue)

        // $replace — clear junctions + rebuild (same as existing replace logic)
        if (ops.replace) {
          await this._viaReplace(targetTable, junctionTable, ops.replace, parentPK, targetPKField, fkToThis.fields[0], fkToTarget.fields[0], maxDepth, depth)
        }

        // $remove — delete junction rows for target PKs
        if (ops.remove) {
          for (const target of ops.remove) {
            const rec = target as Record<string, unknown>
            const targetPK = rec[targetPKField]
            if (targetPK !== undefined && targetPK !== null) {
              await junctionTable.deleteMany({
                [fkToThis.fields[0]]: parentPK,
                [fkToTarget.fields[0]]: targetPK,
              })
            }
          }
        }

        // $update — update target records by PK (junction untouched)
        if (ops.update && ops.update.length > 0) {
          await targetTable.bulkUpdate(
            ops.update.map(t => ({ ...(t as Record<string, unknown>) })),
            { maxDepth, _depth: depth + 1 }
          )
        }

        // $upsert — update if PK, insert if not; ensure junction rows
        if (ops.upsert) {
          for (const target of ops.upsert) {
            const rec = { ...(target as Record<string, unknown>) }
            const pk = rec[targetPKField]
            if (pk !== undefined && pk !== null) {
              // Update existing target
              await targetTable.bulkUpdate([rec], { maxDepth, _depth: depth + 1 })
              // Ensure junction exists
              const existingJunction = await junctionTable.findMany({
                filter: { [fkToThis.fields[0]]: parentPK, [fkToTarget.fields[0]]: pk },
                controls: {},
              })
              if (existingJunction.length === 0) {
                await junctionTable.insertMany([{
                  [fkToThis.fields[0]]: parentPK,
                  [fkToTarget.fields[0]]: pk,
                }], { maxDepth: 0 })
              }
            } else {
              // Insert new target + junction
              const insertResult = await targetTable.insertMany([rec], { maxDepth, _depth: depth + 1 })
              const newId = insertResult.insertedIds[0]
              await junctionTable.insertMany([{
                [fkToThis.fields[0]]: parentPK,
                [fkToTarget.fields[0]]: newId,
              }], { maxDepth: 0 })
            }
          }
        }

        // $insert — insert new targets + junction rows
        if (ops.insert && ops.insert.length > 0) {
          const toInsert: Array<Record<string, unknown>> = []
          const existingIds: unknown[] = []
          for (const target of ops.insert) {
            const rec = { ...(target as Record<string, unknown>) }
            const pk = rec[targetPKField]
            if (pk !== undefined && pk !== null) {
              // ID-only reference — just link it
              existingIds.push(pk)
            } else {
              toInsert.push(rec)
            }
          }
          const allIds = [...existingIds]
          if (toInsert.length > 0) {
            const insertResult = await targetTable.insertMany(toInsert, { maxDepth, _depth: depth + 1 })
            allIds.push(...insertResult.insertedIds)
          }
          if (allIds.length > 0) {
            const junctionRows = allIds.map(targetId => ({
              [fkToThis.fields[0]]: parentPK,
              [fkToTarget.fields[0]]: targetId,
            }))
            await junctionTable.insertMany(junctionRows, { maxDepth: 0 })
          }
        }
      }
    }
  }

  /**
   * VIA $replace helper: mirrors `_batchReplaceNestedVia` logic for a single parent.
   */
  private async _viaReplace(
    targetTable: AtscriptDbTableLike & AtscriptDbWritable,
    junctionTable: AtscriptDbTableLike & AtscriptDbWritable,
    targets: unknown[],
    parentPK: unknown,
    targetPKField: string,
    fkToThisField: string,
    fkToTargetField: string,
    maxDepth: number,
    depth: number
  ): Promise<void> {
    // Delete existing junction rows
    await junctionTable.deleteMany({ [fkToThisField]: parentPK })

    const toReplace: Array<Record<string, unknown>> = []
    const toInsert: Array<Record<string, unknown>> = []
    const existingIds: unknown[] = []
    for (const t of targets) {
      const rec = t as Record<string, unknown>
      const pk = rec[targetPKField]
      if (pk !== undefined && pk !== null) {
        const keys = Object.keys(rec).filter(k => k !== targetPKField)
        if (keys.length > 0) {
          toReplace.push({ ...rec })
        }
        existingIds.push(pk)
      } else {
        toInsert.push({ ...rec })
      }
    }

    if (toReplace.length > 0) {
      await targetTable.bulkReplace(toReplace, { maxDepth, _depth: depth + 1 })
    }

    const allTargetIds: unknown[] = [...existingIds]
    if (toInsert.length > 0) {
      const insertResult = await targetTable.insertMany(toInsert, { maxDepth, _depth: depth + 1 })
      allTargetIds.push(...insertResult.insertedIds)
    }

    if (allTargetIds.length > 0) {
      const junctionRows = allTargetIds.map(targetId => ({
        [fkToThisField]: parentPK,
        [fkToTargetField]: targetId,
      }))
      await junctionTable.insertMany(junctionRows, { maxDepth: 0 })
    }
  }

  /**
   * Extracts patch operations from a nav field value.
   *
   * - Plain array → treated as `$replace`
   * - Object with `$insert`, `$remove`, etc. → individual ops
   */
  private _extractNavPatchOps(navValue: unknown): {
    replace?: unknown[]
    insert?: unknown[]
    remove?: unknown[]
    update?: unknown[]
    upsert?: unknown[]
  } {
    // Plain array → $replace
    if (Array.isArray(navValue)) {
      return { replace: navValue }
    }

    if (typeof navValue !== 'object' || navValue === null) {
      return {}
    }

    const obj = navValue as Record<string, unknown>
    return {
      replace: obj.$replace !== undefined ? obj.$replace as unknown[] : undefined,
      insert: obj.$insert !== undefined ? obj.$insert as unknown[] : undefined,
      remove: obj.$remove !== undefined ? obj.$remove as unknown[] : undefined,
      update: obj.$update !== undefined ? obj.$update as unknown[] : undefined,
      upsert: obj.$upsert !== undefined ? obj.$upsert as unknown[] : undefined,
    }
  }

  // ── Internal: validator building ──────────────────────────────────────────

  /**
   * Builds a validator for a given purpose with adapter plugins.
   *
   * Uses annotation-based `replace` callback to make `@meta.id` and
   * `@db.default` fields optional — works at all nesting levels
   * (including inside nav field target types).
   */
  protected _buildValidator(purpose: string): Validator<T, DataType> {
    const dbPlugin = createDbValidatorPlugin()
    const plugins = [
      ...this.adapter.getValidatorPlugins(),
      dbPlugin,
    ]

    /**
     * Forces nav fields non-optional so the plugin handles null/undefined
     * checks (validator skips optional+null before plugins run).
     */
    const forceNavNonOptional = (type: TAtscriptAnnotatedType): TAtscriptAnnotatedType => {
      if (type.metadata?.has('db.rel.to') || type.metadata?.has('db.rel.from') || type.metadata?.has('db.rel.via')) {
        return type.optional ? { ...type, optional: false } : type
      }
      return type
    }

    /** Makes PK, defaulted, and FK fields optional; forces nav fields non-optional. */
    const insertReplace = (type: TAtscriptAnnotatedType) => {
      if (type.metadata?.has('meta.id') || type.metadata?.has('db.default') || type.metadata?.has('db.default.increment') || type.metadata?.has('db.default.uuid') || type.metadata?.has('db.default.now') || type.metadata?.has('db.rel.FK')) {
        return { ...type, optional: true }
      }
      return forceNavNonOptional(type)
    }

    switch (purpose) {
      case 'insert': {
        return this.createValidator({
          plugins,
          replace: insertReplace,
        })
      }
      case 'patch': {
        return this.createValidator({
          plugins,
          partial: true,
          replace: forceNavNonOptional,
        })
      }
      case 'bulkReplace': {
        return this.createValidator({
          plugins,
          replace: insertReplace,
        })
      }
      case 'bulkUpdate': {
        const navFields = this._meta.navFields
        return this.createValidator({
          plugins,
          // Top level: partial (all fields optional in a patch).
          // Nav fields & their children: always partial (deep patch into related records).
          // Embedded objects: partial only if merge strategy; replace-strategy requires all fields.
          partial: (_def, path) => {
            if (path === '') { return true }
            const root = path.split('.')[0]
            if (navFields.has(root)) { return true }
            return _def.metadata.get('db.patch.strategy') === 'merge'
          },
          replace: forceNavNonOptional,
        })
      }
      default: {
        return this.createValidator({ plugins })
      }
    }
  }
}

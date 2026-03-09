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

import type { BaseDbAdapter } from './base-adapter'
import { DbError } from './db-error'
import type { TGenericLogger } from './logger'
import { decomposePatch } from './patch-decomposer'
import { AtscriptDbReadable } from './db-readable'
import { UniquSelect } from './uniqu-select'
import { createDbValidatorPlugin, type DbValidationContext } from './db-validator-plugin'
import type {
  TCascadeResolver,
  TDbDeleteResult,
  TDbInsertManyResult,
  TDbInsertResult,
  TDbUpdateResult,
  TFkLookupResolver,
  TFkLookupTarget,
  TTableResolver,
  TWriteTableResolver,
} from './types'

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
    this._flatten()
    const maxDepth = opts?.maxDepth ?? 3
    const depth = (opts as { _depth?: number })?._depth ?? 0
    const canNest = depth < maxDepth && this._writeTableResolver && this._navFields.size > 0
    if (!canNest && this._navFields.size > 0) { this._checkDepthOverflow(payloads as Array<Record<string, unknown>>, maxDepth) }

    return this.adapter.withTransaction(async () => {
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
        for (const navField of this._navFields) { delete data[navField] }
        prepared.push(this._prepareForWrite(data))
      }

      // Validate FK references (application-level, for adapters without native FK support)
      await this._validateForeignKeys(items)

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
    })
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
    this._flatten()
    const maxDepth = opts?.maxDepth ?? 3
    const depth = (opts as { _depth?: number })?._depth ?? 0
    const canNest = depth < maxDepth && this._writeTableResolver && this._navFields.size > 0
    if (!canNest && this._navFields.size > 0) { this._checkDepthOverflow(payloads as Array<Record<string, unknown>>, maxDepth) }

    return this.adapter.withTransaction(async () => {
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
      await this._validateForeignKeys(items)

      // Pre-validate FROM children (types + FK constraints) before the main replace
      if (canNest) {
        await this._preValidateNestedFrom(originals)
      }

      // Phase 2: Main replace — strip nav fields, prepare, replace each
      let matchedCount = 0
      let modifiedCount = 0
      for (const data of items) {
        for (const navField of this._navFields) { delete data[navField] }
        const filter = this._extractPrimaryKeyFilter(data)
        const prepared = this._prepareForWrite(data)
        const result = await this.adapter.replaceOne(
          this._translateFilter(filter),
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
    })
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
    this._flatten()
    const maxDepth = opts?.maxDepth ?? 3
    const depth = (opts as { _depth?: number })?._depth ?? 0
    const canNest = depth < maxDepth && this._writeTableResolver && this._navFields.size > 0
    if (!canNest && this._navFields.size > 0) { this._checkDepthOverflow(payloads as Array<Record<string, unknown>>, maxDepth) }

    return this.adapter.withTransaction(async () => {
      // Phase 0: Setup — validate full payload (plugin checks nav field constraints)
      const validator = this.getValidator('bulkUpdate')
      const ctx: DbValidationContext = { mode: 'patch' }
      this._validateBatch(validator, payloads as Array<Record<string, unknown>>, ctx)

      // Phase 1: TO relation patches
      if (canNest) {
        await this._batchPatchNestedTo(payloads as Array<Record<string, unknown>>, maxDepth, depth)
      }

      // Validate FK references (application-level, for adapters without native FK support)
      await this._validateForeignKeys(payloads as Array<Record<string, unknown>>, true)

      // Phase 2: Main patch — strip nav fields, decompose, update each
      let matchedCount = 0
      let modifiedCount = 0
      for (const payload of payloads) {
        const data = { ...payload } as Record<string, unknown>
        for (const navField of this._navFields) { delete data[navField] }
        const filter = this._extractPrimaryKeyFilter(data)

        // Strip PK fields from data — they're in the filter, not in the SET clause
        for (const pk of this._primaryKeys) { delete data[pk] }

        // Skip if nothing left to update (e.g. only nav props + PK in payload)
        if (Object.keys(data).length === 0) {
          matchedCount += 1
          modifiedCount += 0
          continue
        }

        let result: TDbUpdateResult
        if (this.adapter.supportsNativePatch()) {
          result = await this.adapter.nativePatch(this._translateFilter(filter), data)
        } else {
          const update = decomposePatch(data, this as AtscriptDbTable)
          result = await this.adapter.updateOne(
            this._translateFilter(filter),
            this._translatePatchKeys(update)
          )
        }
        matchedCount += result.matchedCount
        modifiedCount += result.modifiedCount
      }

      return { matchedCount, modifiedCount }
    })
  }

  /**
   * Deletes a single record by any type-compatible identifier — primary key
   * or single-field unique index. Uses the same resolution logic as `findById`.
   *
   * When the adapter does not support native foreign keys (e.g. MongoDB),
   * cascade and setNull actions are applied before the delete.
   */
  public async deleteOne(id: IdType): Promise<TDbDeleteResult> {
    this._flatten()
    const filter = this._resolveIdFilter(id)
    if (!filter) {
      return { deletedCount: 0 }
    }
    if (this._needsCascade()) {
      return this.adapter.withTransaction(async () => {
        await this._cascadeBeforeDelete(filter)
        return this.adapter.deleteOne(this._translateFilter(filter))
      })
    }
    return this.adapter.deleteOne(this._translateFilter(filter))
  }

  // ── Batch operations ──────────────────────────────────────────────────────

  public async updateMany(
    filter: FilterExpr<FlatType>,
    data: Partial<DataType> & Record<string, unknown>
  ): Promise<TDbUpdateResult> {
    this._flatten()
    await this._validateForeignKeys([data as Record<string, unknown>], true)
    return this.adapter.updateMany(
      this._translateFilter(filter as FilterExpr),
      this._prepareForWrite({ ...data })
    )
  }

  public async replaceMany(
    filter: FilterExpr<FlatType>,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult> {
    this._flatten()
    await this._validateForeignKeys([data])
    return this.adapter.replaceMany(
      this._translateFilter(filter as FilterExpr),
      this._prepareForWrite({ ...data })
    )
  }

  public async deleteMany(filter: FilterExpr<FlatType>): Promise<TDbDeleteResult> {
    this._flatten()
    if (this._needsCascade()) {
      return this.adapter.withTransaction(async () => {
        await this._cascadeBeforeDelete(filter as FilterExpr)
        return this.adapter.deleteMany(this._translateFilter(filter as FilterExpr))
      })
    }
    return this.adapter.deleteMany(this._translateFilter(filter as FilterExpr))
  }

  // ── Schema operations ─────────────────────────────────────────────────────

  /**
   * Synchronizes indexes between Atscript definitions and the database.
   */
  public async syncIndexes(): Promise<void> {
    this._flatten()
    return this.adapter.syncIndexes()
  }

  /**
   * Ensures the table/collection exists in the database.
   */
  public async ensureTable(): Promise<void> {
    this._flatten()
    return this.adapter.ensureTable()
  }

  // ── Internal: write preparation ───────────────────────────────────────────

  /**
   * Applies default values for fields that are missing from the payload.
   */
  protected _applyDefaults(data: Record<string, unknown>): Record<string, unknown> {
    for (const [field, def] of this._defaults.entries()) {
      if (data[field] === undefined) {
        if (def.kind === 'value') {
          const fieldType = this._flatMap?.get(field)
          const designType = fieldType?.type.kind === '' && (fieldType.type as { designType: string }).designType
          data[field] = designType === 'string' ? def.value : JSON.parse(def.value)
        } else if (def.kind === 'fn') {
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
   * Prepares a payload for writing to the database:
   * prepares IDs, strips ignored fields, flattens nested objects, maps column names.
   */
  protected _prepareForWrite(payload: Record<string, unknown>): Record<string, unknown> {
    const data = { ...payload }

    // Prepare primary key values
    for (const pk of this._primaryKeys) {
      if (data[pk] !== undefined) {
        const fieldType = this._flatMap?.get(pk)
        if (fieldType) {
          data[pk] = this.adapter.prepareId(data[pk], fieldType)
        }
      }
    }

    // Strip top-level ignored fields
    for (const field of this._ignoredFields) {
      if (!field.includes('.')) {
        delete data[field]
      }
    }

    // Fast path: no nested/json fields — just do column mapping
    if (!this._requiresMappings || this._nestedObjects) {
      for (const [logical, physical] of this._columnMap.entries()) {
        if (logical in data) {
          data[physical] = data[logical]
          delete data[logical]
        }
      }
      return data
    }

    // Flatten nested objects and apply physical names
    return this._flattenPayload(data)
  }

  /**
   * Flattens nested object fields into __-separated keys and
   * JSON-stringifies @db.json / array fields.
   */
  private _flattenPayload(data: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(data)) {
      this._writeFlattenedField(key, data[key], result)
    }
    return result
  }

  /**
   * Classifies and writes a single field to the result object.
   * Recurses into nested objects that should be flattened.
   */
  private _writeFlattenedField(
    path: string,
    value: unknown,
    result: Record<string, unknown>
  ): void {
    if (this._ignoredFields.has(path)) { return }

    if (this._flattenedParents.has(path)) {
      if (value === null || value === undefined) {
        this._setFlattenedChildrenNull(path, result)
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        const obj = value as Record<string, unknown>
        for (const key of Object.keys(obj)) {
          this._writeFlattenedField(`${path}.${key}`, obj[key], result)
        }
      }
    } else if (this._jsonFields.has(path)) {
      const physical = this._pathToPhysical.get(path) ?? path.replace(/\./g, '__')
      result[physical] = (value !== undefined && value !== null)
        ? JSON.stringify(value)
        : value
    } else {
      const physical = this._pathToPhysical.get(path) ?? path.replace(/\./g, '__')
      result[physical] = value
    }
  }

  /**
   * When a parent object is null/undefined, set all its flattened children to null.
   */
  private _setFlattenedChildrenNull(
    parentPath: string,
    result: Record<string, unknown>
  ): void {
    const prefix = `${parentPath}.`
    for (const [path, physical] of this._pathToPhysical.entries()) {
      if (path.startsWith(prefix)) {
        result[physical] = null
      }
    }
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
   * Translates dot-notation keys in a decomposed patch to physical column names.
   */
  protected _translatePatchKeys(update: Record<string, unknown>): Record<string, unknown> {
    if (!this._requiresMappings || this._nestedObjects) {
      return update
    }

    const result: Record<string, unknown> = {}
    const updateKeys = Object.keys(update)
    for (const key of updateKeys) {
      const value = update[key]
      // Handle array patch operator keys like "tags.__$insert"
      const operatorMatch = key.match(/^(.+?)(\.__\$.+)$/)
      const basePath = operatorMatch ? operatorMatch[1] : key
      const suffix = operatorMatch ? operatorMatch[2] : ''

      const physical = this._pathToPhysical.get(basePath) ?? basePath
      const finalKey = physical + suffix

      if (this._jsonFields.has(basePath) && typeof value === 'object' && value !== null && !suffix) {
        result[finalKey] = JSON.stringify(value)
      } else {
        result[finalKey] = value
      }
    }
    return result
  }

  // ── Internal: cascade delete ─────────────────────────────────────────────

  /**
   * Whether application-level cascade is needed for deletes.
   * True when the adapter doesn't handle FK constraints natively
   * and a cascade resolver is available.
   */
  private _needsCascade(): boolean {
    return !this.adapter.supportsNativeForeignKeys() && !!this._cascadeResolver
  }

  /**
   * Applies cascade/setNull actions on child tables before deleting parent records.
   * Finds all records matching `filter`, extracts their PK values, then for each
   * child table with a FK pointing to this table:
   * - `cascade`: recursively deletes child records
   * - `setNull`: sets FK fields to null
   * - `restrict`: throws if any children exist
   *
   * @param filter - Filter identifying parent records to be deleted (logical field names).
   */
  private async _cascadeBeforeDelete(filter: FilterExpr): Promise<void> {
    const targets = this._cascadeResolver!(this.tableName)
    if (targets.length === 0) { return }

    // Collect all fields referenced by FK targetFields across all cascade targets.
    // These are the parent fields that child FKs point to (e.g. 'id' in projectId: Project.id).
    // In MongoDB, this differs from _primaryKeys ('_id') — the FK references 'id', not '_id'.
    const neededLogical = new Set<string>()
    for (const t of targets) {
      for (const tf of t.fk.targetFields) { neededLogical.add(tf) }
    }

    // Map logical → physical for the adapter query, then back for FK matching
    const physicalToLogical = new Map<string, string>()
    const physicalFields: string[] = []
    for (const logical of neededLogical) {
      const physical = this._pathToPhysical.get(logical) ?? this._columnMap.get(logical) ?? logical
      physicalFields.push(physical)
      physicalToLogical.set(physical, logical)
    }
    const rawRecords = await this.adapter.findMany({
      filter: this._translateFilter(filter),
      controls: { $select: new UniquSelect(physicalFields) },
    })
    if (rawRecords.length === 0) { return }

    // Map physical column names back to logical for FK matching
    const records = rawRecords.map(r => {
      const mapped: Record<string, unknown> = {}
      for (const [key, val] of Object.entries(r)) {
        mapped[physicalToLogical.get(key) ?? key] = val
      }
      return mapped
    })

    for (const target of targets) {
      const action = target.fk.onDelete
      if (!action || action === 'noAction') { continue }

      // Build child filter: { fkField: { $in: parentPKValues } }
      // For composite FK: { $or: [{ fk1: pk1, fk2: pk2 }, ...] }
      const childFilter = this._buildCascadeChildFilter(records, target.fk)
      if (!childFilter) { continue }

      switch (action) {
        case 'cascade': {
          await target.deleteMany(childFilter)
          break
        }
        case 'setNull': {
          const nullData: Record<string, unknown> = {}
          for (const f of target.fk.fields) { nullData[f] = null }
          await target.updateMany(childFilter, nullData)
          break
        }
        case 'restrict': {
          const count = await target.count(childFilter)
          if (count > 0) {
            throw new DbError('CONFLICT', [{
              path: this.tableName,
              message: `Cannot delete from "${this.tableName}" — ${count} child record(s) in "${target.fk.fields.join(', ')}" reference it (RESTRICT)`,
            }])
          }
          break
        }
      }
    }
  }

  /**
   * Builds a filter for child records whose FK matches the deleted parent's PK values.
   */
  private _buildCascadeChildFilter(
    parentRecords: Array<Record<string, unknown>>,
    fk: { fields: string[]; targetFields: string[] }
  ): Record<string, unknown> | undefined {
    if (fk.fields.length === 1 && fk.targetFields.length === 1) {
      // Single-field FK: { fkField: { $in: [pk1, pk2, ...] } }
      const pkField = fk.targetFields[0]
      const values = parentRecords.map(r => r[pkField]).filter(v => v !== undefined && v !== null)
      if (values.length === 0) { return undefined }
      return values.length === 1
        ? { [fk.fields[0]]: values[0] }
        : { [fk.fields[0]]: { $in: values } }
    }

    // Composite FK: { $or: [{ fk1: pk1, fk2: pk2 }, ...] }
    const orFilters: Array<Record<string, unknown>> = []
    for (const record of parentRecords) {
      const condition: Record<string, unknown> = {}
      let valid = true
      for (let i = 0; i < fk.fields.length; i++) {
        const val = record[fk.targetFields[i]]
        if (val === undefined || val === null) { valid = false; break }
        condition[fk.fields[i]] = val
      }
      if (valid) { orFilters.push(condition) }
    }
    if (orFilters.length === 0) { return undefined }
    return orFilters.length === 1 ? orFilters[0] : { $or: orFilters }
  }

  // ── Internal: FK validation ─────────────────────────────────────────────

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
    this._flatten()

    // Type validation: apply defaults, validate full payload
    const validator = this.getValidator('insert')
    const ctx: DbValidationContext = { mode: 'insert' }
    const prepared = items.map(raw => this._applyDefaults({ ...raw }))
    this._validateBatch(validator, prepared, ctx)

    // FK validation
    await this._validateForeignKeys(items, false, opts?.excludeFkTargetTable)
  }

  /**
   * Validates that all FK field values reference existing records in target tables.
   * Only runs for adapters without native FK support (e.g. MongoDB).
   * No-op if the adapter has native FK support or no resolver is set.
   *
   * @param items - Records to validate (pre-write, logical field names).
   * @param partial - If true, only validate FK fields present in the data (for updates).
   * @param excludeTargetTable - Skip FKs referencing this table (for pre-validation of children).
   */
  private async _validateForeignKeys(
    items: Array<Record<string, unknown>>,
    partial?: boolean,
    excludeTargetTable?: string
  ): Promise<void> {
    if (this.adapter.supportsNativeForeignKeys() || !this._fkLookupResolver) { return }

    // Build all FK checks, then run in parallel
    const checks: Array<() => Promise<void>> = []

    for (const [, fk] of this._foreignKeys) {
      // Skip FKs that reference the excluded table (e.g. FROM child → parent during pre-validation)
      if (excludeTargetTable && fk.targetTable === excludeTargetTable) { continue }

      // Collect unique FK values across all items using Sets for O(1) dedup
      const valueSets: Array<Set<unknown>> = fk.fields.map(() => new Set<unknown>())

      for (const item of items) {
        // For partial updates, skip if none of the FK fields are in the payload
        if (partial && !fk.fields.some(f => f in item)) { continue }

        // Skip if any FK field is null/undefined (nullable FK — no constraint)
        let allPresent = true
        const vals: unknown[] = []
        for (const field of fk.fields) {
          const v = item[field]
          if (v === null || v === undefined) { allPresent = false; break }
          vals.push(v)
        }
        if (!allPresent) { continue }

        for (let i = 0; i < vals.length; i++) {
          valueSets[i].add(vals[i])
        }
      }

      if (valueSets[0].size === 0) { continue }

      // Resolve target table — try lookup resolver first, then write resolver as fallback
      let target: TFkLookupTarget | undefined = this._fkLookupResolver(fk.targetTable)
      if (!target && fk.targetTypeRef && this._writeTableResolver) {
        const resolved = this._writeTableResolver(fk.targetTypeRef())
        if (resolved) {
          target = { count: (filter: Record<string, unknown>) => resolved.count({ filter }) }
        }
      }
      if (!target) { continue }

      // Build filter on target table's fields and count matching records
      const filter: Record<string, unknown> = {}
      const valueArrays = valueSets.map(s => [...s])
      for (let i = 0; i < fk.targetFields.length; i++) {
        filter[fk.targetFields[i]] = valueArrays[i].length === 1
          ? valueArrays[i][0]
          : { $in: valueArrays[i] }
      }

      // For single-field FK: expected = unique values count
      // For composite FK: also use unique values per field (best we can do with flat filter)
      const expectedCount = valueArrays[0].length

      checks.push(async () => {
        const count = await target.count(filter)
        if (count < expectedCount) {
          const sample = valueArrays[0].slice(0, 3).join(', ')
          const suffix = valueArrays[0].length > 3 ? `, ... (${valueArrays[0].length} total)` : ''
          throw new DbError('FK_VIOLATION', [{
            path: fk.fields.join(', '),
            message: `FK constraint violation: "${fk.fields.join(', ')}" references non-existent record in "${fk.targetTable}" (values: ${sample}${suffix})`,
          }])
        }
      })
    }

    if (checks.length > 0) {
      await Promise.all(checks.map(fn => fn()))
    }
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
    for (const [navField, relation] of this._relations) {
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
    for (const [navField, relation] of this._relations) {
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
      await targetTable.preValidateItems(allChildren, { excludeFkTargetTable: this.tableName })
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
    for (const [navField, relation] of this._relations) {
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
    for (const [navField, relation] of this._relations) {
      if (relation.direction !== 'via' || !relation.viaType) { continue }

      const targetTable = this._writeTableResolver!(relation.targetType())
      if (!targetTable) { continue }
      const junctionTable = this._writeTableResolver!(relation.viaType())
      if (!junctionTable) { continue }

      const targetTableName = (relation.targetType()?.metadata?.get('db.table') as string) || relation.targetType()?.id || ''

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
    if (this._navFields.size === 0) { return }
    for (const payload of payloads) {
      for (const navField of this._navFields) {
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
      } catch (e) {
        if (e instanceof ValidatorError && items.length > 1) {
          throw new ValidatorError(e.errors.map(err => ({
            ...err,
            path: `[${i}].${err.path}`,
          })))
        }
        throw e
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
    } catch (e) {
      if (e instanceof ValidatorError) {
        throw new ValidatorError(AtscriptDbTable._prefixErrorPaths(e.errors, navField))
      }
      if (e instanceof DbError) {
        throw new DbError(e.code, AtscriptDbTable._prefixErrorPaths(e.errors, navField))
      }
      throw e
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
    for (const [navField, relation] of this._relations) {
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
    for (const [navField, relation] of this._relations) {
      if (relation.direction !== 'from') { continue }

      const targetTable = this._writeTableResolver!(relation.targetType())
      if (!targetTable) { continue }
      const remoteFK = this._findRemoteFK(targetTable, this.tableName, relation.alias)
      if (!remoteFK) { continue }

      const childPKs = [...targetTable.primaryKeys]
      for (const original of originals) {
        const children = original[navField]
        if (!Array.isArray(children)) { continue }
        const parentPK = this._primaryKeys.length === 1 ? original[this._primaryKeys[0]] : undefined
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
    for (const [navField, relation] of this._relations) {
      if (relation.direction !== 'via' || !relation.viaType) { continue }

      const targetTable = this._writeTableResolver!(relation.targetType())
      if (!targetTable) { continue }
      const junctionTable = this._writeTableResolver!(relation.viaType())
      if (!junctionTable) { continue }

      const targetTableName = (relation.targetType()?.metadata?.get('db.table') as string) || relation.targetType()?.id || ''

      const fkToThis = this._findRemoteFK(junctionTable, this.tableName)
      if (!fkToThis) { continue }
      const fkToTarget = this._findRemoteFK(junctionTable, targetTableName)
      if (!fkToTarget) { continue }

      const targetPKField = targetTable.primaryKeys[0]
      if (!targetPKField || fkToTarget.fields.length !== 1 || fkToThis.fields.length !== 1) { continue }

      for (const original of originals) {
        const targets = original[navField]
        if (!Array.isArray(targets)) { continue }

        const parentPK = this._primaryKeys.length === 1 ? original[this._primaryKeys[0]] : undefined
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
    for (const [navField, relation] of this._relations) {
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
      if (type.metadata?.has('meta.id') || type.metadata?.has('db.default') || type.metadata?.has('db.default.fn') || type.metadata?.has('db.rel.FK')) {
        return { ...type, optional: true }
      }
      return forceNavNonOptional(type)
    }

    switch (purpose) {
      case 'insert': {
        if (this.adapter.buildInsertValidator) {
          return this.adapter.buildInsertValidator(this as AtscriptDbTable) as Validator<T, DataType>
        }
        return this.createValidator({
          plugins,
          replace: insertReplace,
        })
      }
      case 'patch': {
        if (this.adapter.buildPatchValidator) {
          return this.adapter.buildPatchValidator(this as AtscriptDbTable) as Validator<T, DataType>
        }
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
        return this.createValidator({
          plugins,
          partial: 'deep',
          replace: forceNavNonOptional,
        })
      }
      default: {
        return this.createValidator({ plugins })
      }
    }
  }
}

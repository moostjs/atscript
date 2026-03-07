import {
  type FlatOf,
  type PrimaryKeyOf,
  type OwnPropsOf,
  type NavPropsOf,
  type TAtscriptAnnotatedType,
  type TAtscriptDataType,
  type Validator,
  type TValidatorPlugin,
} from '@atscript/typescript/utils'

import type { FilterExpr } from '@uniqu/core'

import type { BaseDbAdapter } from './base-adapter'
import type { TGenericLogger } from './logger'
import { decomposePatch } from './patch-decomposer'
import { AtscriptDbReadable } from './db-readable'
import type {
  TDbDeleteResult,
  TDbInsertManyResult,
  TDbInsertResult,
  TDbUpdateResult,
  TTableResolver,
  TWriteTableResolver,
} from './types'

export { resolveDesignType } from './db-readable'

/**
 * Validator plugin that skips navigational relation fields.
 * Fields annotated with `@db.rel.to` or `@db.rel.from` are virtual references
 * to other tables — they have no stored column and should not be validated.
 * Nested creation strips these fields before they reach the adapter.
 */
const navFieldsValidatorPlugin: TValidatorPlugin = (_ctx, def) => {
  if (
    def.metadata.has('db.rel.to') ||
    def.metadata.has('db.rel.from')
  ) {
    return true // Skip — nested creation or ignored
  }
  return undefined
}

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
    opts?: { maxDepth?: number; _depth?: number }
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
    opts?: { maxDepth?: number; _depth?: number }
  ): Promise<TDbInsertManyResult> {
    this._flatten()
    const maxDepth = opts?.maxDepth ?? 3
    const depth = opts?._depth ?? 0
    const canNest = depth < maxDepth && this._writeTableResolver && this._navFields.size > 0

    return this.adapter.withTransaction(async () => {
      // Clone + apply defaults (keep originals for FROM phase)
      const items = payloads.map(p => this._applyDefaults({ ...p }))

      // Phase 1: Batch TO dependencies (they must exist before we can set our FKs)
      if (canNest) {
        await this._batchInsertNestedTo(items, maxDepth, depth)
      }

      // Strip nav fields, validate, prepare
      const validator = this.getValidator('insert')
      const prepared: Array<Record<string, unknown>> = []
      for (const data of items) {
        for (const navField of this._navFields) { delete data[navField] }
        if (!validator.validate(data)) { throw new Error('Validation failed for insert') }
        prepared.push(this._prepareForWrite(data))
      }

      // Phase 2: Batch main insert
      const result = await this.adapter.insertMany(prepared)

      // Phase 3: Batch FROM dependents (they need our PKs)
      if (canNest) {
        await this._batchInsertNestedFrom(payloads, result.insertedIds, maxDepth, depth)
      }

      return result
    })
  }

  /**
   * Replaces a single record identified by primary key(s).
   * The payload must include primary key field(s).
   */
  public async replaceOne(
    payload: DataType & Record<string, unknown>
  ): Promise<TDbUpdateResult> {
    this._flatten()
    const validator = this.getValidator('update')
    if (!validator.validate(payload)) {
      throw new Error('Validation failed for replace')
    }
    const filter = this._extractPrimaryKeyFilter(payload)
    const data = this._prepareForWrite({ ...payload })
    return this.adapter.replaceOne(filter, data)
  }

  /**
   * Partially updates a single record identified by primary key(s).
   * Supports array patch operations (`$replace`, `$insert`, `$upsert`,
   * `$update`, `$remove`) for top-level array fields.
   */
  public async updateOne(
    payload: Partial<DataType> & Record<string, unknown>
  ): Promise<TDbUpdateResult> {
    this._flatten()
    const validator = this.getValidator('patch')
    if (!validator.validate(payload)) {
      throw new Error('Validation failed for update')
    }
    const filter = this._extractPrimaryKeyFilter(payload)

    if (this.adapter.supportsNativePatch()) {
      return this.adapter.nativePatch(this._translateFilter(filter), payload)
    }

    const update = decomposePatch(payload, this as AtscriptDbTable)
    return this.adapter.updateOne(this._translateFilter(filter), this._translatePatchKeys(update))
  }

  /**
   * Deletes a single record by any type-compatible identifier — primary key
   * or single-field unique index. Uses the same resolution logic as `findById`.
   */
  public async deleteOne(id: IdType): Promise<TDbDeleteResult> {
    this._flatten()
    const filter = this._resolveIdFilter(id)
    if (!filter) {
      return { deletedCount: 0 }
    }
    return this.adapter.deleteOne(this._translateFilter(filter))
  }

  // ── Batch operations ──────────────────────────────────────────────────────

  public async updateMany(
    filter: FilterExpr<FlatType>,
    data: Partial<DataType> & Record<string, unknown>
  ): Promise<TDbUpdateResult> {
    this._flatten()
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
    return this.adapter.replaceMany(
      this._translateFilter(filter as FilterExpr),
      this._prepareForWrite({ ...data })
    )
  }

  public async deleteMany(filter: FilterExpr<FlatType>): Promise<TDbDeleteResult> {
    this._flatten()
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
      throw new Error('No primary key defined — cannot extract filter')
    }
    const filter: FilterExpr = {}
    for (const field of pkFields) {
      if (payload[field] === undefined) {
        throw new Error(`Missing primary key field "${field}" in payload`)
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

      await targetTable.insertMany(allChildren, { maxDepth, _depth: depth + 1 })
    }
  }

  // ── Internal: validator building ──────────────────────────────────────────

  /**
   * Builds a validator for a given purpose with adapter plugins.
   */
  protected _buildValidator(purpose: string): Validator<T, DataType> {
    const plugins = [
      ...this.adapter.getValidatorPlugins(),
      navFieldsValidatorPlugin,
    ]

    switch (purpose) {
      case 'insert': {
        if (this.adapter.buildInsertValidator) {
          return this.adapter.buildInsertValidator(this as AtscriptDbTable) as Validator<T, DataType>
        }
        return this.createValidator({
          plugins,
          replace: (type, path) => {
            // Make primary key fields and fields with defaults optional for insert
            if (this._primaryKeys.includes(path) || this._defaults.has(path)) {
              return { ...type, optional: true }
            }
            return type
          },
        })
      }
      case 'patch': {
        if (this.adapter.buildPatchValidator) {
          return this.adapter.buildPatchValidator(this as AtscriptDbTable) as Validator<T, DataType>
        }
        return this.createValidator({
          plugins,
          partial: true,
        })
      }
      default: {
        return this.createValidator({ plugins })
      }
    }
  }
}

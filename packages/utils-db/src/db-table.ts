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
    def.metadata.has('db.rel.to' as keyof AtscriptMetadata) ||
    def.metadata.has('db.rel.from' as keyof AtscriptMetadata)
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
   * Inserts a single record.
   * Applies defaults, validates, prepares ID, maps columns, strips ignored fields.
   *
   * Supports **nested creation**: if the payload includes data for navigation
   * fields (`@db.rel.to` / `@db.rel.from`), related records are created
   * automatically. TO dependencies are created first (their PK becomes our FK),
   * FROM dependents are created after (they receive our PK as their FK).
   * Recursive up to `maxDepth` (default 3).
   */
  public async insertOne(
    payload: Partial<DataType> & Record<string, unknown>,
    opts?: { maxDepth?: number; _depth?: number }
  ): Promise<TDbInsertResult> {
    this._flatten()
    const data = this._applyDefaults({ ...payload })
    const maxDepth = opts?.maxDepth ?? 3
    const depth = opts?._depth ?? 0

    // Phase 1: Create TO dependencies (they must exist before we can set our FK)
    const hasNestedData = depth < maxDepth && this._writeTableResolver && this._navFields.size > 0
    if (hasNestedData) {
      await this._insertNestedTo(data, maxDepth, depth)
    }

    // Strip nav fields before validation (FROM data preserved in original payload)
    for (const navField of this._navFields) {
      delete data[navField]
    }

    const validator = this.getValidator('insert')
    if (!validator.validate(data)) {
      throw new Error('Validation failed for insert')
    }
    const result = await this.adapter.insertOne(this._prepareForWrite(data))

    // Phase 2: Create FROM dependents (they need our PK)
    if (hasNestedData) {
      await this._insertNestedFrom(payload as Record<string, unknown>, result.insertedId, maxDepth, depth)
    }

    return result
  }

  /**
   * Inserts multiple records.
   */
  public async insertMany(
    payloads: Array<Partial<DataType> & Record<string, unknown>>
  ): Promise<TDbInsertManyResult> {
    this._flatten()
    const validator = this.getValidator('insert')
    const prepared: Array<Record<string, unknown>> = []
    for (const payload of payloads) {
      const data = this._applyDefaults({ ...payload })
      if (!validator.validate(data)) {
        throw new Error('Validation failed for insert')
      }
      prepared.push(this._prepareForWrite(data))
    }
    return this.adapter.insertMany(prepared)
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

    const update = decomposePatch(payload, this)
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

  // ── Internal: nested creation ────────────────────────────────────────────

  /**
   * Creates TO dependencies before the main insert.
   * For each `@db.rel.to` nav field with an object value, inserts the
   * related record first and sets the FK on the main payload.
   */
  private async _insertNestedTo(
    data: Record<string, unknown>,
    maxDepth: number,
    depth: number
  ): Promise<void> {
    for (const [navField, relation] of this._relations) {
      if (relation.direction !== 'to') continue
      const nested = data[navField]
      if (!nested || typeof nested !== 'object' || Array.isArray(nested)) continue

      const targetType = relation.targetType()
      const targetTable = this._writeTableResolver!(targetType)
      if (!targetTable) continue

      const fk = this._findFKForRelation(relation)
      if (!fk) continue

      const result = await targetTable.insertOne(
        nested as Record<string, unknown>,
        { maxDepth, _depth: depth + 1 }
      )

      // Set FK field(s) on main payload
      if (fk.localFields.length === 1) {
        data[fk.localFields[0]] = result.insertedId
      }
      delete data[navField]
    }
  }

  /**
   * Creates FROM dependents after the main insert.
   * For each `@db.rel.from` nav field with an array value, inserts each
   * child with the FK set to the parent's insertedId.
   */
  private async _insertNestedFrom(
    originalPayload: Record<string, unknown>,
    parentId: unknown,
    maxDepth: number,
    depth: number
  ): Promise<void> {
    for (const [navField, relation] of this._relations) {
      if (relation.direction !== 'from') continue
      const children = originalPayload[navField]
      if (!Array.isArray(children) || children.length === 0) continue

      const targetType = relation.targetType()
      const targetTable = this._writeTableResolver!(targetType)
      if (!targetTable) continue

      const remoteFK = this._findRemoteFK(targetTable, this.tableName, relation.alias)
      if (!remoteFK) continue

      const promises = children.map((child) => {
        const childData = { ...(child as Record<string, unknown>) }
        if (remoteFK.fields.length === 1) {
          childData[remoteFK.fields[0]] = parentId
        }
        return targetTable.insertOne(childData, { maxDepth, _depth: depth + 1 })
      })
      await Promise.all(promises)
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
          return this.adapter.buildInsertValidator(this) as Validator<T, DataType>
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
          return this.adapter.buildPatchValidator(this) as Validator<T, DataType>
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

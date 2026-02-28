import {
  flattenAnnotatedType,
  isAnnotatedType,
  type TAtscriptAnnotatedType,
  type TAtscriptDataType,
  type TAtscriptTypeObject,
  type TMetadataMap,
  type Validator,
  type TValidatorOptions,
} from '@atscript/typescript/utils'

import type { BaseDbAdapter } from './base-adapter'
import type { TGenericLogger } from './logger'
import { NoopLogger } from './logger'
import { decomposePatch } from './patch-decomposer'
import type {
  TDbDefaultValue,
  TDbDeleteResult,
  TDbFieldMeta,
  TDbFilter,
  TDbFindOptions,
  TDbIndex,
  TDbIndexField,
  TDbInsertManyResult,
  TDbInsertResult,
  TDbProjection,
  TDbUpdateResult,
  TIdDescriptor,
} from './types'

const INDEX_PREFIX = 'atscript__'

/**
 * Resolves the design type from an annotated type.
 * Encapsulates the `kind === ''` check and fallback logic that
 * otherwise trips up every adapter author.
 */
export function resolveDesignType(fieldType: TAtscriptAnnotatedType): string {
  if (fieldType.type.kind === '') {
    return (fieldType.type as any).designType ?? 'string'
  }
  if (fieldType.type.kind === 'object') { return 'object' }
  if (fieldType.type.kind === 'array') { return 'array' }
  return 'string'
}

function indexKey(type: string, name: string): string {
  const cleanName = name
    .replace(/[^a-z0-9_.-]/gi, '_')
    .replace(/_+/g, '_')
    .slice(0, 127 - INDEX_PREFIX.length - type.length - 2)
  return `${INDEX_PREFIX}${type}__${cleanName}`
}

/**
 * Generic database table abstraction driven by Atscript `@db.*` annotations.
 *
 * Accepts an annotated type marked with `@db.table` and a {@link BaseDbAdapter}
 * instance. Pre-computes indexes, column mappings, defaults, and primary keys
 * from annotations, then delegates actual database operations to the adapter.
 *
 * This class is **concrete** (not abstract) — extend it for cross-cutting
 * concerns like field-level permissions, audit logging, etc. Extensions
 * work with any adapter.
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
> {
  /** Resolved table/collection name. */
  public readonly tableName: string

  /** Database schema/namespace from `@db.schema` (if set). */
  public readonly schema: string | undefined

  // ── Lazy-computed field analysis ──────────────────────────────────────────

  protected _flatMap?: Map<string, TAtscriptAnnotatedType>
  protected _fieldDescriptors?: TDbFieldMeta[]
  protected _indexes = new Map<string, TDbIndex>()
  protected _primaryKeys: string[] = []
  protected _columnMap = new Map<string, string>()
  protected _defaults = new Map<string, TDbDefaultValue>()
  protected _ignoredFields = new Set<string>()
  protected _uniqueProps = new Set<string>()

  // ── Validators ────────────────────────────────────────────────────────────

  protected readonly validators = new Map<string, Validator<T, DataType>>()

  constructor(
    protected readonly _type: T,
    protected readonly adapter: BaseDbAdapter,
    protected readonly logger: TGenericLogger = NoopLogger
  ) {
    if (!isAnnotatedType(_type)) {
      throw new Error('Atscript Annotated Type expected')
    }
    if (_type.type.kind !== 'object') {
      throw new Error('Database table type must be an object type')
    }

    const adapterName = adapter.getAdapterTableName?.(_type)
    const dbTable = _type.metadata.get('db.table') as string | undefined
    const fallbackName = _type.id || ''

    this.tableName = adapterName || dbTable || fallbackName
    if (!this.tableName) {
      throw new Error('@db.table annotation or adapter-specific table name expected')
    }

    this.schema = _type.metadata.get('db.schema') as string | undefined

    // Establish bidirectional relationship
    adapter.registerTable(this)
  }

  // ── Public getters ────────────────────────────────────────────────────────

  /** The raw annotated type. */
  public get type(): TAtscriptAnnotatedType<TAtscriptTypeObject> {
    return this._type as TAtscriptAnnotatedType<TAtscriptTypeObject>
  }

  /** Lazily-built flat map of all fields (dot-notation paths → annotated types). */
  public get flatMap(): Map<string, TAtscriptAnnotatedType> {
    this._flatten()
    return this._flatMap!
  }

  /** All computed indexes from `@db.index.*` annotations. */
  public get indexes(): Map<string, TDbIndex> {
    this._flatten()
    return this._indexes
  }

  /** Primary key field names from `@meta.id`. */
  public get primaryKeys(): readonly string[] {
    this._flatten()
    return this._primaryKeys
  }

  /** Logical → physical column name mapping from `@db.column`. */
  public get columnMap(): ReadonlyMap<string, string> {
    this._flatten()
    return this._columnMap
  }

  /** Default values from `@db.default.*`. */
  public get defaults(): ReadonlyMap<string, TDbDefaultValue> {
    this._flatten()
    return this._defaults
  }

  /** Fields excluded from DB via `@db.ignore`. */
  public get ignoredFields(): ReadonlySet<string> {
    this._flatten()
    return this._ignoredFields
  }

  /** Single-field unique index properties. */
  public get uniqueProps(): ReadonlySet<string> {
    this._flatten()
    return this._uniqueProps
  }

  /** Descriptor for the primary ID field(s). */
  public getIdDescriptor(): TIdDescriptor {
    this._flatten()
    return {
      fields: [...this._primaryKeys],
      isComposite: this._primaryKeys.length > 1,
    }
  }

  /**
   * Pre-computed field metadata for adapter use.
   * Filters root entry, resolves designType, physicalName, optional —
   * encapsulating all the type introspection gotchas.
   */
  public get fieldDescriptors(): readonly TDbFieldMeta[] {
    this._flatten()
    if (!this._fieldDescriptors) {
      this._fieldDescriptors = []
      for (const [path, type] of this._flatMap!.entries()) {
        if (!path) { continue } // skip root entry
        this._fieldDescriptors.push({
          path,
          type,
          physicalName: this._columnMap.get(path) ?? path,
          designType: resolveDesignType(type),
          optional: type.optional === true,
          isPrimaryKey: this._primaryKeys.includes(path),
          ignored: this._ignoredFields.has(path),
          defaultValue: this._defaults.get(path),
        })
      }
    }
    return this._fieldDescriptors
  }

  /**
   * Resolves a projection to a list of field names to include.
   * - `undefined` → `undefined` (all fields)
   * - `string[]` → pass through
   * - `Record<K, 1>` → extract included keys
   * - `Record<K, 0>` → invert using known field names
   */
  public resolveProjection(projection?: TDbProjection<DataType>): string[] | undefined {
    if (!projection) { return undefined }

    if (Array.isArray(projection)) {
      return projection.length > 0 ? projection : undefined
    }

    const entries = Object.entries(projection)
    if (entries.length === 0) { return undefined }

    const firstVal = entries[0][1]
    if (firstVal === 1) {
      // Inclusion — return listed fields
      return entries.filter(([, v]) => v === 1).map(([k]) => k)
    }

    // Exclusion — invert using known non-ignored field names
    const excluded = new Set(entries.filter(([, v]) => v === 0).map(([k]) => k))
    return this.fieldDescriptors
      .filter(f => !f.ignored && !excluded.has(f.path))
      .map(f => f.path)
  }

  // ── Validation ────────────────────────────────────────────────────────────

  /**
   * Creates a new validator with custom options.
   * Adapter plugins are NOT automatically included — use {@link getValidator}
   * for the standard validator with adapter plugins.
   */
  public createValidator(opts?: Partial<TValidatorOptions>): Validator<T, DataType> {
    return this._type.validator(opts) as Validator<T, DataType>
  }

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
   */
  public async insertOne(
    payload: Partial<DataType> & Record<string, unknown>
  ): Promise<TDbInsertResult> {
    this._flatten()
    const data = this._applyDefaults({ ...payload })
    const validator = this.getValidator('insert')
    if (!validator.validate(data)) {
      throw new Error('Validation failed for insert')
    }
    return this.adapter.insertOne(this._prepareForWrite(data))
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
      return this.adapter.nativePatch(filter, payload)
    }

    const update = decomposePatch(payload, this)
    return this.adapter.updateOne(filter, update)
  }

  /**
   * Deletes a single record by primary key value.
   */
  public async deleteOne(id: unknown): Promise<TDbDeleteResult> {
    this._flatten()
    const pkFields = this.primaryKeys
    if (pkFields.length === 0) {
      throw new Error('No primary key defined — cannot delete by ID')
    }
    const filter: TDbFilter = {}
    if (pkFields.length === 1) {
      const field = pkFields[0]
      const fieldType = this.flatMap.get(field)
      filter[field] = fieldType ? this.adapter.prepareId(id, fieldType) : id
    } else {
      // Composite key: id must be an object
      const idObj = id as Record<string, unknown>
      for (const field of pkFields) {
        const fieldType = this.flatMap.get(field)
        filter[field] = fieldType ? this.adapter.prepareId(idObj[field], fieldType) : idObj[field]
      }
    }
    return this.adapter.deleteOne(filter)
  }

  /**
   * Finds a single record matching the filter.
   */
  public async findOne(
    filter: TDbFilter<DataType>,
    options?: TDbFindOptions<DataType>
  ): Promise<DataType | null> {
    return this.adapter.findOne(filter as TDbFilter, options as TDbFindOptions) as Promise<DataType | null>
  }

  /**
   * Finds all records matching the filter.
   */
  public async findMany(
    filter: TDbFilter<DataType>,
    options?: TDbFindOptions<DataType>
  ): Promise<DataType[]> {
    return this.adapter.findMany(filter as TDbFilter, options as TDbFindOptions) as Promise<DataType[]>
  }

  /**
   * Counts records matching the filter.
   */
  public async count(filter: TDbFilter<DataType> = {} as TDbFilter<DataType>): Promise<number> {
    return this.adapter.count(filter as TDbFilter)
  }

  // ── Batch operations ──────────────────────────────────────────────────────

  public async updateMany(
    filter: TDbFilter<DataType>,
    data: Partial<DataType> & Record<string, unknown>
  ): Promise<TDbUpdateResult> {
    return this.adapter.updateMany(filter as TDbFilter, data)
  }

  public async replaceMany(
    filter: TDbFilter<DataType>,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult> {
    return this.adapter.replaceMany(filter as TDbFilter, data)
  }

  public async deleteMany(filter: TDbFilter<DataType>): Promise<TDbDeleteResult> {
    return this.adapter.deleteMany(filter as TDbFilter)
  }

  // ── Schema operations ─────────────────────────────────────────────────────

  /**
   * Synchronizes indexes between Atscript definitions and the database.
   * Delegates to the adapter, which uses `this._table.indexes`.
   */
  public async syncIndexes(): Promise<void> {
    this._flatten() // ensure indexes are computed
    return this.adapter.syncIndexes()
  }

  /**
   * Ensures the table/collection exists in the database.
   */
  public async ensureTable(): Promise<void> {
    this._flatten()
    return this.adapter.ensureTable()
  }

  // ── Internal: field flattening ────────────────────────────────────────────

  protected _flatten(): void {
    if (this._flatMap) {
      return
    }

    this.adapter.onBeforeFlatten?.(this._type)

    this._flatMap = flattenAnnotatedType(this.type, {
      topLevelArrayTag: this.adapter.getTopLevelArrayTag?.() ?? 'db.__topLevelArray',
      excludePhantomTypes: true,
      onField: (path, type, metadata) => {
        this._scanGenericAnnotations(path, metadata)
        this.adapter.onFieldScanned?.(path, type, metadata)
      },
    })

    this._finalizeIndexes()
    this.adapter.onAfterFlatten?.()
  }

  /**
   * Scans `@db.*` and `@meta.id` annotations on a field during flattening.
   */
  private _scanGenericAnnotations(
    fieldName: string,
    metadata: TMetadataMap<AtscriptMetadata>
  ): void {
    // @meta.id → primary key (no-arg annotation: metadata.has checks existence)
    if (metadata.has('meta.id')) {
      this._primaryKeys.push(fieldName)
    }

    // @db.column → column mapping
    const column = metadata.get('db.column') as string | undefined
    if (column) {
      this._columnMap.set(fieldName, column)
    }

    // @db.default.value or @db.default.fn
    const defaultValue = metadata.get('db.default.value') as string | undefined
    const defaultFn = metadata.get('db.default.fn') as string | undefined
    if (defaultValue !== undefined) {
      this._defaults.set(fieldName, { kind: 'value', value: defaultValue })
    } else if (defaultFn !== undefined) {
      this._defaults.set(fieldName, {
        kind: 'fn',
        fn: defaultFn as 'increment' | 'uuid' | 'now',
      })
    }

    // @db.ignore
    if (metadata.has('db.ignore')) {
      this._ignoredFields.add(fieldName)
    }

    // @db.index.plain
    for (const index of (metadata.get('db.index.plain') as any[]) || []) {
      const name = index === true ? fieldName : (index?.name || fieldName)
      const sort = (index === true ? undefined : index?.sort) || 'asc'
      this._addIndexField('plain', name, fieldName, sort as 'asc' | 'desc')
    }

    // @db.index.unique (single arg → raw string or { name })
    for (const index of (metadata.get('db.index.unique') as any[]) || []) {
      const name = index === true ? fieldName : (typeof index === 'string' ? index : (index?.name || fieldName))
      this._addIndexField('unique', name, fieldName)
    }

    // @db.index.fulltext (single arg → raw string or { name })
    for (const index of (metadata.get('db.index.fulltext') as any[]) || []) {
      const name = index === true ? fieldName : (typeof index === 'string' ? index : (index?.name || fieldName))
      this._addIndexField('fulltext', name, fieldName)
    }
  }

  // ── Internal: index helpers ───────────────────────────────────────────────

  protected _addIndexField(
    type: TDbIndex['type'],
    name: string,
    field: string,
    sort: 'asc' | 'desc' = 'asc'
  ): void {
    const key = indexKey(type, name)
    const index = this._indexes.get(key)
    const indexField: TDbIndexField = { name: field, sort }
    if (index) {
      index.fields.push(indexField)
    } else {
      this._indexes.set(key, {
        key,
        name,
        type,
        fields: [indexField],
      })
    }
  }

  private _finalizeIndexes(): void {
    for (const index of this._indexes.values()) {
      if (index.type === 'unique' && index.fields.length === 1) {
        this._uniqueProps.add(index.fields[0].name)
      }
    }
  }

  // ── Internal: write preparation ───────────────────────────────────────────

  /**
   * Applies default values for fields that are missing from the payload.
   * Called before validation so that defaults satisfy required field constraints.
   */
  protected _applyDefaults(data: Record<string, unknown>): Record<string, unknown> {
    for (const [field, def] of this._defaults.entries()) {
      if (data[field] === undefined) {
        if (def.kind === 'value') {
          data[field] = def.value
        }
        // 'fn' defaults (increment, uuid, now) are handled by the DB/adapter
      }
    }
    return data
  }

  /**
   * Prepares a payload for writing to the database:
   * prepares IDs, strips ignored fields, maps column names.
   * Defaults should be applied before this via `_applyDefaults`.
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

    // Strip ignored fields
    for (const field of this._ignoredFields) {
      delete data[field]
    }

    // Map column names (logical → physical)
    for (const [logical, physical] of this._columnMap.entries()) {
      if (logical in data) {
        data[physical] = data[logical]
        delete data[logical]
      }
    }

    return data
  }

  /**
   * Extracts primary key field(s) from a payload to build a filter.
   */
  protected _extractPrimaryKeyFilter(payload: Record<string, unknown>): TDbFilter {
    const pkFields = this.primaryKeys
    if (pkFields.length === 0) {
      throw new Error('No primary key defined — cannot extract filter')
    }
    const filter: TDbFilter = {}
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

  // ── Internal: validator building ──────────────────────────────────────────

  /**
   * Builds a validator for a given purpose with adapter plugins.
   */
  protected _buildValidator(purpose: string): Validator<T, DataType> {
    const plugins = this.adapter.getValidatorPlugins()

    switch (purpose) {
      case 'insert': {
        return this.createValidator({
          plugins,
          replace: (type, path) => {
            // Make primary key fields optional for insert (auto-generation)
            if (this._primaryKeys.includes(path)) {
              return { ...type, optional: true }
            }
            return type
          },
        })
      }
      case 'update': {
        return this.createValidator({ plugins })
      }
      case 'patch': {
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

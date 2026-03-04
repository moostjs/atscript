import {
  flattenAnnotatedType,
  isAnnotatedType,
  type FlatOf,
  type PrimaryKeyOf,
  type TAtscriptAnnotatedType,
  type TAtscriptDataType,
  type TAtscriptTypeObject,
  type TMetadataMap,
  type Validator,
  type TValidatorOptions,
} from '@atscript/typescript/utils'

import type { FilterExpr, UniqueryControls, Uniquery } from '@uniqu/core'

import type { BaseDbAdapter, InferNativeCalls } from './base-adapter'
import type { TGenericLogger } from './logger'
import { NoopLogger } from './logger'
import { decomposePatch } from './patch-decomposer'
import type {
  TDbDefaultFn,
  TDbDefaultValue,
  TDbDeleteResult,
  TDbFieldMeta,
  TDbIndex,
  TDbIndexField,
  TDbInsertManyResult,
  TDbInsertResult,
  TDbStorageType,
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
  FlatType = FlatOf<T>,
  A extends BaseDbAdapter<any> = BaseDbAdapter,
  IdType = PrimaryKeyOf<T>,
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

  // ── Embedded object mapping ──────────────────────────────────────────────

  /** Logical dot-path → physical column name. */
  protected _pathToPhysical = new Map<string, string>()
  /** Physical column name → logical dot-path (inverse). */
  protected _physicalToPath = new Map<string, string>()
  /** Object paths being flattened into __-separated columns (no column themselves). */
  protected _flattenedParents = new Set<string>()
  /** Fields stored as JSON (@db.json + array fields). */
  protected _jsonFields = new Set<string>()
  /** Intermediate paths → their leaf physical column names (for $select expansion in relational DBs). */
  protected _selectExpansion = new Map<string, string[]>()
  /** Fast-path flag: skip all mapping when no nested/json fields exist. */
  protected _requiresMappings = false

  // ── Adapter capabilities (cached) ────────────────────────────────────────

  /** Cached result of adapter.supportsNestedObjects(). */
  protected readonly _nestedObjects: boolean

  // ── Validators ────────────────────────────────────────────────────────────

  protected readonly validators = new Map<string, Validator<T, DataType>>()

  constructor(
    protected readonly _type: T,
    protected readonly adapter: A,
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

    this._nestedObjects = adapter.supportsNestedObjects()

    // Establish bidirectional relationship
    adapter.registerTable(this)
  }

  // ── Public getters ────────────────────────────────────────────────────────

  /** Returns the underlying adapter with its concrete type preserved. */
  public getAdapter(): A {
    return this.adapter
  }

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

  /**
   * Registers an additional primary key field.
   * Useful for adapters (e.g., MongoDB) where `_id` is always the primary key
   * even without an explicit `@meta.id` annotation.
   *
   * Typically called from {@link BaseDbAdapter.onFieldScanned}.
   */
  public addPrimaryKey(field: string): void {
    if (!this._primaryKeys.includes(field)) {
      this._primaryKeys.push(field)
    }
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

  /** Precomputed logical dot-path → physical column name map. */
  public get pathToPhysical(): ReadonlyMap<string, string> {
    this._flatten()
    return this._pathToPhysical
  }

  /** Precomputed physical column name → logical dot-path map (inverse). */
  public get physicalToPath(): ReadonlyMap<string, string> {
    this._flatten()
    return this._physicalToPath
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
      const skipFlattening = this._nestedObjects

      for (const [path, type] of this._flatMap!.entries()) {
        if (!path) { continue } // skip root entry

        // Skip parent objects that are being flattened (they have no column)
        if (!skipFlattening && this._flattenedParents.has(path)) {
          continue
        }

        // Skip children of @db.json fields (they live inside the JSON blob)
        if (!skipFlattening && this._findAncestorInSet(path, this._jsonFields) !== undefined) {
          continue
        }

        const isJson = this._jsonFields.has(path)
        const isFlattened = !skipFlattening && this._findAncestorInSet(path, this._flattenedParents) !== undefined
        const designType = isJson ? 'json' : resolveDesignType(type)

        let storage: TDbStorageType
        if (skipFlattening) {
          storage = 'column'
        } else if (isJson) {
          storage = 'json'
        } else if (isFlattened) {
          storage = 'flattened'
        } else {
          storage = 'column'
        }

        const physicalName = skipFlattening
          ? (this._columnMap.get(path) ?? path)
          : (this._pathToPhysical.get(path) ?? this._columnMap.get(path) ?? path)

        this._fieldDescriptors.push({
          path,
          type,
          physicalName,
          designType,
          optional: type.optional === true,
          isPrimaryKey: this._primaryKeys.includes(path),
          ignored: this._ignoredFields.has(path),
          defaultValue: this._defaults.get(path),
          storage,
          flattenedFrom: isFlattened ? path : undefined,
        })
      }
      Object.freeze(this._fieldDescriptors)
    }
    return this._fieldDescriptors
  }

  /**
   * Resolves `$select` from {@link UniqueryControls} to a list of field names.
   * - `undefined` → `undefined` (all fields)
   * - `string[]` → pass through
   * - `Record<K, 1>` → extract included keys
   * - `Record<K, 0>` → invert using known field names
   */
  public resolveProjection(select?: UniqueryControls['$select']): string[] | undefined {
    if (!select) { return undefined }

    if (Array.isArray(select)) {
      return select.length > 0 ? select : undefined
    }

    const selectObj = select as Record<string, number>
    const keys = Object.keys(selectObj)
    if (keys.length === 0) { return undefined }

    if (selectObj[keys[0]] === 1) {
      // Inclusion — return listed fields
      const result: string[] = []
      for (const k of keys) {
        if (selectObj[k] === 1) { result.push(k) }
      }
      return result
    }

    // Exclusion — invert using known non-ignored field names
    const excluded = new Set<string>()
    for (const k of keys) {
      if (selectObj[k] === 0) { excluded.add(k) }
    }
    const result: string[] = []
    for (const f of this.fieldDescriptors) {
      if (!f.ignored && !excluded.has(f.path)) { result.push(f.path) }
    }
    return result
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
      return this.adapter.nativePatch(this._translateFilter(filter), payload)
    }

    const update = decomposePatch(payload, this)
    return this.adapter.updateOne(this._translateFilter(filter), this._translatePatchKeys(update))
  }

  /**
   * Deletes a single record by primary key value.
   */
  public async deleteOne(id: IdType): Promise<TDbDeleteResult> {
    this._flatten()
    const pkFields = this.primaryKeys
    if (pkFields.length === 0) {
      throw new Error('No primary key defined — cannot delete by ID')
    }
    const filter: FilterExpr = {}
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
    return this.adapter.deleteOne(this._translateFilter(filter))
  }

  /**
   * Finds a single record matching the query.
   */
  public async findOne(
    query: Uniquery<FlatType>
  ): Promise<DataType | null> {
    this._flatten()
    const translatedQuery = this._translateQuery(query as Uniquery)
    const result = await this.adapter.findOne(translatedQuery)
    return result ? this._reconstructFromRead(result) as DataType : null
  }

  /**
   * Finds all records matching the query.
   */
  public async findMany(
    query: Uniquery<FlatType>
  ): Promise<DataType[]> {
    this._flatten()
    const translatedQuery = this._translateQuery(query as Uniquery)
    const results = await this.adapter.findMany(translatedQuery)
    return results.map(row => this._reconstructFromRead(row)) as DataType[]
  }

  /**
   * Counts records matching the query.
   */
  public async count(query?: Uniquery<FlatType>): Promise<number> {
    this._flatten()
    query ??= { filter: {}, controls: {} } as Uniquery<FlatType>
    return this.adapter.count(this._translateQuery(query as Uniquery))
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

  // ── Native calls ─────────────────────────────────────────────────────────

  /**
   * Executes an adapter-specific native call.
   * Type safety is inferred from the adapter's {@link TNativeCallMap}.
   *
   * @example
   * ```typescript
   * // With MongoAdapter:
   * const table = new AtscriptDbTable(type, mongoAdapter)
   * const cursor = table.nativeCall('aggregate', pipeline) // AggregationCursor
   * ```
   */
  nativeCall<K extends keyof InferNativeCalls<A> & string>(
    name: K,
    opts: InferNativeCalls<A>[K]['args']
  ): InferNativeCalls<A>[K]['result'] {
    return this.adapter.nativeCall(name, opts)
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

    // Classify fields and build path maps (before finalizing indexes)
    if (!this._nestedObjects) {
      this._classifyFields()
    }

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
        fn: defaultFn as TDbDefaultFn,
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
      this._addIndexField('plain', name, fieldName, { sort: sort as 'asc' | 'desc' })
    }

    // @db.index.unique (single arg → raw string or { name })
    for (const index of (metadata.get('db.index.unique') as any[]) || []) {
      const name = index === true ? fieldName : (typeof index === 'string' ? index : (index?.name || fieldName))
      this._addIndexField('unique', name, fieldName)
    }

    // @db.index.fulltext (args: name?, weight?)
    for (const index of (metadata.get('db.index.fulltext') as any[]) || []) {
      const name = index === true ? fieldName : (typeof index === 'string' ? index : (index?.name || fieldName))
      const weight = (index !== true && typeof index === 'object') ? index?.weight : undefined
      this._addIndexField('fulltext', name, fieldName, { weight })
    }

    // @db.json → mark as JSON storage
    if (metadata.has('db.json')) {
      this._jsonFields.add(fieldName)

      // J2: warn if any index is also present on this field
      const hasIndex = metadata.has('db.index.plain')
        || metadata.has('db.index.unique')
        || metadata.has('db.index.fulltext')
      if (hasIndex) {
        this.logger.warn(
          `@db.index on a @db.json field "${fieldName}" — most databases cannot index into JSON columns`
        )
      }
    }
  }

  // ── Internal: index helpers ───────────────────────────────────────────────

  protected _addIndexField(
    type: TDbIndex['type'],
    name: string,
    field: string,
    opts?: { sort?: 'asc' | 'desc'; weight?: number }
  ): void {
    const key = indexKey(type, name)
    const index = this._indexes.get(key)
    const indexField: TDbIndexField = { name: field, sort: opts?.sort ?? 'asc' }
    if (opts?.weight !== undefined) {
      indexField.weight = opts.weight
    }
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

  /**
   * Classifies each field as column, flattened, json, or parent-object.
   * Builds the bidirectional _pathToPhysical / _physicalToPath maps.
   * Only called when the adapter does NOT support nested objects natively.
   */
  private _classifyFields(): void {
    // Pass 1: identify parent objects and JSON fields
    for (const [path, type] of this._flatMap!.entries()) {
      if (!path) { continue }

      const designType = resolveDesignType(type)
      const isJson = this._jsonFields.has(path)
      const isArray = designType === 'array'
      const isObject = designType === 'object'

      if (isArray) {
        this._jsonFields.add(path)
      } else if (isObject && isJson) {
        // Already in _jsonFields from @db.json detection
      } else if (isObject && !isJson) {
        this._flattenedParents.add(path)
      }
    }

    // Propagate @db.ignore from parent objects to their children
    for (const ignoredField of this._ignoredFields) {
      if (this._flattenedParents.has(ignoredField)) {
        const prefix = `${ignoredField}.`
        for (const path of this._flatMap!.keys()) {
          if (path.startsWith(prefix)) {
            this._ignoredFields.add(path)
          }
        }
      }
    }

    // J4: @db.column on a flattened parent is invalid
    for (const parentPath of this._flattenedParents) {
      if (this._columnMap.has(parentPath)) {
        throw new Error(
          `@db.column cannot rename a flattened object field "${parentPath}" — ` +
          `apply @db.column to individual nested fields, or use @db.json to store as a single column`
        )
      }
    }

    // Pass 2: build physical name maps for all non-parent fields
    for (const [path] of this._flatMap!.entries()) {
      if (!path) { continue }
      if (this._flattenedParents.has(path)) { continue }
      // Skip children of @db.json fields — they live inside the JSON blob
      if (this._findAncestorInSet(path, this._jsonFields) !== undefined) { continue }

      const isFlattened = this._findAncestorInSet(path, this._flattenedParents) !== undefined
      const physicalName = this._columnMap.get(path)
        ?? (isFlattened ? path.replace(/\./g, '__') : path)

      this._pathToPhysical.set(path, physicalName)
      this._physicalToPath.set(physicalName, path)
    }

    // Build select expansion map: intermediate path → leaf physical column names
    for (const parentPath of this._flattenedParents) {
      const prefix = `${parentPath}.`
      const leaves: string[] = []
      for (const [path, physical] of this._pathToPhysical) {
        if (path.startsWith(prefix)) {
          leaves.push(physical)
        }
      }
      if (leaves.length > 0) {
        this._selectExpansion.set(parentPath, leaves)
      }
    }

    this._requiresMappings = this._flattenedParents.size > 0 || this._jsonFields.size > 0
  }

  /**
   * Finds the nearest ancestor of `path` that belongs to `set`.
   * Used to locate flattened parents and @db.json ancestors.
   */
  private _findAncestorInSet(path: string, set: ReadonlySet<string>): string | undefined {
    let pos = path.length
    while ((pos = path.lastIndexOf('.', pos - 1)) !== -1) {
      const ancestor = path.slice(0, pos)
      if (set.has(ancestor)) {
        return ancestor
      }
    }
    return undefined
  }

  private _finalizeIndexes(): void {
    // Always resolve index field names to physical names.
    // Uses _pathToPhysical when available (covers both @db.column and __ flattening),
    // falls back to _columnMap for @db.column-only cases.
    for (const index of this._indexes.values()) {
      for (const field of index.fields) {
        field.name = this._pathToPhysical.get(field.name)
          ?? this._columnMap.get(field.name)
          ?? field.name
      }
    }

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
   * prepares IDs, strips ignored fields, flattens nested objects, maps column names.
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
   * Uses _pathToPhysical for final key names.
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

  // ── Internal: read reconstruction ────────────────────────────────────────

  /**
   * Reconstructs nested objects from flat __-separated column values.
   * JSON fields are parsed from strings back to objects/arrays.
   */
  protected _reconstructFromRead(row: Record<string, unknown>): Record<string, unknown> {
    if (!this._requiresMappings || this._nestedObjects) {
      return row
    }

    const result: Record<string, unknown> = {}

    const rowKeys = Object.keys(row)
    for (const physical of rowKeys) {
      const value = row[physical]
      const logicalPath = this._physicalToPath.get(physical)

      if (!logicalPath) {
        // Unknown column — pass through as-is
        result[physical] = value
        continue
      }

      if (this._jsonFields.has(logicalPath)) {
        // JSON field — parse if it's a string
        const parsed = typeof value === 'string' ? JSON.parse(value) : value
        this._setNestedValue(result, logicalPath, parsed)
      } else if (logicalPath.includes('.')) {
        // Flattened field — reconstruct nesting
        this._setNestedValue(result, logicalPath, value)
      } else {
        // Top-level scalar
        result[logicalPath] = value
      }
    }

    // Collapse null parent objects
    for (const parentPath of this._flattenedParents) {
      this._reconstructNullParent(result, parentPath)
    }

    return result
  }

  /**
   * Sets a value at a dot-notation path, creating intermediate objects as needed.
   */
  private _setNestedValue(
    obj: Record<string, unknown>,
    dotPath: string,
    value: unknown
  ): void {
    const parts = dotPath.split('.')
    let current: Record<string, unknown> = obj

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      if (current[part] === undefined || current[part] === null) {
        current[part] = {}
      }
      current = current[part] as Record<string, unknown>
    }

    current[parts[parts.length - 1]] = value
  }

  /**
   * If all children of a flattened parent are null, collapse the parent to null.
   */
  private _reconstructNullParent(
    obj: Record<string, unknown>,
    parentPath: string
  ): void {
    const parts = parentPath.split('.')
    let current: Record<string, unknown> = obj
    for (let i = 0; i < parts.length - 1; i++) {
      if (current[parts[i]] === undefined) { return }
      current = current[parts[i]] as Record<string, unknown>
    }

    const lastPart = parts[parts.length - 1]
    const parentObj = current[lastPart]
    if (typeof parentObj !== 'object' || parentObj === null) { return }

    let allNull = true
    const parentKeys = Object.keys(parentObj as Record<string, unknown>)
    for (const k of parentKeys) {
      const v = (parentObj as Record<string, unknown>)[k]
      if (v !== null && v !== undefined) {
        allNull = false
        break
      }
    }

    if (allNull) {
      const parentType = this._flatMap?.get(parentPath)
      current[lastPart] = parentType?.optional ? null : {}
    }
  }

  // ── Internal: query translation ──────────────────────────────────────────

  /**
   * Translates a Uniquery's filter, sort, and projection from logical
   * dot-notation paths to physical column names.
   */
  private _translateQuery(query: Uniquery): Uniquery {
    if (!this._requiresMappings || this._nestedObjects) {
      return query
    }
    return {
      filter: this._translateFilter(query.filter),
      controls: query.controls ? this._translateControls(query.controls) : query.controls,
      insights: (query as any).insights,
    }
  }

  /**
   * Recursively translates field names in a filter expression.
   */
  private _translateFilter(filter: FilterExpr): FilterExpr {
    if (!filter || typeof filter !== 'object') { return filter }
    if (!this._requiresMappings) { return filter }

    const result: Record<string, unknown> = {}

    const filterKeys = Object.keys(filter)
    for (const key of filterKeys) {
      const value = (filter as Record<string, unknown>)[key]
      if (key === '$and' || key === '$or') {
        result[key] = (value as FilterExpr[]).map(f => this._translateFilter(f))
      } else if (key === '$not') {
        result[key] = this._translateFilter(value as FilterExpr)
      } else if (key.startsWith('$')) {
        result[key] = value
      } else {
        const physical = this._pathToPhysical.get(key) ?? key
        result[physical] = value
      }
    }

    return result as FilterExpr
  }

  /**
   * Translates field names in sort and projection controls.
   */
  private _translateControls(controls: UniqueryControls): UniqueryControls {
    if (!controls) { return controls }

    const result: UniqueryControls = { ...controls }

    if (controls.$sort) {
      const translated: Record<string, unknown> = {}
      const sortObj = controls.$sort as Record<string, unknown>
      const sortKeys = Object.keys(sortObj)
      for (const key of sortKeys) {
        // Skip intermediate (parent) paths — sorting by a parent object is meaningless in relational DBs
        if (this._flattenedParents.has(key)) { continue }
        const physical = this._pathToPhysical.get(key) ?? key
        translated[physical] = sortObj[key]
      }
      result.$sort = translated as UniqueryControls['$sort']
    }

    if (controls.$select) {
      if (Array.isArray(controls.$select)) {
        const expanded: string[] = []
        for (const key of controls.$select) {
          const expansion = this._selectExpansion.get(key as string)
          if (expansion) {
            // Intermediate path — expand to all leaf physical columns
            expanded.push(...expansion)
          } else {
            expanded.push((this._pathToPhysical.get(key as string) ?? key) as string)
          }
        }
        result.$select = expanded
      } else {
        const translated: Record<string, unknown> = {}
        const selectObj = controls.$select as Record<string, number>
        const selectKeys = Object.keys(selectObj)
        for (const key of selectKeys) {
          const val = selectObj[key]
          const expansion = this._selectExpansion.get(key)
          if (expansion) {
            // Intermediate path — expand to all leaf physical columns
            for (const leaf of expansion) {
              translated[leaf] = val
            }
          } else {
            const physical = this._pathToPhysical.get(key) ?? key
            translated[physical] = val
          }
        }
        result.$select = translated as UniqueryControls['$select']
      }
    }

    return result
  }

  /**
   * Translates dot-notation keys in a decomposed patch to physical column names.
   */
  private _translatePatchKeys(update: Record<string, unknown>): Record<string, unknown> {
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

  // ── Internal: validator building ──────────────────────────────────────────

  /**
   * Builds a validator for a given purpose with adapter plugins.
   */
  protected _buildValidator(purpose: string): Validator<T, DataType> {
    const plugins = this.adapter.getValidatorPlugins()

    switch (purpose) {
      case 'insert': {
        if (this.adapter.buildInsertValidator) {
          return this.adapter.buildInsertValidator(this) as Validator<T, DataType>
        }
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

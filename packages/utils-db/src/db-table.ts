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
  type TValidatorPlugin,
} from '@atscript/typescript/utils'

import type { FilterExpr, UniqueryControls, Uniquery, WithRelation } from '@uniqu/core'

import type { BaseDbAdapter } from './base-adapter'
import type { TGenericLogger } from './logger'
import { NoopLogger } from './logger'
import { decomposePatch } from './patch-decomposer'
import { UniquSelect } from './uniqu-select'
import type {
  DbControls,
  DbQuery,
  TDbDefaultFn,
  TDbDefaultValue,
  TDbDeleteResult,
  TDbFieldMeta,
  TDbForeignKey,
  TDbIndex,
  TDbIndexField,
  TDbInsertManyResult,
  TDbInsertResult,
  TDbRelation,
  TDbStorageType,
  TDbUpdateResult,
  TIdDescriptor,
  TSearchIndexInfo,
  TTableResolver,
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

/**
 * Checks whether an id value is type-compatible with a field's design type.
 * Used by `findById` to skip primary-key lookup when the id clearly can't match,
 * falling through to unique-property search instead.
 */
function isIdCompatible(id: unknown, fieldType: TAtscriptAnnotatedType): boolean {
  const dt = resolveDesignType(fieldType)
  switch (dt) {
    case 'number': {
      if (typeof id === 'number') { return true }
      if (typeof id === 'string') { return id !== '' && !Number.isNaN(Number(id)) }
      return false
    }
    case 'boolean': {
      return typeof id === 'boolean'
    }
    case 'object':
    case 'array': {
      return typeof id === 'object' && id !== null
    }
    default: { // 'string' and unknown design types
      return typeof id === 'string'
    }
  }
}

/** Coerces a storage value (0/1/null) back to a JS boolean. */
function toBool(value: unknown): unknown {
  if (value === null || value === undefined) { return value }
  return !!value
}

/** Minimal interface for a resolved related table. */
interface TResolvedTable {
  findMany(query: unknown): Promise<Array<Record<string, unknown>>>
  primaryKeys: readonly string[]
  relations: ReadonlyMap<string, TDbRelation>
  foreignKeys: ReadonlyMap<string, TDbForeignKey>
}

/** Per-relation filter + controls bundle. */
interface TRelationQuery {
  filter: FilterExpr | undefined
  controls: Record<string, unknown>
}

/**
 * If controls include an array-style $select, ensure the given join fields
 * are present so that FK matching works after the query returns.
 */
function ensureSelectIncludesFields(
  controls: Record<string, unknown> | undefined,
  fields: string[]
): Record<string, unknown> | undefined {
  if (!controls) { return controls }
  const sel = controls.$select
  if (!Array.isArray(sel)) { return controls }
  const augmented = [...sel]
  for (const f of fields) {
    if (!augmented.includes(f)) { augmented.push(f) }
  }
  return { ...controls, $select: augmented }
}

function compositeKey(fields: string[], obj: Record<string, unknown>): string {
  return fields.map(f => String(obj[f] ?? '')).join('\0')
}

/** Collects unique non-null values for a field across rows. */
function collectUniqueValues(rows: Array<Record<string, unknown>>, field: string): unknown[] {
  const set = new Set<unknown>()
  for (const row of rows) {
    const v = row[field]
    if (v !== null && v !== undefined) { set.add(v) }
  }
  return [...set]
}

interface TAssignOpts {
  rows: Array<Record<string, unknown>>
  related: Array<Record<string, unknown>>
  localField: string
  remoteField: string
  relName: string
}

/** Assigns related items grouped by FK value (one-to-many). */
function assignGrouped(opts: TAssignOpts): void {
  const { rows, related, localField, remoteField, relName } = opts
  const groups = new Map<unknown, Array<Record<string, unknown>>>()
  for (const item of related) {
    const key = item[remoteField]
    let group = groups.get(key)
    if (!group) {
      group = []
      groups.set(key, group)
    }
    group.push(item)
  }
  for (const row of rows) {
    row[relName] = groups.get(row[localField]) ?? []
  }
}

/** Assigns related items by FK value (many-to-one / one-to-one). */
function assignSingle(opts: TAssignOpts): void {
  const { rows, related, localField, remoteField, relName } = opts
  const index = new Map<unknown, Record<string, unknown>>()
  for (const item of related) {
    const key = item[remoteField]
    if (!index.has(key)) { index.set(key, item) }
  }
  for (const row of rows) {
    row[relName] = index.get(row[localField]) ?? null
  }
}

function indexKey(type: string, name: string): string {
  const cleanName = name
    .replace(/[^a-z0-9_.-]/gi, '_')
    .replace(/_+/g, '_')
    .slice(0, 127 - INDEX_PREFIX.length - type.length - 2)
  return `${INDEX_PREFIX}${type}__${cleanName}`
}

/**
 * Validator plugin that skips navigational relation fields.
 * Fields annotated with `@db.rel.to` or `@db.rel.from` are virtual references
 * to other tables — they have no stored column and should not be validated.
 */
const navFieldsValidatorPlugin: TValidatorPlugin = (ctx, def, value) => {
  if (
    def.metadata.has('db.rel.to' as keyof AtscriptMetadata) ||
    def.metadata.has('db.rel.from' as keyof AtscriptMetadata)
  ) {
    if (value !== undefined) {
      ctx.error(`Navigational field is not allowed in input`)
      return false
    }
    return true
  }
  return undefined
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
  A extends BaseDbAdapter = BaseDbAdapter,
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
  protected _navFields = new Set<string>()
  protected _uniqueProps = new Set<string>()
  protected _foreignKeys = new Map<string, TDbForeignKey>()
  protected _relations = new Map<string, TDbRelation>()

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
  /** Physical column names of boolean fields (for storage coercion on read). */
  protected _booleanFields = new Set<string>()
  /** Fast-path flag: skip all mapping when no nested/json fields exist. */
  protected _requiresMappings = false
  /** All non-ignored physical field names (for UniquSelect exclusion inversion). */
  protected _allPhysicalFields: string[] = []

  // ── Adapter capabilities (cached) ────────────────────────────────────────

  /** Cached result of adapter.supportsNestedObjects(). */
  protected readonly _nestedObjects: boolean

  // ── Validators ────────────────────────────────────────────────────────────

  protected readonly validators = new Map<string, Validator<T, DataType>>()

  constructor(
    protected readonly _type: T,
    protected readonly adapter: A,
    protected readonly logger: TGenericLogger = NoopLogger,
    protected readonly _tableResolver?: TTableResolver
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

  /**
   * Removes a field from the primary key list.
   * Useful for adapters (e.g., MongoDB) where `@meta.id` fields should be
   * unique indexes rather than part of the primary key.
   */
  public removePrimaryKey(field: string): void {
    const idx = this._primaryKeys.indexOf(field)
    if (idx >= 0) {
      this._primaryKeys.splice(idx, 1)
    }
  }

  /**
   * Registers a field as having a unique constraint.
   * Used by adapters to ensure `findById` falls back to this field.
   */
  public addUniqueField(field: string): void {
    this._uniqueProps.add(field)
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

  /** Navigational fields (`@db.rel.to` / `@db.rel.from`) — not stored as columns. */
  public get navFields(): ReadonlySet<string> {
    this._flatten()
    return this._navFields
  }

  /** Single-field unique index properties. */
  public get uniqueProps(): ReadonlySet<string> {
    this._flatten()
    return this._uniqueProps
  }

  /** Foreign key constraints from `@db.rel.FK` annotations. */
  public get foreignKeys(): ReadonlyMap<string, TDbForeignKey> {
    this._flatten()
    return this._foreignKeys
  }

  /** Navigational relation metadata from `@db.rel.to` / `@db.rel.from`. */
  public get relations(): ReadonlyMap<string, TDbRelation> {
    this._flatten()
    return this._relations
  }

  /** The underlying database adapter instance. */
  public get dbAdapter(): A {
    return this.adapter
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

  /**
   * Finds a single record matching the query.
   */
  public async findOne(
    query: Uniquery<FlatType>
  ): Promise<DataType | null> {
    this._flatten()
    const withRelations = (query.controls as UniqueryControls)?.$with as WithRelation[] | undefined
    const translatedQuery = this._translateQuery(query as Uniquery)
    const result = await this.adapter.findOne(translatedQuery)
    if (!result) { return null }
    const row = this._reconstructFromRead(result)
    if (withRelations?.length) {
      await this._loadRelations([row], withRelations)
    }
    return row as DataType
  }

  /**
   * Finds all records matching the query.
   */
  public async findMany(
    query: Uniquery<FlatType>
  ): Promise<DataType[]> {
    this._flatten()
    const withRelations = (query.controls as UniqueryControls)?.$with as WithRelation[] | undefined
    const translatedQuery = this._translateQuery(query as Uniquery)
    const results = await this.adapter.findMany(translatedQuery)
    const rows = results.map(row => this._reconstructFromRead(row))
    if (withRelations?.length) {
      await this._loadRelations(rows, withRelations)
    }
    return rows as DataType[]
  }

  /**
   * Counts records matching the query.
   */
  public async count(query?: Uniquery<FlatType>): Promise<number> {
    this._flatten()
    query ??= { filter: {}, controls: {} } as Uniquery<FlatType>
    return this.adapter.count(this._translateQuery(query as Uniquery))
  }

  // ── Paginated queries ────────────────────────────────────────────────────

  /**
   * Finds records and total count in a single logical call.
   * Adapters may optimize into a single query (e.g., MongoDB `$facet`).
   */
  public async findManyWithCount(
    query: Uniquery<FlatType>
  ): Promise<{ data: DataType[]; count: number }> {
    this._flatten()
    const withRelations = (query.controls as UniqueryControls)?.$with as WithRelation[] | undefined
    const translated = this._translateQuery(query as Uniquery)
    const result = await this.adapter.findManyWithCount(translated)
    const rows = result.data.map(row => this._reconstructFromRead(row))
    if (withRelations?.length) {
      await this._loadRelations(rows, withRelations)
    }
    return {
      data: rows as DataType[],
      count: result.count,
    }
  }

  // ── Search ──────────────────────────────────────────────────────────────

  /** Whether the underlying adapter supports text search. */
  public isSearchable(): boolean {
    return this.adapter.isSearchable()
  }

  /** Returns available search indexes from the adapter. */
  public getSearchIndexes(): TSearchIndexInfo[] {
    return this.adapter.getSearchIndexes()
  }

  /**
   * Full-text search with query translation and result reconstruction.
   *
   * @param text - Search text.
   * @param query - Filter, sort, limit, etc.
   * @param indexName - Optional search index to target.
   */
  public async search(
    text: string,
    query: Uniquery<FlatType>,
    indexName?: string
  ): Promise<DataType[]> {
    this._flatten()
    const withRelations = (query.controls as UniqueryControls)?.$with as WithRelation[] | undefined
    const translated = this._translateQuery(query as Uniquery)
    const results = await this.adapter.search(text, translated, indexName)
    const rows = results.map(row => this._reconstructFromRead(row))
    if (withRelations?.length) {
      await this._loadRelations(rows, withRelations)
    }
    return rows as DataType[]
  }

  /**
   * Full-text search with count for paginated search results.
   *
   * @param text - Search text.
   * @param query - Filter, sort, limit, etc.
   * @param indexName - Optional search index to target.
   */
  public async searchWithCount(
    text: string,
    query: Uniquery<FlatType>,
    indexName?: string
  ): Promise<{ data: DataType[]; count: number }> {
    this._flatten()
    const withRelations = (query.controls as UniqueryControls)?.$with as WithRelation[] | undefined
    const translated = this._translateQuery(query as Uniquery)
    const result = await this.adapter.searchWithCount(text, translated, indexName)
    const rows = result.data.map(row => this._reconstructFromRead(row))
    if (withRelations?.length) {
      await this._loadRelations(rows, withRelations)
    }
    return {
      data: rows as DataType[],
      count: result.count,
    }
  }

  // ── Find by ID ──────────────────────────────────────────────────────────

  /**
   * Finds a single record by any type-compatible identifier — primary key
   * or single-field unique index.
   *
   * Collects all fields whose type matches the given id into an `$or` query.
   * For example, if PK is `id: string` and there is a unique `email: string`,
   * calling `findById('value')` queries `{ $or: [{ id: 'value' }, { email: 'value' }] }`.
   *
   * @param id - Identifier value (scalar for single PK, object for composite).
   * @param controls - Optional query controls ($select, etc.).
   */
  public async findById(
    id: IdType,
    controls?: UniqueryControls<FlatType>
  ): Promise<DataType | null> {
    this._flatten()
    const filter = this._resolveIdFilter(id)
    if (!filter) {
      return null
    }
    return await this.findOne({
      filter,
      controls: controls || {},
    } as Uniquery<FlatType>)
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
        this._scanGenericAnnotations(path, type, metadata)
        this.adapter.onFieldScanned?.(path, type, metadata)
      },
    })

    // Strip entries nested under navigational relation fields (e.g. "projects.status"
    // when "projects" is @db.rel.from). These are traversed by flattenAnnotatedType but
    // are not stored columns — their defaults, indexes, etc. must be discarded.
    if (this._navFields.size > 0) {
      this._purgeNavFieldDescendants()
    }

    // Classify fields and build path maps (before finalizing indexes)
    if (!this._nestedObjects) {
      this._classifyFields()
    }

    this._finalizeIndexes()
    this.adapter.onAfterFlatten?.()

    // Build physical field list for UniquSelect exclusion inversion
    if (this._nestedObjects && this._flatMap) {
      // Native nested: physical = logical paths (top-level fields from flatMap)
      for (const path of this._flatMap.keys()) {
        if (path && !this._ignoredFields.has(path)) {
          this._allPhysicalFields.push(path)
        }
      }
    } else {
      for (const physical of this._pathToPhysical.values()) {
        this._allPhysicalFields.push(physical)
      }
    }
  }

  /**
   * Scans `@db.*` and `@meta.id` annotations on a field during flattening.
   */
  private _scanGenericAnnotations(
    fieldName: string,
    fieldType: TAtscriptAnnotatedType,
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

    // @db.rel.to / @db.rel.from → navigational field, not a stored column
    if (metadata.has('db.rel.to' as keyof AtscriptMetadata) || metadata.has('db.rel.from' as keyof AtscriptMetadata)) {
      this._navFields.add(fieldName)
      this._ignoredFields.add(fieldName)

      const direction = metadata.has('db.rel.to' as keyof AtscriptMetadata) ? 'to' as const : 'from' as const
      const raw = metadata.get(`db.rel.${direction}` as keyof AtscriptMetadata)
      const alias = (raw === true ? undefined : raw) as string | undefined
      const isArr = fieldType.type.kind === 'array'
      const elementType = isArr
        ? (fieldType.type as unknown as { of: TAtscriptAnnotatedType }).of
        : fieldType
      // Resolve ref to get the actual target type (e.g., Project class from refTo(() => Project))
      const resolveTarget = () => elementType?.ref?.type() ?? elementType
      this._relations.set(fieldName, {
        direction,
        alias,
        targetType: resolveTarget,
        isArray: isArr,
      })
    }

    // @db.rel.FK → foreign key constraint metadata
    if (metadata.has('db.rel.FK' as keyof AtscriptMetadata)) {
      const raw = metadata.get('db.rel.FK' as keyof AtscriptMetadata)
      const alias = (raw === true ? undefined : raw) as string | undefined
      if (fieldType.ref) {
        const refTarget = fieldType.ref.type()
        const targetTable = (refTarget?.metadata?.get('db.table' as keyof AtscriptMetadata) as string) || refTarget?.id || ''
        const targetField = fieldType.ref.field
        const key = alias || `__auto_${fieldName}`
        const existing = this._foreignKeys.get(key)
        if (existing) {
          existing.fields.push(fieldName)
          existing.targetFields.push(targetField)
        } else {
          this._foreignKeys.set(key, {
            fields: [fieldName],
            targetTable,
            targetFields: [targetField],
            alias,
          })
        }
      }
    }

    // @db.rel.onDelete / @db.rel.onUpdate → referential actions on FK
    const onDelete = metadata.get('db.rel.onDelete' as keyof AtscriptMetadata) as string | undefined
    const onUpdate = metadata.get('db.rel.onUpdate' as keyof AtscriptMetadata) as string | undefined
    if (onDelete || onUpdate) {
      for (const fk of this._foreignKeys.values()) {
        if (fk.fields.includes(fieldName)) {
          if (onDelete) { fk.onDelete = onDelete as TDbForeignKey['onDelete'] }
          if (onUpdate) { fk.onUpdate = onUpdate as TDbForeignKey['onUpdate'] }
          break
        }
      }
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

  /**
   * Removes entries nested under nav field prefixes from all internal maps.
   * Called after flattening to discard defaults/indexes/column mappings that
   * were registered for fields inside navigational relations.
   */
  private _purgeNavFieldDescendants(): void {
    const isUnderNav = (path: string) => {
      for (const nav of this._navFields) {
        if (path.startsWith(`${nav}.`)) { return true }
      }
      return false
    }

    for (const key of this._defaults.keys()) {
      if (isUnderNav(key)) { this._defaults.delete(key) }
    }
    for (const key of this._columnMap.keys()) {
      if (isUnderNav(key)) { this._columnMap.delete(key) }
    }
    for (const key of this._jsonFields) {
      if (isUnderNav(key)) { this._jsonFields.delete(key) }
    }
    this._primaryKeys = this._primaryKeys.filter(k => !isUnderNav(k))

    // Purge index fields that reference nav-descendant paths
    for (const [, index] of this._indexes) {
      index.fields = index.fields.filter(f => !isUnderNav(f.name))
    }
    // Remove empty indexes
    for (const [name, index] of this._indexes) {
      if (index.fields.length === 0) { this._indexes.delete(name) }
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

      const fieldType = this._flatMap?.get(path)
      if (fieldType && resolveDesignType(fieldType) === 'boolean') {
        this._booleanFields.add(physicalName)
      }
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
    // Collect single-field unique indexes BEFORE resolving to physical names,
    // so that uniqueProps stores logical names (matching flatMap keys).
    for (const index of this._indexes.values()) {
      if (index.type === 'unique' && index.fields.length === 1) {
        this._uniqueProps.add(index.fields[0].name)
      }
    }

    // Resolve index field names to physical names for adapter use.
    // Uses _pathToPhysical when available (covers both @db.column and __ flattening),
    // falls back to _columnMap for @db.column-only cases.
    for (const index of this._indexes.values()) {
      for (const field of index.fields) {
        field.name = this._pathToPhysical.get(field.name)
          ?? this._columnMap.get(field.name)
          ?? field.name
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
      return this._coerceBooleans(row)
    }

    const result: Record<string, unknown> = {}

    const rowKeys = Object.keys(row)
    for (const physical of rowKeys) {
      const value = this._booleanFields.has(physical) ? toBool(row[physical]) : row[physical]
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
   * Coerces boolean fields from storage representation (0/1) to JS booleans.
   * Used on the fast-path when no column mapping is needed.
   */
  private _coerceBooleans(row: Record<string, unknown>): Record<string, unknown> {
    if (this._booleanFields.size === 0) { return row }
    for (const field of this._booleanFields) {
      if (field in row) {
        row[field] = toBool(row[field])
      }
    }
    return row
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
   * Always wraps `$select` in {@link UniquSelect}.
   */
  private _translateQuery(query: Uniquery): DbQuery {
    if (!this._requiresMappings || this._nestedObjects) {
      const controls = query.controls
      return {
        filter: query.filter,
        controls: {
          ...controls,
          $with: undefined, // $with is handled by the table layer, not passed to adapters
          $select: controls?.$select
            ? new UniquSelect(controls.$select, this._allPhysicalFields)
            : undefined,
        },
      }
    }
    return {
      filter: this._translateFilter(query.filter),
      controls: query.controls ? this._translateControls(query.controls) : {},
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
   * Wraps `$select` in {@link UniquSelect} after path translation.
   */
  private _translateControls(controls: UniqueryControls): DbControls {
    if (!controls) { return {} }

    const result: DbControls = { ...controls, $select: undefined, $with: undefined }

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
      let translatedRaw: UniqueryControls['$select']
      if (Array.isArray(controls.$select)) {
        const expanded: string[] = []
        for (const key of controls.$select) {
          const expansion = this._selectExpansion.get(key as string)
          if (expansion) {
            expanded.push(...expansion)
          } else {
            expanded.push((this._pathToPhysical.get(key as string) ?? key) as string)
          }
        }
        translatedRaw = expanded
      } else {
        const translated: Record<string, number> = {}
        const selectObj = controls.$select as Record<string, number>
        const selectKeys = Object.keys(selectObj)
        for (const key of selectKeys) {
          const val = selectObj[key]
          const expansion = this._selectExpansion.get(key)
          if (expansion) {
            for (const leaf of expansion) {
              translated[leaf] = val
            }
          } else {
            const physical = this._pathToPhysical.get(key) ?? key
            translated[physical] = val
          }
        }
        translatedRaw = translated as UniqueryControls['$select']
      }
      result.$select = new UniquSelect(translatedRaw, this._allPhysicalFields)
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
   * Resolves an id value into a filter expression by collecting all
   * type-compatible identifiers — primary key(s) and single-field unique
   * indexes — into an `$or` filter.
   *
   * For composite primary keys the id must be an object with matching fields.
   * Returns `null` if the id cannot be matched to any field.
   */
  protected _resolveIdFilter(id: unknown): FilterExpr | null {
    const orFilters: FilterExpr[] = []

    // Try single PK or composite PK
    const pkFields = this.primaryKeys
    if (pkFields.length === 1) {
      const filter = this._tryFieldFilter(pkFields[0], id)
      if (filter) { orFilters.push(filter) }
    } else if (pkFields.length > 1 && typeof id === 'object' && id !== null) {
      const idObj = id as Record<string, unknown>
      const compositeFilter: FilterExpr = {}
      let valid = true
      for (const field of pkFields) {
        const fieldType = this.flatMap.get(field)
        if (fieldType && !isIdCompatible(idObj[field], fieldType)) {
          valid = false
          break
        }
        try {
          compositeFilter[field] = fieldType
            ? this.adapter.prepareId(idObj[field], fieldType)
            : idObj[field]
        } catch {
          valid = false
          break
        }
      }
      if (valid) {
        orFilters.push(compositeFilter)
      }
    }

    // Try single-field unique indexes
    for (const prop of this.uniqueProps) {
      const filter = this._tryFieldFilter(prop, id)
      if (filter) { orFilters.push(filter) }
    }

    if (orFilters.length === 0) {
      return null
    }
    if (orFilters.length === 1) {
      return orFilters[0]
    }
    return { $or: orFilters } as FilterExpr
  }

  /**
   * Attempts to build a single-field filter `{ field: preparedId }`.
   * Returns `null` if the id is type-incompatible or can't be coerced.
   */
  private _tryFieldFilter(field: string, id: unknown): FilterExpr | null {
    const fieldType = this.flatMap.get(field)
    if (fieldType && !isIdCompatible(id, fieldType)) { return null }
    try {
      const prepared = fieldType ? this.adapter.prepareId(id, fieldType) : id
      return { [field]: prepared } as FilterExpr
    } catch {
      return null
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

  // ── Internal: relation loading ($with) ────────────────────────────────────

  /**
   * Loads related data for `$with` relations and attaches them to the result rows.
   * Uses batch queries (IN filters) to avoid N+1.
   */
  private async _loadRelations(
    rows: Array<Record<string, unknown>>,
    withRelations: WithRelation[]
  ): Promise<void> {
    if (rows.length === 0 || withRelations.length === 0) { return }

    // Let the adapter handle relation loading if it supports it natively
    if (this.adapter.supportsNativeRelations()) {
      return this.adapter.loadRelations(rows, withRelations, this._relations, this._foreignKeys)
    }

    // Fallback: application-level batch loading (requires a table resolver)
    if (!this._tableResolver) { return }

    const tasks: Array<Promise<void>> = []

    for (const withRel of withRelations) {
      const relName = withRel.name
      // Only handle top-level relations (dot-notation nesting handled recursively)
      if (relName.includes('.')) { continue }

      const relation = this._relations.get(relName)
      if (!relation) {
        throw new Error(`Unknown relation "${relName}" in $with. Available relations: ${[...this._relations.keys()].join(', ') || '(none)'}`)
      }

      const targetType = relation.targetType()
      if (!targetType) { continue }

      const targetTable = this._tableResolver(targetType)
      if (!targetTable) {
        this.logger.warn(`Could not resolve table for relation "${relName}" — skipping`)
        continue
      }

      // WithRelation is a Uniquery — pass filter + controls directly
      const filter = withRel.filter && Object.keys(withRel.filter).length > 0
        ? withRel.filter : undefined
      const relQuery: TRelationQuery = { filter, controls: (withRel.controls || {}) as Record<string, unknown> }

      if (relation.direction === 'to') {
        tasks.push(this._loadToRelation(rows, { relName, relation, targetTable, relQuery }))
      } else {
        tasks.push(this._loadFromRelation(rows, { relName, relation, targetTable, relQuery }))
      }
    }

    await Promise.all(tasks)
  }

  /**
   * Loads a `@db.rel.to` relation (FK is on this table).
   * Collects FK values from rows → batch query target → assign back.
   */
  private async _loadToRelation(
    rows: Array<Record<string, unknown>>,
    opts: { relName: string; relation: TDbRelation; targetTable: TResolvedTable; relQuery: TRelationQuery }
  ): Promise<void> {
    const { relName, relation, targetTable, relQuery } = opts
    // Find the FK that connects this relation to the target
    const fkEntry = this._findFKForRelation(relation)
    if (!fkEntry) { return }

    const { localFields, targetFields } = fkEntry

    // Simple case: single-field FK
    if (localFields.length === 1) {
      const localField = localFields[0]
      const targetField = targetFields[0]

      // Collect unique FK values
      const fkValues = collectUniqueValues(rows, localField)
      if (fkValues.length === 0) {
        // All FK values are null — assign null to all rows
        for (const row of rows) { row[relName] = null }
        return
      }

      // Query target table
      const inFilter = { [targetField]: { $in: fkValues } }
      const targetFilter = relQuery.filter
        ? { $and: [inFilter, relQuery.filter] }
        : inFilter

      const controls = ensureSelectIncludesFields(relQuery.controls, targetFields)
      const related = await targetTable.findMany({ filter: targetFilter, controls })

      assignSingle({ rows, related, localField, remoteField: targetField, relName })
    } else {
      // Composite FK — match on all fields
      const related = await this._queryCompositeFK(rows, { localFields, targetFields, targetTable, relQuery })

      const index = new Map<string, Record<string, unknown>>()
      for (const item of related) {
        index.set(compositeKey(targetFields, item), item)
      }

      for (const row of rows) {
        row[relName] = index.get(compositeKey(localFields, row)) ?? null
      }
    }
  }

  /**
   * Loads a `@db.rel.from` relation (FK is on the target table).
   * Collects PK values from rows → batch query target by its FK → assign back.
   */
  private async _loadFromRelation(
    rows: Array<Record<string, unknown>>,
    opts: { relName: string; relation: TDbRelation; targetTable: TResolvedTable; relQuery: TRelationQuery }
  ): Promise<void> {
    const { relName, relation, targetTable, relQuery } = opts
    // Find the FK on the target table that points back to this table
    const remoteFK = this._findRemoteFK(targetTable, this.tableName, relation.alias)
    if (!remoteFK) {
      this.logger.warn(`Could not find FK on target table for relation "${relName}"`)
      return
    }

    const localFields = remoteFK.targetFields  // our PK fields
    const remoteFields = remoteFK.fields         // FK fields on target table

    if (localFields.length === 1) {
      const localField = localFields[0]
      const remoteField = remoteFields[0]

      const pkValues = collectUniqueValues(rows, localField)
      if (pkValues.length === 0) { return }

      const inFilter = { [remoteField]: { $in: pkValues } }
      const targetFilter = relQuery.filter
        ? { $and: [inFilter, relQuery.filter] }
        : inFilter

      const controls = ensureSelectIncludesFields(relQuery.controls, remoteFields)
      const related = await targetTable.findMany({ filter: targetFilter, controls })

      if (relation.isArray) {
        assignGrouped({ rows, related, localField, remoteField, relName })
      } else {
        assignSingle({ rows, related, localField, remoteField, relName })
      }
    } else {
      // Composite FK
      const related = await this._queryCompositeFK(rows, { localFields, targetFields: remoteFields, targetTable, relQuery })

      if (relation.isArray) {
        const groups = new Map<string, Array<Record<string, unknown>>>()
        for (const item of related) {
          const key = compositeKey(remoteFields, item)
          let group = groups.get(key)
          if (!group) {
            group = []
            groups.set(key, group)
          }
          group.push(item)
        }
        for (const row of rows) {
          row[relName] = groups.get(compositeKey(localFields, row)) ?? []
        }
      } else {
        const index = new Map<string, Record<string, unknown>>()
        for (const item of related) {
          const key = compositeKey(remoteFields, item)
          if (!index.has(key)) { index.set(key, item) }
        }
        for (const row of rows) {
          row[relName] = index.get(compositeKey(localFields, row)) ?? null
        }
      }
    }
  }

  /**
   * Finds the FK entry that connects a `@db.rel.to` relation to its target.
   */
  private _findFKForRelation(relation: TDbRelation): { localFields: string[]; targetFields: string[] } | undefined {
    for (const fk of this._foreignKeys.values()) {
      if (relation.alias) {
        if (fk.alias === relation.alias) {
          return { localFields: fk.fields, targetFields: fk.targetFields }
        }
      } else if (fk.targetTable === this._resolveRelationTargetTable(relation)) {
        return { localFields: fk.fields, targetFields: fk.targetFields }
      }
    }
    return undefined
  }

  private _resolveRelationTargetTable(relation: TDbRelation): string {
    const targetType = relation.targetType()
    return (targetType?.metadata?.get('db.table' as keyof AtscriptMetadata) as string) || targetType?.id || ''
  }

  /**
   * Finds a FK on a remote table that points back to this table.
   */
  private _findRemoteFK(
    targetTable: TResolvedTable,
    thisTableName: string,
    alias?: string
  ): TDbForeignKey | undefined {
    for (const fk of targetTable.foreignKeys.values()) {
      if (alias && fk.alias === alias && fk.targetTable === thisTableName) { return fk }
      if (!alias && fk.targetTable === thisTableName) { return fk }
    }
    return undefined
  }

  /**
   * Batch query for composite FK — collects all unique field combinations from rows
   * and queries target with $or filter.
   */
  private _queryCompositeFK(
    rows: Array<Record<string, unknown>>,
    opts: { localFields: string[]; targetFields: string[]; targetTable: TResolvedTable; relQuery: TRelationQuery }
  ): Promise<Array<Record<string, unknown>>> {
    const { localFields, targetFields, targetTable, relQuery } = opts
    const seen = new Set<string>()
    const orFilters: Array<Record<string, unknown>> = []

    for (const row of rows) {
      const key = compositeKey(localFields, row)
      if (seen.has(key)) { continue }
      seen.add(key)

      const condition: Record<string, unknown> = {}
      let valid = true
      for (let i = 0; i < localFields.length; i++) {
        const val = row[localFields[i]]
        if (val === null || val === undefined) { valid = false; break }
        condition[targetFields[i]] = val
      }
      if (valid) { orFilters.push(condition) }
    }

    if (orFilters.length === 0) { return Promise.resolve([]) }

    const baseFilter = orFilters.length === 1 ? orFilters[0] : { $or: orFilters }
    const targetFilter = relQuery.filter ? { $and: [baseFilter, relQuery.filter] } : baseFilter

    return targetTable.findMany({ filter: targetFilter, controls: relQuery.controls })
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

import {
  isAnnotatedType,
  type FlatOf,
  type PrimaryKeyOf,
  type OwnPropsOf,
  type NavPropsOf,
  type TAtscriptAnnotatedType,
  type TAtscriptDataType,
  type TAtscriptTypeObject,
  type TMetadataMap,
  type Validator,
  type TValidatorOptions,
} from '@atscript/typescript/utils'

import type { FilterExpr, UniqueryControls, Uniquery, WithRelation } from '@uniqu/core'

import type { BaseDbAdapter } from '../base-adapter'
import type { TGenericLogger } from '../logger'
import { NoopLogger } from '../logger'
import type {
  TDbDefaultValue,
  TDbFieldMeta,
  TDbForeignKey,
  TDbIndex,
  TDbRelation,
  TIdDescriptor,
  TSearchIndexInfo,
  TTableResolver,
  TWriteTableResolver,
} from '../types'
import { TableMetadata } from './table-metadata'
import { type FieldMappingStrategy, DocumentFieldMapper } from '../strategies/field-mapping'
import { RelationalFieldMapper } from '../strategies/relational-field-mapper'

/**
 * Extracts nav prop names from a query's `$with` array.
 * Returns `never` when `$with` is absent → all nav props stripped from response.
 */
type ExtractWith<Q> =
  Q extends { controls: { $with: Array<{ name: infer N extends string }> } } ? N : never

/**
 * Computes the response type for a query:
 * - Strips all nav props from the base DataType
 * - Adds back only the nav props requested via `$with`
 *
 * When no `$with` is provided, result is `Omit<DataType, keyof NavType>`.
 * When `$with: [{ name: 'author' }]`, result includes `author` from DataType.
 * When the query type is not a literal (e.g. a variable typed as `Uniquery`),
 * falls back to `DataType` (all nav props optional, as declared).
 */
export type DbResponse<Data, Nav, Q> =
  [keyof Nav] extends [never]
    ? Data
    : Omit<Data, keyof Nav & string> & Pick<Data, ExtractWith<Q> & keyof Data & string>

/**
 * Resolves the design type from an annotated type.
 * Encapsulates the `kind === ''` check and fallback logic that
 * otherwise trips up every adapter author.
 *
 * For union types (e.g., from flattened `{...} | {...}` objects):
 * - If all members resolve to the same type → returns that type (strong type)
 * - If members disagree → returns `'union'` (out of scope for type management)
 */
export function resolveDesignType(fieldType: TAtscriptAnnotatedType): string {
  if (fieldType.type.kind === '') {
    return (fieldType.type as any).designType ?? 'string'
  }
  if (fieldType.type.kind === 'object') { return 'object' }
  if (fieldType.type.kind === 'array') { return 'array' }
  if (fieldType.type.kind === 'union') {
    const items = (fieldType.type as { items: TAtscriptAnnotatedType[] }).items
    if (items.length > 0) {
      const resolved = items.map(item => resolveDesignType(item))
      if (resolved.every(type => type === resolved[0])) {
        return resolved[0]
      }
    }
    return 'union'
  }
  return 'string'
}

/**
 * Resolves `@db.default.*` annotations from a metadata map into a {@link TDbDefaultValue}.
 * Used both during normal field descriptor construction and for FK target field resolution.
 */
export function resolveDefaultFromMetadata(metadata: TMetadataMap<any>): TDbDefaultValue | undefined {
  const defaultValue = metadata.get('db.default') as string | undefined
  if (defaultValue !== undefined) {
    return { kind: 'value', value: defaultValue }
  }
  if (metadata.has('db.default.increment')) {
    const startValue = metadata.get('db.default.increment')
    return { kind: 'fn', fn: 'increment', start: typeof startValue === 'number' ? startValue : undefined }
  }
  if (metadata.has('db.default.uuid')) {
    return { kind: 'fn', fn: 'uuid' }
  }
  if (metadata.has('db.default.now')) {
    return { kind: 'fn', fn: 'now' }
  }
  return undefined
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
  let key = ''
  for (let i = 0; i < fields.length; i++) {
    if (i > 0) { key += '\0\0' }
    const v = obj[fields[i]]
    key += v == null ? '\0' : String(v)
  }
  return key
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

/**
 * Shared read-only database abstraction driven by Atscript annotations.
 *
 * Contains all field metadata computation, read operations, query translation,
 * relation loading, and result reconstruction. Extended by both
 * {@link AtscriptDbTable} (adds write operations) and {@link AtscriptDbView}
 * (adds view plan/DDL).
 */
export class AtscriptDbReadable<
  T extends TAtscriptAnnotatedType = TAtscriptAnnotatedType,
  DataType = TAtscriptDataType<T>,
  FlatType = FlatOf<T>,
  A extends BaseDbAdapter = BaseDbAdapter,
  IdType = PrimaryKeyOf<T>,
  OwnProps = OwnPropsOf<T>,
  NavType extends Record<string, unknown> = NavPropsOf<T>,
> {
  /** Resolved table/collection/view name. */
  public readonly tableName: string

  /** Database schema/namespace from `@db.schema` (if set). */
  public readonly schema: string | undefined

  /** Sync method from `@db.sync.method` ('drop' | 'recreate' | undefined). */
  protected readonly _syncMethod: 'drop' | 'recreate' | undefined

  /** Previous table/view name from `@db.table.renamed` or `@db.view.renamed`. */
  public readonly renamedFrom: string | undefined

  // ── Metadata ─────────────────────────────────────────────────────────────

  /** Computed metadata for this table/view. Built lazily on first access. */
  protected readonly _meta: TableMetadata

  /** Strategy for mapping between logical field shapes and physical storage. */
  protected readonly _fieldMapper: FieldMappingStrategy

  protected _writeTableResolver?: TWriteTableResolver

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
      throw new Error('Database type must be an object type')
    }

    const adapterName = adapter.getAdapterTableName?.(_type)
    const dbTable = _type.metadata.get('db.table') as string | undefined
    const dbViewName = _type.metadata.get('db.view') as string | undefined
    const fallbackName = _type.id || ''

    this.tableName = adapterName || dbTable || dbViewName || fallbackName
    if (!this.tableName) {
      throw new Error('@db.table or @db.view annotation expected')
    }

    this.schema = _type.metadata.get('db.schema') as string | undefined
    this._syncMethod = _type.metadata.get('db.sync.method') as 'drop' | 'recreate' | undefined
    this.renamedFrom = (_type.metadata.get('db.table.renamed') as string | undefined)
      ?? (_type.metadata.get('db.view.renamed') as string | undefined)

    this._meta = new TableMetadata(adapter.supportsNestedObjects())
    this._fieldMapper = adapter.supportsNestedObjects()
      ? new DocumentFieldMapper()
      : new RelationalFieldMapper()

    // Establish bidirectional relationship
    adapter.registerReadable(this, logger)
  }

  /** Ensures metadata is built. Called before any metadata access. */
  protected _ensureBuilt(): void {
    if (!this._meta.isBuilt) {
      this._meta.build(this.type, this.adapter, this.logger)
    }
  }

  // ── Public getters ────────────────────────────────────────────────────────

  /** Whether this readable is a view (overridden in AtscriptDbView). */
  public get isView(): boolean {
    return false
  }

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
    this._ensureBuilt()
    return this._meta.flatMap
  }

  /** All computed indexes from `@db.index.*` annotations. */
  public get indexes(): Map<string, TDbIndex> {
    this._ensureBuilt()
    return this._meta.indexes
  }

  /** Primary key field names from `@meta.id`. */
  public get primaryKeys(): readonly string[] {
    this._ensureBuilt()
    return this._meta.primaryKeys
  }

  /** Original `@meta.id` field names as declared in the schema (before adapter manipulation). */
  public get originalMetaIdFields(): readonly string[] {
    this._ensureBuilt()
    return this._meta.originalMetaIdFields
  }

  /** Sync method for structural changes: 'drop' (lossy), 'recreate' (lossless), or undefined (manual). */
  public get syncMethod(): 'drop' | 'recreate' | undefined {
    return this._syncMethod
  }

  /** Logical → physical column name mapping from `@db.column`. */
  public get columnMap(): ReadonlyMap<string, string> {
    this._ensureBuilt()
    return this._meta.columnMap
  }

  /** Default values from `@db.default.*`. */
  public get defaults(): ReadonlyMap<string, TDbDefaultValue> {
    this._ensureBuilt()
    return this._meta.defaults
  }

  /** Fields excluded from DB via `@db.ignore`. */
  public get ignoredFields(): ReadonlySet<string> {
    this._ensureBuilt()
    return this._meta.ignoredFields
  }

  /** Navigational fields (`@db.rel.to` / `@db.rel.from`) — not stored as columns. */
  public get navFields(): ReadonlySet<string> {
    this._ensureBuilt()
    return this._meta.navFields
  }

  /** Single-field unique index properties. */
  public get uniqueProps(): ReadonlySet<string> {
    this._ensureBuilt()
    return this._meta.uniqueProps
  }

  /** Foreign key constraints from `@db.rel.FK` annotations. */
  public get foreignKeys(): ReadonlyMap<string, TDbForeignKey> {
    this._ensureBuilt()
    return this._meta.foreignKeys
  }

  /** Navigational relation metadata from `@db.rel.to` / `@db.rel.from`. */
  public get relations(): ReadonlyMap<string, TDbRelation> {
    this._ensureBuilt()
    return this._meta.relations
  }

  /** The underlying database adapter instance. */
  public get dbAdapter(): A {
    return this.adapter
  }

  /**
   * Enables or disables verbose (debug-level) DB call logging for this table/view.
   * When disabled (default), no log strings are constructed — zero overhead.
   */
  public setVerbose(enabled: boolean): void {
    this.adapter.setVerbose(enabled)
  }

  /** Precomputed logical dot-path → physical column name map. */
  public get pathToPhysical(): ReadonlyMap<string, string> {
    this._ensureBuilt()
    return this._meta.pathToPhysical
  }

  /** Precomputed physical column name → logical dot-path map (inverse). */
  public get physicalToPath(): ReadonlyMap<string, string> {
    this._ensureBuilt()
    return this._meta.physicalToPath
  }

  /** Descriptor for the primary ID field(s). */
  public getIdDescriptor(): TIdDescriptor {
    this._ensureBuilt()
    return {
      fields: [...this._meta.primaryKeys],
      isComposite: this._meta.primaryKeys.length > 1,
    }
  }

  /**
   * Pre-computed field metadata for adapter use.
   */
  public get fieldDescriptors(): readonly TDbFieldMeta[] {
    this._ensureBuilt()
    return this._meta.fieldDescriptors
  }

  // ── Validation ────────────────────────────────────────────────────────────

  /**
   * Creates a new validator with custom options.
   */
  public createValidator(opts?: Partial<TValidatorOptions>): Validator<T, DataType> {
    return this._type.validator(opts) as Validator<T, DataType>
  }

  // ── Read operations ────────────────────────────────────────────────────────

  /**
   * Finds a single record matching the query.
   * The return type automatically excludes nav props unless they are
   * explicitly requested via `$with`.
   */
  public async findOne<Q extends Uniquery<OwnProps, NavType>>(
    query: Q
  ): Promise<DbResponse<DataType, NavType, Q> | null> {
    this._ensureBuilt()
    const withRelations = (query.controls as UniqueryControls)?.$with as WithRelation[] | undefined
    const translatedQuery = this._fieldMapper.translateQuery(query as Uniquery, this._meta)
    const result = await this.adapter.findOne(translatedQuery)
    if (!result) { return null }
    const row = this._fieldMapper.reconstructFromRead(result, this._meta)
    if (withRelations?.length) {
      await this._loadRelations([row], withRelations)
    }
    return row as DbResponse<DataType, NavType, Q>
  }

  /**
   * Finds all records matching the query.
   * The return type automatically excludes nav props unless they are
   * explicitly requested via `$with`.
   */
  public async findMany<Q extends Uniquery<OwnProps, NavType>>(
    query: Q
  ): Promise<Array<DbResponse<DataType, NavType, Q>>> {
    this._ensureBuilt()
    const withRelations = (query.controls as UniqueryControls)?.$with as WithRelation[] | undefined
    const translatedQuery = this._fieldMapper.translateQuery(query as Uniquery, this._meta)
    const results = await this.adapter.findMany(translatedQuery)
    const rows = results.map(row => this._fieldMapper.reconstructFromRead(row, this._meta))
    if (withRelations?.length) {
      await this._loadRelations(rows, withRelations)
    }
    return rows as Array<DbResponse<DataType, NavType, Q>>
  }

  /**
   * Counts records matching the query.
   */
  public async count(query?: Uniquery<OwnProps, NavType>): Promise<number> {
    this._ensureBuilt()
    query ??= { filter: {}, controls: {} } as Uniquery<OwnProps, NavType>
    return this.adapter.count(this._fieldMapper.translateQuery(query as Uniquery, this._meta))
  }

  /**
   * Finds records and total count in a single logical call.
   */
  public async findManyWithCount<Q extends Uniquery<OwnProps, NavType>>(
    query: Q
  ): Promise<{ data: Array<DbResponse<DataType, NavType, Q>>; count: number }> {
    this._ensureBuilt()
    const withRelations = (query.controls as UniqueryControls)?.$with as WithRelation[] | undefined
    const translated = this._fieldMapper.translateQuery(query as Uniquery, this._meta)
    const result = await this.adapter.findManyWithCount(translated)
    const rows = result.data.map(row => this._fieldMapper.reconstructFromRead(row, this._meta))
    if (withRelations?.length) {
      await this._loadRelations(rows, withRelations)
    }
    return {
      data: rows as Array<DbResponse<DataType, NavType, Q>>,
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
   */
  public async search<Q extends Uniquery<OwnProps, NavType>>(
    text: string,
    query: Q,
    indexName?: string
  ): Promise<Array<DbResponse<DataType, NavType, Q>>> {
    this._ensureBuilt()
    const withRelations = (query.controls as UniqueryControls)?.$with as WithRelation[] | undefined
    const translated = this._fieldMapper.translateQuery(query as Uniquery, this._meta)
    const results = await this.adapter.search(text, translated, indexName)
    const rows = results.map(row => this._fieldMapper.reconstructFromRead(row, this._meta))
    if (withRelations?.length) {
      await this._loadRelations(rows, withRelations)
    }
    return rows as Array<DbResponse<DataType, NavType, Q>>
  }

  /**
   * Full-text search with count for paginated search results.
   */
  public async searchWithCount<Q extends Uniquery<OwnProps, NavType>>(
    text: string,
    query: Q,
    indexName?: string
  ): Promise<{ data: Array<DbResponse<DataType, NavType, Q>>; count: number }> {
    this._ensureBuilt()
    const withRelations = (query.controls as UniqueryControls)?.$with as WithRelation[] | undefined
    const translated = this._fieldMapper.translateQuery(query as Uniquery, this._meta)
    const result = await this.adapter.searchWithCount(text, translated, indexName)
    const rows = result.data.map(row => this._fieldMapper.reconstructFromRead(row, this._meta))
    if (withRelations?.length) {
      await this._loadRelations(rows, withRelations)
    }
    return {
      data: rows as Array<DbResponse<DataType, NavType, Q>>,
      count: result.count,
    }
  }

  // ── Vector Search ─────────────────────────────────────────────────────

  /** Whether the underlying adapter supports vector similarity search. */
  public isVectorSearchable(): boolean {
    return this.adapter.isVectorSearchable()
  }

  /**
   * Vector similarity search with query translation and result reconstruction.
   *
   * Overloads:
   * - `vectorSearch(vector, query?)` — uses default vector index
   * - `vectorSearch(indexName, vector, query?)` — targets a specific vector index
   */
  public async vectorSearch<Q extends Uniquery<OwnProps, NavType>>(
    vectorOrIndex: number[] | string,
    maybeVectorOrQuery?: number[] | Q,
    maybeQuery?: Q
  ): Promise<Array<DbResponse<DataType, NavType, Q>>> {
    const { vector, query, indexName } = this._resolveVectorSearchArgs<Q>(vectorOrIndex, maybeVectorOrQuery, maybeQuery)
    this._ensureBuilt()
    const withRelations = (query?.controls as UniqueryControls)?.$with as WithRelation[] | undefined
    const translated = this._fieldMapper.translateQuery((query || {}) as Uniquery, this._meta)
    const results = await this.adapter.vectorSearch(vector, translated, indexName)
    const rows = results.map(row => this._fieldMapper.reconstructFromRead(row, this._meta))
    if (withRelations?.length) {
      await this._loadRelations(rows, withRelations)
    }
    return rows as Array<DbResponse<DataType, NavType, Q>>
  }

  /**
   * Vector similarity search with count for paginated results.
   *
   * Overloads:
   * - `vectorSearchWithCount(vector, query?)` — uses default vector index
   * - `vectorSearchWithCount(indexName, vector, query?)` — targets a specific vector index
   */
  public async vectorSearchWithCount<Q extends Uniquery<OwnProps, NavType>>(
    vectorOrIndex: number[] | string,
    maybeVectorOrQuery?: number[] | Q,
    maybeQuery?: Q
  ): Promise<{ data: Array<DbResponse<DataType, NavType, Q>>; count: number }> {
    const { vector, query, indexName } = this._resolveVectorSearchArgs<Q>(vectorOrIndex, maybeVectorOrQuery, maybeQuery)
    this._ensureBuilt()
    const withRelations = (query?.controls as UniqueryControls)?.$with as WithRelation[] | undefined
    const translated = this._fieldMapper.translateQuery((query || {}) as Uniquery, this._meta)
    const result = await this.adapter.vectorSearchWithCount(vector, translated, indexName)
    const rows = result.data.map(row => this._fieldMapper.reconstructFromRead(row, this._meta))
    if (withRelations?.length) {
      await this._loadRelations(rows, withRelations)
    }
    return {
      data: rows as Array<DbResponse<DataType, NavType, Q>>,
      count: result.count,
    }
  }

  /** Resolves overloaded vector search arguments into canonical form. */
  private _resolveVectorSearchArgs<Q>(
    vectorOrIndex: number[] | string,
    maybeVectorOrQuery?: number[] | Q,
    maybeQuery?: Q
  ): { vector: number[]; query: Q | undefined; indexName: string | undefined } {
    if (Array.isArray(vectorOrIndex)) {
      // vectorSearch(vector, query?)
      return { vector: vectorOrIndex, query: maybeVectorOrQuery as Q | undefined, indexName: undefined }
    }
    // vectorSearch(indexName, vector, query?)
    return { vector: maybeVectorOrQuery as number[], query: maybeQuery, indexName: vectorOrIndex }
  }

  // ── Find by ID ──────────────────────────────────────────────────────────

  /**
   * Finds a single record by any type-compatible identifier — primary key
   * or single-field unique index.
   * The return type excludes nav props unless `$with` is provided in controls.
   *
   * ```typescript
   * // Without relations — nav props stripped from result
   * const user = await table.findById('123')
   *
   * // With relations — only requested nav props appear
   * const user = await table.findById('123', { controls: { $with: [{ name: 'posts' }] } })
   * ```
   */
  public async findById<Q extends { controls?: UniqueryControls<OwnProps, NavType> } = Record<string, never>>(
    id: IdType,
    query?: Q
  ): Promise<DbResponse<DataType, NavType, Q> | null> {
    this._ensureBuilt()
    const filter = this._resolveIdFilter(id)
    if (!filter) {
      return null
    }
    return await this.findOne({
      filter,
      controls: query?.controls || {},
    } as Uniquery<OwnProps, NavType>) as DbResponse<DataType, NavType, Q> | null
  }





  /**
   * Resolves an id value into a filter expression.
   */
  protected _resolveIdFilter(id: unknown): FilterExpr | null {
    const orFilters: FilterExpr[] = []

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

    // Try compound unique indexes when id is an object
    if (typeof id === 'object' && id !== null && orFilters.length === 0) {
      const idObj = id as Record<string, unknown>
      for (const index of this._meta.indexes.values()) {
        if (index.type !== 'unique' || index.fields.length < 2) { continue }
        const compoundFilter: FilterExpr = {}
        let valid = true
        for (const indexField of index.fields) {
          const fieldName = indexField.name
          if (idObj[fieldName] === undefined) { valid = false; break }
          const fieldType = this.flatMap.get(fieldName)
          if (fieldType && !isIdCompatible(idObj[fieldName], fieldType)) { valid = false; break }
          try {
            compoundFilter[fieldName] = fieldType
              ? this.adapter.prepareId(idObj[fieldName], fieldType)
              : idObj[fieldName]
          } catch {
            valid = false
            break
          }
        }
        if (valid) {
          orFilters.push(compoundFilter)
        }
      }
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

  // ── Internal: relation loading ($with) ────────────────────────────────────

  /**
   * Public entry point for relation loading. Used by adapters for nested $with delegation.
   */
  public async loadRelations(
    rows: Array<Record<string, unknown>>,
    withRelations: WithRelation[]
  ): Promise<void> {
    return this._loadRelations(rows, withRelations)
  }

  /**
   * Loads related data for `$with` relations and attaches them to the result rows.
   */
  protected async _loadRelations(
    rows: Array<Record<string, unknown>>,
    withRelations: WithRelation[]
  ): Promise<void> {
    if (rows.length === 0 || withRelations.length === 0) { return }

    if (this.adapter.supportsNativeRelations()) {
      return this.adapter.loadRelations(rows, withRelations, this._meta.relations, this._meta.foreignKeys, this._tableResolver)
    }

    if (!this._tableResolver) { return }

    const tasks: Array<Promise<void>> = []

    for (const withRel of withRelations) {
      const relName = withRel.name
      if (relName.includes('.')) { continue }

      const relation = this._meta.relations.get(relName)
      if (!relation) {
        throw new Error(`Unknown relation "${relName}" in $with. Available relations: ${[...this._meta.relations.keys()].join(', ') || '(none)'}`)
      }

      const targetType = relation.targetType()
      if (!targetType) { continue }

      const targetTable = this._tableResolver(targetType)
      if (!targetTable) {
        this.logger.warn(`Could not resolve table for relation "${relName}" — skipping`)
        continue
      }

      const filter = withRel.filter && Object.keys(withRel.filter).length > 0
        ? withRel.filter : undefined

      // @uniqu/url parseWithSegment places $sort/$limit/$skip/$select as flat
      // keys on the relation object rather than nesting under .controls.
      // Merge both shapes so relation loading works either way.
      const flatRel = withRel as Record<string, unknown>
      const nested = (withRel.controls || {}) as Record<string, unknown>
      const controls: Record<string, unknown> = { ...nested }
      if (flatRel.$sort && !controls.$sort) { controls.$sort = flatRel.$sort }
      if (flatRel.$limit !== null && flatRel.$limit !== undefined && (controls.$limit === null || controls.$limit === undefined)) { controls.$limit = flatRel.$limit }
      if (flatRel.$skip !== null && flatRel.$skip !== undefined && (controls.$skip === null || controls.$skip === undefined)) { controls.$skip = flatRel.$skip }
      if (flatRel.$select && !controls.$select) { controls.$select = flatRel.$select }
      if (flatRel.$with && !controls.$with) { controls.$with = flatRel.$with }
      const relQuery: TRelationQuery = { filter, controls }

      if (relation.direction === 'to') {
        tasks.push(this._loadToRelation(rows, { relName, relation, targetTable, relQuery }))
      } else if (relation.direction === 'via') {
        tasks.push(this._loadViaRelation(rows, { relName, relation, targetTable, relQuery }))
      } else {
        tasks.push(this._loadFromRelation(rows, { relName, relation, targetTable, relQuery }))
      }
    }

    await Promise.all(tasks)
  }

  /**
   * Loads a `@db.rel.to` relation (FK is on this table).
   */
  private async _loadToRelation(
    rows: Array<Record<string, unknown>>,
    opts: { relName: string; relation: TDbRelation; targetTable: TResolvedTable; relQuery: TRelationQuery }
  ): Promise<void> {
    const { relName, relation, targetTable, relQuery } = opts
    const fkEntry = this._findFKForRelation(relation)
    if (!fkEntry) { return }

    const { localFields, targetFields } = fkEntry

    if (localFields.length === 1) {
      const localField = localFields[0]
      const targetField = targetFields[0]

      const fkValues = collectUniqueValues(rows, localField)
      if (fkValues.length === 0) {
        for (const row of rows) { row[relName] = null }
        return
      }

      const inFilter = { [targetField]: { $in: fkValues } }
      const targetFilter = relQuery.filter
        ? { $and: [inFilter, relQuery.filter] }
        : inFilter

      const controls = ensureSelectIncludesFields(relQuery.controls, targetFields)
      const related = await targetTable.findMany({ filter: targetFilter, controls })

      assignSingle({ rows, related, localField, remoteField: targetField, relName })
    } else {
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
   */
  private async _loadFromRelation(
    rows: Array<Record<string, unknown>>,
    opts: { relName: string; relation: TDbRelation; targetTable: TResolvedTable; relQuery: TRelationQuery }
  ): Promise<void> {
    const { relName, relation, targetTable, relQuery } = opts
    const remoteFK = this._findRemoteFK(targetTable, this.tableName, relation.alias)
    if (!remoteFK) {
      this.logger.warn(`Could not find FK on target table for relation "${relName}"`)
      return
    }

    const localFields = remoteFK.targetFields
    const remoteFields = remoteFK.fields

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
   * Loads a `@db.rel.via` relation (M:N through a junction table).
   *
   * Steps:
   * 1. Resolve junction table from `relation.viaType`
   * 2. Find FK on junction → this table (gives local PK ↔ junction FK)
   * 3. Find FK on junction → target table (gives junction FK ↔ target PK)
   * 4. Query junction rows matching this table's PKs
   * 5. Query target rows matching junction's target FKs
   * 6. Group targets by source row
   */
  private async _loadViaRelation(
    rows: Array<Record<string, unknown>>,
    opts: { relName: string; relation: TDbRelation; targetTable: TResolvedTable; relQuery: TRelationQuery }
  ): Promise<void> {
    const { relName, relation, targetTable, relQuery } = opts

    if (!relation.viaType || !this._tableResolver) { return }

    const junctionType = relation.viaType()
    if (!junctionType) { return }

    const junctionTable = this._tableResolver(junctionType)
    if (!junctionTable) {
      this.logger.warn(`Could not resolve junction table for via relation "${relName}"`)
      return
    }

    // Find FK on junction that points to THIS table
    const fkToThis = this._findRemoteFK(junctionTable, this.tableName)
    if (!fkToThis) {
      this.logger.warn(`Could not find FK on junction table pointing to "${this.tableName}" for via relation "${relName}"`)
      return
    }

    // Find FK on junction that points to TARGET table
    const targetTableName = this._resolveRelationTargetTable(relation)
    const fkToTarget = this._findRemoteFK(junctionTable, targetTableName)
    if (!fkToTarget) {
      this.logger.warn(`Could not find FK on junction table pointing to target "${targetTableName}" for via relation "${relName}"`)
      return
    }

    // Local PK fields (on this table) and corresponding junction FK fields
    const localPKFields = fkToThis.targetFields   // e.g. ['id'] on tasks
    const junctionLocalFields = fkToThis.fields    // e.g. ['taskId'] on task_tags

    // Target PK fields and corresponding junction FK fields
    const targetPKFields = fkToTarget.targetFields // e.g. ['id'] on tags
    const junctionTargetFields = fkToTarget.fields // e.g. ['tagId'] on task_tags

    // Step 1: Collect unique local PK values from rows
    if (localPKFields.length === 1) {
      const localField = localPKFields[0]
      const junctionLocalField = junctionLocalFields[0]
      const junctionTargetField = junctionTargetFields[0]
      const targetPKField = targetPKFields[0]

      const pkValues = collectUniqueValues(rows, localField)
      if (pkValues.length === 0) {
        for (const row of rows) { row[relName] = [] }
        return
      }

      // Step 2: Query junction table
      const junctionFilter = { [junctionLocalField]: { $in: pkValues } }
      const junctionRows = await junctionTable.findMany({
        filter: junctionFilter,
        controls: { $select: [junctionLocalField, junctionTargetField] },
      })

      if (junctionRows.length === 0) {
        for (const row of rows) { row[relName] = relation.isArray ? [] : null }
        return
      }

      // Step 3: Collect unique target FK values from junction
      const targetFKValues = collectUniqueValues(junctionRows, junctionTargetField)

      // Step 4: Query target table
      const inFilter = { [targetPKField]: { $in: targetFKValues } }
      const targetFilter = relQuery.filter
        ? { $and: [inFilter, relQuery.filter] }
        : inFilter
      const controls = ensureSelectIncludesFields(relQuery.controls, targetPKFields)
      const targetRows = await targetTable.findMany({ filter: targetFilter, controls })

      // Step 5: Index target rows by PK
      const targetIndex = new Map<string, Record<string, unknown>>()
      for (const item of targetRows) {
        targetIndex.set(String(item[targetPKField]), item)
      }

      // Step 6: Group junction rows by local FK, resolve to target records
      const groups = new Map<string, Array<Record<string, unknown>>>()
      for (const jRow of junctionRows) {
        const localKey = String(jRow[junctionLocalField])
        const targetKey = String(jRow[junctionTargetField])
        const target = targetIndex.get(targetKey)
        if (!target) { continue }

        let group = groups.get(localKey)
        if (!group) {
          group = []
          groups.set(localKey, group)
        }
        group.push(target)
      }

      // Step 7: Assign to rows
      for (const row of rows) {
        const key = String(row[localField])
        row[relName] = relation.isArray ? (groups.get(key) ?? []) : (groups.get(key)?.[0] ?? null)
      }
    } else {
      // Composite PK via relation — less common but handle gracefully
      const pkValues = new Set<string>()
      for (const row of rows) {
        pkValues.add(compositeKey(localPKFields, row))
      }

      // Build OR filter for junction
      const orFilters: Array<Record<string, unknown>> = []
      for (const row of rows) {
        const condition: Record<string, unknown> = {}
        let valid = true
        for (let i = 0; i < localPKFields.length; i++) {
          const val = row[localPKFields[i]]
          if (val === null || val === undefined) { valid = false; break }
          condition[junctionLocalFields[i]] = val
        }
        if (valid) { orFilters.push(condition) }
      }

      if (orFilters.length === 0) {
        for (const row of rows) { row[relName] = relation.isArray ? [] : null }
        return
      }

      const junctionFilter = orFilters.length === 1 ? orFilters[0] : { $or: orFilters }
      const junctionRows = await junctionTable.findMany({
        filter: junctionFilter,
        controls: { $select: [...junctionLocalFields, ...junctionTargetFields] },
      })

      if (junctionRows.length === 0) {
        for (const row of rows) { row[relName] = relation.isArray ? [] : null }
        return
      }

      // Query targets
      const targetOrFilters: Array<Record<string, unknown>> = []
      const seenTargets = new Set<string>()
      for (const jRow of junctionRows) {
        const key = compositeKey(junctionTargetFields, jRow)
        if (seenTargets.has(key)) { continue }
        seenTargets.add(key)
        const condition: Record<string, unknown> = {}
        for (let i = 0; i < junctionTargetFields.length; i++) {
          condition[targetPKFields[i]] = jRow[junctionTargetFields[i]]
        }
        targetOrFilters.push(condition)
      }

      const targetFilter = targetOrFilters.length === 1 ? targetOrFilters[0] : { $or: targetOrFilters }
      const finalFilter = relQuery.filter ? { $and: [targetFilter, relQuery.filter] } : targetFilter
      const targetRows = await targetTable.findMany({ filter: finalFilter, controls: relQuery.controls })

      // Index targets
      const targetIndex = new Map<string, Record<string, unknown>>()
      for (const item of targetRows) {
        targetIndex.set(compositeKey(targetPKFields, item), item)
      }

      // Group and assign
      const groups = new Map<string, Array<Record<string, unknown>>>()
      for (const jRow of junctionRows) {
        const localKey = compositeKey(junctionLocalFields, jRow)
        const targetKey = compositeKey(junctionTargetFields, jRow)
        const target = targetIndex.get(targetKey)
        if (!target) { continue }

        let group = groups.get(localKey)
        if (!group) {
          group = []
          groups.set(localKey, group)
        }
        group.push(target)
      }

      for (const row of rows) {
        const key = compositeKey(localPKFields, row)
        row[relName] = relation.isArray ? (groups.get(key) ?? []) : (groups.get(key)?.[0] ?? null)
      }
    }
  }

  /**
   * Finds the FK entry that connects a `@db.rel.to` relation to its target.
   */
  protected _findFKForRelation(relation: TDbRelation): { localFields: string[]; targetFields: string[] } | undefined {
    for (const fk of this._meta.foreignKeys.values()) {
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
    return (targetType?.metadata?.get('db.table') as string) || targetType?.id || ''
  }

  /**
   * Finds a FK on a remote table that points back to this table.
   */
  protected _findRemoteFK(
    targetTable: { foreignKeys: ReadonlyMap<string, TDbForeignKey> },
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
   * Batch query for composite FK.
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
}

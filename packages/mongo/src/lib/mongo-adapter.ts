// oxlint-disable max-lines
import type {
  TAtscriptAnnotatedType,
  TMetadataMap,
  TValidatorPlugin,
  TValidatorOptions,
  Validator,
} from '@atscript/typescript/utils'
import {
  BaseDbAdapter,
  type AtscriptDbTable,
  type DbQuery,
  type FilterExpr,
  type TDbInsertResult,
  type TDbInsertManyResult,
  type TDbUpdateResult,
  type TDbDeleteResult,
  type TSearchIndexInfo,
} from '@atscript/utils-db'
import type {
  AggregationCursor,
  ClientSession,
  Collection,
  Db,
  Document,
} from 'mongodb'
import { ObjectId } from 'mongodb'

import type { AsMongo } from './as-mongo'
import { CollectionPatcher, type TCollectionPatcherContext } from './collection-patcher'
import { buildMongoFilter } from './mongo-filter'
import { validateMongoIdPlugin } from './validate-plugins'

const INDEX_PREFIX = 'atscript__'
const DEFAULT_INDEX_NAME = 'DEFAULT'

// ── Index types ──────────────────────────────────────────────────────────────

export interface TPlainIndex {
  key: string
  name: string
  type: 'plain' | 'unique' | 'text'
  fields: Record<string, 1 | 'text'>
  weights: Record<string, number>
}

export interface TSearchIndex {
  key: string
  name: string
  type: 'dynamic_text' | 'search_text' | 'vector'
  definition: TMongoSearchIndexDefinition
}

export type TMongoIndex = TPlainIndex | TSearchIndex

function mongoIndexKey(type: TMongoIndex['type'], name: string) {
  const cleanName = name
    .replace(/[^a-z0-9_.-]/gi, '_')
    .replace(/_+/g, '_')
    .slice(0, 127 - INDEX_PREFIX.length - type.length - 2)
  return `${INDEX_PREFIX}${type}__${cleanName}`
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export class MongoAdapter extends BaseDbAdapter {
  private _collection?: Collection<any>

  /** MongoDB-specific indexes (search, vector) — separate from table.indexes. */
  protected _mongoIndexes = new Map<string, TMongoIndex>()

  /** Vector search filter associations built during flattening. */
  protected _vectorFilters = new Map<string, string>()

  /** Cached search index lookup. */
  protected _searchIndexesMap?: Map<string, TMongoIndex>

  /** Physical field names with @db.default.fn "increment". */
  protected _incrementFields = new Set<string>()

  /** Capped collection options from @db.mongo.capped. */
  protected _cappedOptions?: { size: number; max?: number }

  constructor(
    protected readonly db: Db,
    protected readonly asMongo?: AsMongo
  ) {
    super()
  }

  // ── Transaction primitives ────────────────────────────────────────────────

  private get _client() { return this.asMongo?.client }

  /** Whether transaction support has been detected as unavailable (standalone MongoDB). */
  private _txDisabled = false

  protected override async _beginTransaction(): Promise<unknown> {
    if (this._txDisabled || !this._client) { return undefined }
    try {
      const session = this._client.startSession()
      session.startTransaction()
      return session
    } catch {
      this._txDisabled = true
      return undefined
    }
  }

  protected override async _commitTransaction(state: unknown): Promise<void> {
    if (!state) { return }
    const session = state as ClientSession
    try { await session.commitTransaction() } finally { session.endSession() }
  }

  protected override async _rollbackTransaction(state: unknown): Promise<void> {
    if (!state) { return }
    const session = state as ClientSession
    try { await session.abortTransaction() } finally { session.endSession() }
  }

  private static readonly _noSession: Record<string, never> = Object.freeze({}) as Record<string, never>

  /** Returns `{ session }` opts if inside a transaction, empty object otherwise. */
  protected _getSessionOpts(): { session: ClientSession } | Record<string, never> {
    const session = this._getTransactionState() as ClientSession | undefined
    return session ? { session } : MongoAdapter._noSession
  }

  // ── Collection access ────────────────────────────────────────────────────

  get collection(): Collection<any> {
    if (!this._collection) {
      this._collection = this.db.collection(this.resolveTableName(false))
    }
    return this._collection
  }

  aggregate(pipeline: Document[]): AggregationCursor {
    return this.collection.aggregate(pipeline, this._getSessionOpts())
  }


  // ── ID handling ──────────────────────────────────────────────────────────

  get idType(): 'string' | 'number' | 'objectId' {
    const idProp = (this._table.type as any).type.props.get('_id')
    const idTags = idProp?.type.tags
    if ((idTags as Set<string>)?.has('objectId') && (idTags as Set<string>)?.has('mongo')) {
      return 'objectId'
    }
    if (idProp?.type.kind === '') {
      return idProp.type.designType as 'string' | 'number'
    }
    return 'objectId' // fallback
  }

  override prepareId(id: unknown, fieldType: TAtscriptAnnotatedType): unknown {
    const tags = fieldType.type.tags
    if ((tags as Set<string>)?.has('objectId') && (tags as Set<string>)?.has('mongo')) {
      return id instanceof ObjectId ? id : new ObjectId(id as string)
    }
    if (fieldType.type.kind === '') {
      const dt = (fieldType.type as any).designType
      if (dt === 'number') { return Number(id) }
    }
    return String(id)
  }

  /**
   * Convenience method that uses `idType` to transform an ID value.
   * For use in controllers that don't have access to the field type.
   */
  prepareIdFromIdType<D = string | number | ObjectId>(id: string | number | ObjectId): D {
    switch (this.idType) {
      case 'objectId': {
        return (id instanceof ObjectId ? id : new ObjectId(id as string)) as D
      }
      case 'number': {
        return Number(id) as D
      }
      case 'string': {
        return String(id) as D
      }
      default: {
        throw new Error('Unknown "_id" type')
      }
    }
  }

  // ── Adapter capability overrides ─────────────────────────────────────────

  override supportsNestedObjects(): boolean {
    return true
  }

  override supportsNativePatch(): boolean {
    return true
  }

  override getValidatorPlugins(): TValidatorPlugin[] {
    return [validateMongoIdPlugin]
  }

  override getTopLevelArrayTag(): string {
    return 'db.mongo.__topLevelArray'
  }

  override getAdapterTableName(type: TAtscriptAnnotatedType): string | undefined {
    // @db.mongo.collection may inject _id but doesn't provide a name;
    // the table name comes from @db.table (handled by AtscriptDbTable).
    return undefined
  }

  // ── Insert validator ─────────────────────────────────────────────────────

  override buildInsertValidator(table: AtscriptDbTable): any {
    return table.createValidator({
      plugins: this.getValidatorPlugins(),
      replace: (type, path) => {
        // Make ObjectId primary keys optional (auto-generated)
        if (path === '_id' && (type.type.tags as Set<string>)?.has('objectId')) {
          return { ...type, optional: true }
        }
        // Make fields with defaults optional (applied before write)
        if (table.defaults.has(path)) {
          return { ...type, optional: true }
        }
        return type
      },
    })
  }

  // ── Patch validator ──────────────────────────────────────────────────────

  override buildPatchValidator(table: AtscriptDbTable): any {
    return CollectionPatcher.prepareValidator(this.getPatcherContext())
  }

  /** Returns the context object used by CollectionPatcher. */
  getPatcherContext(): TCollectionPatcherContext {
    return {
      flatMap: this._table.flatMap,
      prepareId: (id: any) => this.prepareIdFromIdType(id),
      createValidator: (opts?: Partial<TValidatorOptions>) =>
        this._table.createValidator(opts) as Validator<any>,
    }
  }

  // ── Native patch ─────────────────────────────────────────────────────────

  override async nativePatch(filter: FilterExpr, patch: unknown): Promise<TDbUpdateResult> {
    const mongoFilter = buildMongoFilter(filter)
    const patcher = new CollectionPatcher(this.getPatcherContext(), patch)
    const { updateFilter, updateOptions } = patcher.preparePatch()
    this._log('updateOne (patch)', mongoFilter, updateFilter)
    const result = await this.collection.updateOne(mongoFilter, updateFilter, { ...updateOptions, ...this._getSessionOpts() })
    return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount }
  }

  // ── Annotation scanning hooks ────────────────────────────────────────────

  override onBeforeFlatten(type: TAtscriptAnnotatedType): void {
    const typeMeta = type.metadata

    // @db.mongo.capped → store for ensureCollectionExists
    const capped = typeMeta.get('db.mongo.capped') as
      | { size: number; max?: number }
      | undefined
    if (capped) {
      this._cappedOptions = { size: capped.size, max: capped.max }
    }

    const dynamicText = typeMeta.get('db.mongo.search.dynamic') as any
    if (dynamicText) {
      this._setSearchIndex('dynamic_text', '_', {
        mappings: { dynamic: true },
        analyzer: dynamicText.analyzer,
        text: { fuzzy: { maxEdits: dynamicText.fuzzy || 0 } },
      })
    }
    for (const textSearch of (typeMeta.get('db.mongo.search.static') as any[]) || []) {
      this._setSearchIndex('search_text', textSearch.indexName, {
        mappings: { fields: {} },
        analyzer: textSearch.analyzer,
        text: { fuzzy: { maxEdits: textSearch.fuzzy || 0 } },
      })
    }
  }

  override onFieldScanned(
    field: string,
    type: TAtscriptAnnotatedType,
    metadata: TMetadataMap<AtscriptMetadata>
  ): void {
    // @meta.id on non-_id fields → unique index (not primary key in MongoDB)
    // Remove from primaryKeys (generic layer adds it), register as unique field for findById fallback
    if (field !== '_id' && metadata.has('meta.id')) {
      this._table.removePrimaryKey(field)
      this._addMongoIndexField('unique', '__pk', field)
      this._table.addUniqueField(field)
    }
    // @db.default.fn "increment" → track for auto-increment on insert
    const defaultFn = metadata.get('db.default.fn') as string | undefined
    if (defaultFn === 'increment') {
      const physicalName = (metadata.get('db.column.name') as string | undefined) ?? field
      this._incrementFields.add(physicalName)
    }
    // @db.index.fulltext → MongoDB text index (adapter-level, with weight)
    for (const index of (metadata.get('db.index.fulltext') as any[]) || []) {
      const name = index === true ? '' : (index.name || '')
      const weight = (index !== true && typeof index === 'object') ? (index.weight || 1) : 1
      this._addMongoIndexField('text', name, field, weight)
    }
    // @db.mongo.search.text
    for (const index of (metadata.get('db.mongo.search.text') as any[]) || []) {
      this._addFieldToSearchIndex('search_text', index.indexName, field, index.analyzer)
    }
    // @db.mongo.search.vector
    const vectorIndex = metadata.get('db.mongo.search.vector') as any
    if (vectorIndex) {
      this._setSearchIndex('vector', vectorIndex.indexName || field, {
        fields: [
          {
            type: 'vector',
            path: field,
            similarity: vectorIndex.similarity || 'dotProduct',
            numDimensions: vectorIndex.dimensions,
          },
        ],
      })
    }
    // @db.mongo.search.filter
    for (const index of (metadata.get('db.mongo.search.filter') as any[]) || []) {
      this._vectorFilters.set(mongoIndexKey('vector', index.indexName), field)
    }
  }

  override onAfterFlatten(): void {
    // MongoDB _id is always the primary key — hardcode it unconditionally
    // (can't rely on onFieldScanned since _id may be a virtual prop injected by @db.mongo.collection)
    this._table.addPrimaryKey('_id')

    // Associate vector filter fields with their vector indexes
    for (const [key, value] of this._vectorFilters.entries()) {
      const index = this._mongoIndexes.get(key)
      if (index && index.type === 'vector') {
        index.definition.fields?.push({
          type: 'filter',
          path: value,
        })
      }
    }
  }

  // ── Search index management ──────────────────────────────────────────────

  /** Returns MongoDB-specific search index map (internal). */
  getMongoSearchIndexes(): Map<string, TMongoIndex> {
    if (!this._searchIndexesMap) {
      // Trigger flattening to ensure indexes are built
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- trigger lazy init
      this._table.flatMap

      this._searchIndexesMap = new Map()
      let defaultIndex: TMongoIndex | undefined

      // Check generic text indexes from table.indexes
      for (const index of this._table.indexes.values()) {
        if (index.type === 'fulltext' && !defaultIndex) {
          // Convert generic fulltext to our TMongoIndex for search dispatch
          defaultIndex = {
            key: index.key,
            name: index.name,
            type: 'text',
            fields: Object.fromEntries(index.fields.map(f => [f.name, 'text' as const])),
            weights: Object.fromEntries(
              index.fields.filter(f => f.weight).map(f => [f.name, f.weight!])
            ),
          }
        }
      }

      for (const index of this._mongoIndexes.values()) {
        switch (index.type) {
          case 'text': {
            if (!defaultIndex) { defaultIndex = index }
            break
          }
          case 'dynamic_text': {
            defaultIndex = index
            break
          }
          case 'search_text': {
            if (!defaultIndex || defaultIndex.type === 'text') { defaultIndex = index }
            this._searchIndexesMap.set(index.name, index)
            break
          }
          case 'vector': {
            this._searchIndexesMap.set(index.name, index)
            break
          }
          default:
        }
      }

      if (defaultIndex && !this._searchIndexesMap.has(DEFAULT_INDEX_NAME)) {
        this._searchIndexesMap.set(DEFAULT_INDEX_NAME, defaultIndex)
      }
    }
    return this._searchIndexesMap
  }

  /** Returns a specific MongoDB search index by name. */
  getMongoSearchIndex(name = DEFAULT_INDEX_NAME): TMongoIndex | undefined {
    return this.getMongoSearchIndexes().get(name)
  }

  // ── BaseDbAdapter search overrides ──────────────────────────────────────

  /** Returns available search indexes as generic metadata for UI. */
  override getSearchIndexes(): TSearchIndexInfo[] {
    const mongoIndexes = this.getMongoSearchIndexes()
    return [...mongoIndexes.entries()].map(([name, index]) => ({
      name,
      description: `${index.type} index`,
    }))
  }

  /**
   * Builds a MongoDB `$search` pipeline stage.
   * Override `buildVectorSearchStage` in subclasses to provide embeddings.
   */
  protected buildSearchStage(text: string, indexName?: string): Document | undefined {
    const index = this.getMongoSearchIndex(indexName)
    if (!index) { return undefined }
    if (index.type === 'vector') {
      return this.buildVectorSearchStage(text, index)
    }
    return {
      $search: { index: index.key, text: { query: text, path: { wildcard: '*' } } },
    }
  }

  /**
   * Builds a vector search stage. Override in subclasses to generate embeddings.
   * Returns `undefined` by default (vector search requires custom implementation).
   */
  protected buildVectorSearchStage(text: string, index: TMongoIndex): Document | undefined {
    return undefined
  }

  override async search(
    text: string,
    query: DbQuery,
    indexName?: string
  ): Promise<Array<Record<string, unknown>>> {
    const searchStage = this.buildSearchStage(text, indexName)
    if (!searchStage) {
      throw new Error(indexName ? `Search index "${indexName}" not found` : 'No search index available')
    }

    const filter = buildMongoFilter(query.filter)
    const controls = query.controls || {}
    const pipeline: Document[] = [searchStage, { $match: filter }]
    if (controls.$sort) { pipeline.push({ $sort: controls.$sort }) }
    if (controls.$skip) { pipeline.push({ $skip: controls.$skip }) }
    if (controls.$limit) { pipeline.push({ $limit: controls.$limit }) }
    else { pipeline.push({ $limit: 1000 }) }
    if (controls.$select) { pipeline.push({ $project: controls.$select.asProjection }) }

    this._log('aggregate (search)', pipeline)
    return this.collection.aggregate(pipeline, this._getSessionOpts()).toArray()
  }

  override async searchWithCount(
    text: string,
    query: DbQuery,
    indexName?: string
  ): Promise<{ data: Array<Record<string, unknown>>; count: number }> {
    const searchStage = this.buildSearchStage(text, indexName)
    if (!searchStage) {
      throw new Error(indexName ? `Search index "${indexName}" not found` : 'No search index available')
    }

    const filter = buildMongoFilter(query.filter)
    const controls = query.controls || {}
    const pipeline: Document[] = [
      searchStage,
      { $match: filter },
      {
        $facet: {
          data: [
            controls.$sort ? { $sort: controls.$sort } : undefined,
            controls.$skip ? { $skip: controls.$skip } : undefined,
            controls.$limit ? { $limit: controls.$limit } : undefined,
            controls.$select ? { $project: controls.$select.asProjection } : undefined,
          ].filter(Boolean),
          meta: [{ $count: 'count' }],
        },
      },
    ]

    this._log('aggregate (searchWithCount)', pipeline)
    const result = await this.collection.aggregate(pipeline, this._getSessionOpts()).toArray()
    return {
      data: result[0]?.data || [],
      count: result[0]?.meta[0]?.count || 0,
    }
  }

  override async findManyWithCount(
    query: DbQuery
  ): Promise<{ data: Array<Record<string, unknown>>; count: number }> {
    const filter = buildMongoFilter(query.filter)
    const controls = query.controls || {}
    const pipeline: Document[] = [
      { $match: filter },
      {
        $facet: {
          data: [
            controls.$sort ? { $sort: controls.$sort } : undefined,
            controls.$skip ? { $skip: controls.$skip } : undefined,
            controls.$limit ? { $limit: controls.$limit } : undefined,
            controls.$select ? { $project: controls.$select.asProjection } : undefined,
          ].filter(Boolean),
          meta: [{ $count: 'count' }],
        },
      },
    ]

    this._log('aggregate (findManyWithCount)', pipeline)
    const result = await this.collection.aggregate(pipeline, this._getSessionOpts()).toArray()
    return {
      data: result[0]?.data || [],
      count: result[0]?.meta[0]?.count || 0,
    }
  }

  // ── Collection existence ─────────────────────────────────────────────────

  async collectionExists(): Promise<boolean> {
    if (this.asMongo) {
      return this.asMongo.collectionExists(this._table.tableName)
    }
    const cols = await this.db.listCollections({ name: this._table.tableName }).toArray()
    return cols.length > 0
  }

  async ensureCollectionExists(): Promise<void> {
    const exists = await this.collectionExists()
    if (!exists) {
      this._log('createCollection', this._table.tableName)
      const opts: Record<string, unknown> = {
        comment: 'Created by Atscript Mongo Adapter',
      }
      if (this._cappedOptions) {
        opts.capped = true
        opts.size = this._cappedOptions.size
        if (this._cappedOptions.max !== null && this._cappedOptions.max !== undefined) {
          opts.max = this._cappedOptions.max
        }
      }
      await this.db.createCollection(this._table.tableName, opts)
    }
  }

  // ── CRUD implementation ──────────────────────────────────────────────────

  async insertOne(data: Record<string, unknown>): Promise<TDbInsertResult> {
    if (this._incrementFields.size > 0) {
      const fields = this._fieldsNeedingIncrement(data)
      if (fields.length > 0) {
        const maxValues = await this._getMaxValues(fields)
        for (const physical of fields) {
          data[physical] = (maxValues.get(physical) ?? 0) + 1
        }
      }
    }
    this._log('insertOne', data)
    const result = await this.collection.insertOne(data, this._getSessionOpts())
    return { insertedId: result.insertedId }
  }

  async insertMany(data: Array<Record<string, unknown>>): Promise<TDbInsertManyResult> {
    if (this._incrementFields.size > 0) {
      // Collect all increment fields that any item needs
      const allFields = new Set<string>()
      for (const item of data) {
        for (const f of this._fieldsNeedingIncrement(item)) {
          allFields.add(f)
        }
      }

      if (allFields.size > 0) {
        const maxValues = await this._getMaxValues([...allFields])

        // Walk items in order (matching SQLite behavior):
        // no value → ++max; explicit value → keep it, update max if larger
        for (const item of data) {
          for (const physical of allFields) {
            if (item[physical] === undefined || item[physical] === null) {
              const next = (maxValues.get(physical) ?? 0) + 1
              item[physical] = next
              maxValues.set(physical, next)
            } else if (typeof item[physical] === 'number') {
              const current = maxValues.get(physical) ?? 0
              if ((item[physical] as number) > current) {
                maxValues.set(physical, item[physical] as number)
              }
            }
          }
        }
      }
    }

    this._log('insertMany', `${data.length} docs`)
    const result = await this.collection.insertMany(data, this._getSessionOpts())
    return {
      insertedCount: result.insertedCount,
      insertedIds: Object.values(result.insertedIds),
    }
  }

  async findOne(query: DbQuery): Promise<Record<string, unknown> | null> {
    const filter = buildMongoFilter(query.filter)
    const opts = this._buildFindOptions(query.controls)
    this._log('findOne', filter, opts)
    return this.collection.findOne(filter, { ...opts, ...this._getSessionOpts() })
  }

  async findMany(query: DbQuery): Promise<Array<Record<string, unknown>>> {
    const filter = buildMongoFilter(query.filter)
    const opts = this._buildFindOptions(query.controls)
    this._log('findMany', filter, opts)
    // eslint-disable-next-line unicorn/no-array-method-this-argument -- MongoDB Collection.find, not Array.find
    return this.collection.find(filter, { ...opts, ...this._getSessionOpts() }).toArray()
  }

  async count(query: DbQuery): Promise<number> {
    const filter = buildMongoFilter(query.filter)
    this._log('countDocuments', filter)
    return this.collection.countDocuments(filter, this._getSessionOpts())
  }

  async updateOne(
    filter: FilterExpr,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult> {
    const mongoFilter = buildMongoFilter(filter)
    this._log('updateOne', mongoFilter, { $set: data })
    const result = await this.collection.updateOne(mongoFilter, { $set: data }, this._getSessionOpts())
    return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount }
  }

  async replaceOne(
    filter: FilterExpr,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult> {
    const mongoFilter = buildMongoFilter(filter)
    this._log('replaceOne', mongoFilter, data)
    const result = await this.collection.replaceOne(mongoFilter, data, this._getSessionOpts())
    return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount }
  }

  async deleteOne(filter: FilterExpr): Promise<TDbDeleteResult> {
    const mongoFilter = buildMongoFilter(filter)
    this._log('deleteOne', mongoFilter)
    const result = await this.collection.deleteOne(mongoFilter, this._getSessionOpts())
    return { deletedCount: result.deletedCount }
  }

  async updateMany(
    filter: FilterExpr,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult> {
    const mongoFilter = buildMongoFilter(filter)
    this._log('updateMany', mongoFilter, { $set: data })
    const result = await this.collection.updateMany(mongoFilter, { $set: data }, this._getSessionOpts())
    return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount }
  }

  async replaceMany(
    filter: FilterExpr,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult> {
    // MongoDB has no native replaceMany; use updateMany with $set
    const mongoFilter = buildMongoFilter(filter)
    this._log('replaceMany', mongoFilter, { $set: data })
    const result = await this.collection.updateMany(mongoFilter, { $set: data }, this._getSessionOpts())
    return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount }
  }

  async deleteMany(filter: FilterExpr): Promise<TDbDeleteResult> {
    const mongoFilter = buildMongoFilter(filter)
    this._log('deleteMany', mongoFilter)
    const result = await this.collection.deleteMany(mongoFilter, this._getSessionOpts())
    return { deletedCount: result.deletedCount }
  }

  // ── Schema / Index sync ──────────────────────────────────────────────────

  async ensureTable(): Promise<void> {
    return this.ensureCollectionExists()
  }

  async dropTable(): Promise<void> {
    this._log('drop', this._table.tableName)
    await this.collection.drop()
    this._collection = undefined
  }

  async syncIndexes(): Promise<void> {
    await this.ensureCollectionExists()

    // Merge generic indexes with MongoDB-specific indexes
    const allIndexes = new Map<string, TMongoIndex>()

    // Convert generic table indexes to MongoDB format
    for (const [key, index] of this._table.indexes.entries()) {
      const fields: Record<string, 1 | 'text'> = {}
      const weights: Record<string, number> = {}
      let mongoType: TPlainIndex['type']
      if (index.type === 'fulltext') {
        mongoType = 'text'
        for (const f of index.fields) {
          fields[f.name] = 'text'
          if (f.weight) { weights[f.name] = f.weight }
        }
      } else {
        mongoType = index.type as 'plain' | 'unique'
        for (const f of index.fields) {
          fields[f.name] = 1
        }
      }
      allIndexes.set(key, { key, name: index.name, type: mongoType, fields, weights })
    }

    // Add MongoDB-specific indexes (search, vector, text from adapter scanning)
    for (const [key, index] of this._mongoIndexes.entries()) {
      if (index.type === 'text') {
        // Merge adapter-scanned text indexes into any existing generic fulltext
        const existing = allIndexes.get(key)
        if (existing && existing.type === 'text') {
          Object.assign(existing.fields, index.fields)
          Object.assign(existing.weights, index.weights)
        } else {
          allIndexes.set(key, index)
        }
      } else {
        allIndexes.set(key, index)
      }
    }

    // ── Sync regular indexes ─────────────────────────────────────────
    const existingIndexes = (await this.collection.listIndexes().toArray()) as TRemoteMongoIndex[]

    const indexesToCreate = new Map(allIndexes)

    for (const remote of existingIndexes) {
      if (!remote.name.startsWith(INDEX_PREFIX)) { continue }
      if (indexesToCreate.has(remote.name)) {
        const local = indexesToCreate.get(remote.name)!
        switch (local.type) {
          case 'plain':
          case 'unique':
          case 'text': {
            if (
              (local.type === 'text' || objMatch(local.fields, remote.key)) &&
              objMatch(local.weights || {}, remote.weights || {})
            ) {
              indexesToCreate.delete(remote.name)
            } else {
              this._log('dropIndex', remote.name)
              await this.collection.dropIndex(remote.name)
            }
            break
          }
          default:
        }
      } else {
        this._log('dropIndex', remote.name)
        await this.collection.dropIndex(remote.name)
      }
    }

    // ── Create / update regular indexes ─────────────────────────────
    for (const [key, value] of allIndexes.entries()) {
      switch (value.type) {
        case 'plain': {
          if (!indexesToCreate.has(key)) { continue }
          this._log('createIndex', key, value.fields)
          await this.collection.createIndex(value.fields, { name: key })
          break
        }
        case 'unique': {
          if (!indexesToCreate.has(key)) { continue }
          this._log('createIndex (unique)', key, value.fields)
          await this.collection.createIndex(value.fields, { name: key, unique: true })
          break
        }
        case 'text': {
          if (!indexesToCreate.has(key)) { continue }
          this._log('createIndex (text)', key, value.fields)
          await this.collection.createIndex(value.fields, { weights: value.weights, name: key })
          break
        }
        default:
      }
    }

    // ── Sync search indexes (Atlas-only, gracefully skipped on standalone) ──
    try {
      const toUpdate = new Set<string>()
      const existingSearchIndexes = (await this.collection
        .listSearchIndexes()
        .toArray()) as TRemoteMongoSearchIndex[]

      for (const remote of existingSearchIndexes) {
        if (!remote.name.startsWith(INDEX_PREFIX)) { continue }
        if (indexesToCreate.has(remote.name)) {
          const local = indexesToCreate.get(remote.name)!
          const right = remote.latestDefinition
          switch (local.type) {
            case 'dynamic_text':
            case 'search_text': {
              const left = local.definition
              if (
                left.analyzer === right.analyzer &&
                fieldsMatch(left.mappings!.fields || {}, right.mappings!.fields || {})
              ) {
                indexesToCreate.delete(remote.name)
              } else {
                toUpdate.add(remote.name)
              }
              break
            }
            case 'vector': {
              if (vectorFieldsMatch(local.definition.fields || [], right.fields || [])) {
                indexesToCreate.delete(remote.name)
              } else {
                toUpdate.add(remote.name)
              }
              break
            }
            default:
          }
        } else {
          if (remote.status !== 'DELETING') {
            this._log('dropSearchIndex', remote.name)
            await this.collection.dropSearchIndex(remote.name)
          }
        }
      }

      for (const [key, value] of indexesToCreate.entries()) {
        switch (value.type) {
          case 'dynamic_text':
          case 'search_text':
          case 'vector': {
            if (toUpdate.has(key)) {
              this._log('updateSearchIndex', key, value.definition)
              await this.collection.updateSearchIndex(key, value.definition)
            } else {
              this._log('createSearchIndex', key, value.type)
              await this.collection.createSearchIndex({
                name: key,
                type: value.type === 'vector' ? 'vectorSearch' : 'search',
                definition: value.definition,
              })
            }
            break
          }
          default:
        }
      }
    } catch {
      // listSearchIndexes / createSearchIndex / updateSearchIndex are
      // Atlas-only — silently skip on standalone or in-memory MongoDB.
    }
  }

  // ── Auto-increment helpers ────────────────────────────────────────────────

  /** Returns physical field names of increment fields that are undefined in the data. */
  private _fieldsNeedingIncrement(data: Record<string, unknown>): string[] {
    const result: string[] = []
    for (const physical of this._incrementFields) {
      if (data[physical] === undefined || data[physical] === null) {
        result.push(physical)
      }
    }
    return result
  }

  /** Reads current max value for each field via $group aggregation. */
  private async _getMaxValues(physicalFields: string[]): Promise<Map<string, number>> {
    const aliases = physicalFields.map(f => [`max__${f.replace(/\./g, '__')}`, f] as const)
    const group: Record<string, unknown> = { _id: null }
    for (const [alias, field] of aliases) {
      group[alias] = { $max: `$${field}` }
    }
    const result = await this.collection.aggregate([{ $group: group }], this._getSessionOpts()).toArray()
    const maxMap = new Map<string, number>()
    if (result.length > 0) {
      const row = result[0]
      for (const [alias, field] of aliases) {
        const val = row[alias]
        maxMap.set(field, typeof val === 'number' ? val : 0)
      }
    }
    return maxMap
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  private _buildFindOptions(controls?: DbQuery['controls']) {
    const opts: Record<string, any> = {}
    if (!controls) { return opts }
    if (controls.$sort) { opts.sort = controls.$sort }
    if (controls.$limit) { opts.limit = controls.$limit }
    if (controls.$skip) { opts.skip = controls.$skip }
    if (controls.$select) { opts.projection = controls.$select.asProjection }
    return opts
  }

  protected _addMongoIndexField(
    type: TPlainIndex['type'],
    name: string,
    field: string,
    weight?: number
  ) {
    const key = mongoIndexKey(type, name)
    let index = this._mongoIndexes.get(key) as TPlainIndex | undefined
    const value = type === 'text' ? 'text' : 1
    if (index) {
      index.fields[field] = value
    } else {
      index = { key, name, type, fields: { [field]: value }, weights: {} }
      this._mongoIndexes.set(key, index)
    }
    if (weight) {
      index.weights[field] = weight
    }
  }

  protected _setSearchIndex(
    type: TSearchIndex['type'],
    name: string | undefined,
    definition: TMongoSearchIndexDefinition
  ) {
    const key = mongoIndexKey(type, name || DEFAULT_INDEX_NAME)
    this._mongoIndexes.set(key, {
      key,
      name: name || DEFAULT_INDEX_NAME,
      type,
      definition,
    })
  }

  protected _addFieldToSearchIndex(
    type: TSearchIndex['type'],
    _name: string | undefined,
    fieldName: string,
    analyzer?: string
  ) {
    const name = _name || DEFAULT_INDEX_NAME
    let index = this._mongoIndexes.get(mongoIndexKey(type, name)) as TSearchIndex | undefined
    if (!index && type === 'search_text') {
      this._setSearchIndex(type, name, {
        mappings: { fields: {} },
        text: { fuzzy: { maxEdits: 0 } },
      })
      index = this._mongoIndexes.get(mongoIndexKey(type, name)) as TSearchIndex | undefined
    }
    if (index) {
      index.definition.mappings!.fields![fieldName] = { type: 'string' }
      if (analyzer) {
        index.definition.mappings!.fields![fieldName].analyzer = analyzer
      }
    }
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

type TVectorSimilarity = 'cosine' | 'euclidean' | 'dotProduct'

export interface TMongoSearchIndexDefinition {
  mappings?: {
    dynamic?: boolean
    fields?: Record<string, { type: string; analyzer?: string }>
  }
  fields?: Array<{
    path: string
    type: 'filter' | 'vector'
    similarity?: TVectorSimilarity
    numDimensions?: number
  }>
  analyzer?: string
  text?: { fuzzy?: { maxEdits: number } }
}

interface TRemoteMongoIndex {
  v: number
  key: { _fts: 'text'; _ftsx: 1 } | Record<string, number>
  name: string
  weights?: Record<string, number>
  default_language?: string
  textIndexVersion: number
}

interface TRemoteMongoSearchIndex {
  id: string
  name: string
  type: 'search' | 'vectorSearch'
  status: string
  queryable: boolean
  latestDefinition: TMongoSearchIndexDefinition
}

// ── Helper functions ─────────────────────────────────────────────────────────

function objMatch(
  o1: Record<string, number | string>,
  o2: Record<string, number | string>
): boolean {
  const keys1 = Object.keys(o1)
  const keys2 = Object.keys(o2)
  if (keys1.length !== keys2.length) { return false }
  return keys1.every(key => o1[key] === o2[key])
}

function fieldsMatch(
  left: Record<string, { type: string; analyzer?: string }> | undefined,
  right: Record<string, { type: string; analyzer?: string }> | undefined
): boolean {
  if (!left || !right) { return left === right }
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) { return false }
  return leftKeys.every(key => {
    if (!(key in right)) { return false }
    return left[key].type === right[key].type && left[key].analyzer === right[key].analyzer
  })
}

function vectorFieldsMatch(
  left: Required<TMongoSearchIndexDefinition>['fields'],
  right: Required<TMongoSearchIndexDefinition>['fields']
): boolean {
  const leftMap = new Map(left.map(f => [f.path, f]))
  const rightMap = new Map((right || []).map(f => [f.path, f]))
  if (leftMap.size !== rightMap.size) { return false }
  for (const [key, l] of leftMap.entries()) {
    const r = rightMap.get(key)
    if (!r) { return false }
    if (l.type !== r.type || l.path !== r.path || l.similarity !== r.similarity || l.numDimensions !== r.numDimensions) {
      return false
    }
  }
  return true
}

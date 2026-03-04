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
  type FilterExpr,
  type Uniquery,
  type TDbIndex,
  type TDbInsertResult,
  type TDbInsertManyResult,
  type TDbUpdateResult,
  type TDbDeleteResult,
} from '@atscript/utils-db'
import type {
  AggregationCursor,
  Collection,
  Db,
  Document,
  Filter,
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

// ── Native calls ─────────────────────────────────────────────────────────────

export interface MongoNativeCalls {
  aggregate: { args: Document[]; result: AggregationCursor }
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export class MongoAdapter extends BaseDbAdapter<MongoNativeCalls> {
  private _collection?: Collection<any>

  /** MongoDB-specific indexes (search, vector) — separate from table.indexes. */
  protected _mongoIndexes = new Map<string, TMongoIndex>()

  /** Vector search filter associations built during flattening. */
  protected _vectorFilters = new Map<string, string>()

  /** Cached search index lookup. */
  protected _searchIndexesMap?: Map<string, TMongoIndex>

  constructor(
    protected readonly db: Db,
    protected readonly asMongo?: AsMongo
  ) {
    super()
  }

  // ── Collection access ────────────────────────────────────────────────────

  get collection(): Collection<any> {
    if (!this._collection) {
      this._collection = this.db.collection(this.resolveTableName(false))
    }
    return this._collection
  }

  aggregate(pipeline: Document[]): AggregationCursor {
    return this.collection.aggregate(pipeline)
  }

  override nativeCall<K extends keyof MongoNativeCalls & string>(
    name: K,
    opts: MongoNativeCalls[K]['args']
  ): MongoNativeCalls[K]['result'] {
    switch (name) {
      case 'aggregate':
        return this.aggregate(opts as Document[]) as MongoNativeCalls[K]['result']
      default:
        throw new Error(`Unknown native call: ${name}`)
    }
  }

  // ── ID handling ──────────────────────────────────────────────────────────

  get idType(): 'string' | 'number' | 'objectId' {
    const idProp = (this._table.type as any).type.props.get('_id')
    const idTags = idProp?.type.tags
    if (idTags?.has('objectId') && idTags?.has('mongo')) {
      return 'objectId'
    }
    if (idProp?.type.kind === '') {
      return idProp.type.designType as 'string' | 'number'
    }
    return 'objectId' // fallback
  }

  override prepareId(id: unknown, fieldType: TAtscriptAnnotatedType): unknown {
    const tags = fieldType.type.tags
    if (tags?.has('objectId') && tags?.has('mongo')) {
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
      case 'objectId':
        return (id instanceof ObjectId ? id : new ObjectId(id as string)) as D
      case 'number':
        return Number(id) as D
      case 'string':
        return String(id) as D
      default:
        throw new Error('Unknown "_id" type')
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
        // Only make ObjectId primary keys optional (auto-generated)
        if (path === '_id' && type.type.tags?.has('objectId')) {
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
    const result = await this.collection.updateOne(mongoFilter, updateFilter, updateOptions)
    return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount }
  }

  // ── Annotation scanning hooks ────────────────────────────────────────────

  override onBeforeFlatten(type: TAtscriptAnnotatedType): void {
    const typeMeta = type.metadata
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
    // In MongoDB, _id is always the primary key
    if (field === '_id') {
      this._table.addPrimaryKey('_id')
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

  getSearchIndexes(): Map<string, TMongoIndex> {
    if (!this._searchIndexesMap) {
      // Trigger flattening to ensure indexes are built
      void this._table.flatMap

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

  getSearchIndex(name = DEFAULT_INDEX_NAME): TMongoIndex | undefined {
    return this.getSearchIndexes().get(name)
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
      await this.db.createCollection(this._table.tableName, {
        comment: 'Created by Atscript Mongo Adapter',
      })
    }
  }

  // ── CRUD implementation ──────────────────────────────────────────────────

  async insertOne(data: Record<string, unknown>): Promise<TDbInsertResult> {
    const result = await this.collection.insertOne(data)
    return { insertedId: result.insertedId }
  }

  async insertMany(data: Array<Record<string, unknown>>): Promise<TDbInsertManyResult> {
    const result = await this.collection.insertMany(data)
    return {
      insertedCount: result.insertedCount,
      insertedIds: Object.values(result.insertedIds),
    }
  }

  async findOne(query: Uniquery): Promise<Record<string, unknown> | null> {
    const filter = buildMongoFilter(query.filter)
    const opts = this._buildFindOptions(query.controls)
    return this.collection.findOne(filter, opts)
  }

  async findMany(query: Uniquery): Promise<Array<Record<string, unknown>>> {
    const filter = buildMongoFilter(query.filter)
    const opts = this._buildFindOptions(query.controls)
    return this.collection.find(filter, opts).toArray()
  }

  async count(query: Uniquery): Promise<number> {
    const filter = buildMongoFilter(query.filter)
    return this.collection.countDocuments(filter)
  }

  async updateOne(
    filter: FilterExpr,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult> {
    const mongoFilter = buildMongoFilter(filter)
    const result = await this.collection.updateOne(mongoFilter, { $set: data })
    return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount }
  }

  async replaceOne(
    filter: FilterExpr,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult> {
    const mongoFilter = buildMongoFilter(filter)
    const result = await this.collection.replaceOne(mongoFilter, data)
    return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount }
  }

  async deleteOne(filter: FilterExpr): Promise<TDbDeleteResult> {
    const mongoFilter = buildMongoFilter(filter)
    const result = await this.collection.deleteOne(mongoFilter)
    return { deletedCount: result.deletedCount }
  }

  async updateMany(
    filter: FilterExpr,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult> {
    const mongoFilter = buildMongoFilter(filter)
    const result = await this.collection.updateMany(mongoFilter, { $set: data })
    return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount }
  }

  async replaceMany(
    filter: FilterExpr,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult> {
    // MongoDB has no native replaceMany; use updateMany with $set
    const mongoFilter = buildMongoFilter(filter)
    const result = await this.collection.updateMany(mongoFilter, { $set: data })
    return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount }
  }

  async deleteMany(filter: FilterExpr): Promise<TDbDeleteResult> {
    const mongoFilter = buildMongoFilter(filter)
    const result = await this.collection.deleteMany(mongoFilter)
    return { deletedCount: result.deletedCount }
  }

  // ── Schema / Index sync ──────────────────────────────────────────────────

  async ensureTable(): Promise<void> {
    return this.ensureCollectionExists()
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
              await this.collection.dropIndex(remote.name)
            }
            break
          }
          default:
        }
      } else {
        await this.collection.dropIndex(remote.name)
      }
    }

    // ── Sync search indexes ──────────────────────────────────────────
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
          await this.collection.dropSearchIndex(remote.name)
        }
      }
    }

    // ── Create / update ──────────────────────────────────────────────
    for (const [key, value] of indexesToCreate.entries()) {
      switch (value.type) {
        case 'plain': {
          await this.collection.createIndex(value.fields, { name: key })
          break
        }
        case 'unique': {
          await this.collection.createIndex(value.fields, { name: key, unique: true })
          break
        }
        case 'text': {
          await this.collection.createIndex(value.fields, { weights: value.weights, name: key })
          break
        }
        case 'dynamic_text':
        case 'search_text':
        case 'vector': {
          if (toUpdate.has(key)) {
            await this.collection.updateSearchIndex(key, value.definition)
          } else {
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
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  private _buildFindOptions(controls?: Uniquery['controls']) {
    const opts: Record<string, any> = {}
    if (!controls) { return opts }
    if (controls.$sort) { opts.sort = controls.$sort }
    if (controls.$limit) { opts.limit = controls.$limit }
    if (controls.$skip) { opts.skip = controls.$skip }
    if (controls.$select) { opts.projection = controls.$select }
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

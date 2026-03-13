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
  DbError,
  AtscriptDbView,
  type DbQuery,
  type FilterExpr,
  type TDbInsertResult,
  type TDbInsertManyResult,
  type TDbUpdateResult,
  type TDbDeleteResult,
  type TSearchIndexInfo,
  type TDbRelation,
  type TDbForeignKey,
  type TTableResolver,
  type WithRelation,
  type AtscriptQueryFieldRef,
  type AtscriptQueryNode,
  type TColumnDiff,
  type TSyncColumnResult,
  type TDbFieldMeta,
  type TDbCollation,
  type TMetadataOverrides,
  type TableMetadata,
  computeInsights,
} from '@atscript/db-utils'
import type {
  AggregationCursor,
  ClientSession,
  CollationOptions,
  Collection,
  Db,
  Document,
  MongoClient,
} from 'mongodb'
import { MongoServerError, ObjectId } from 'mongodb'
import { CollectionPatcher, type TCollectionPatcherContext } from './collection-patcher'
import { buildMongoFilter } from './mongo-filter'
import { validateMongoIdPlugin } from './validate-plugins'

const INDEX_PREFIX = 'atscript__'
const DEFAULT_INDEX_NAME = 'DEFAULT'
const JOINED_PREFIX = '__joined_'

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

  /** Physical field names with @db.default.increment → optional start value. */
  protected _incrementFields = new Map<string, number | undefined>()

  /** Physical field names that have a non-binary collation (nocase/unicode). */
  private _collateFields?: Map<string, TDbCollation>

  /** Capped collection options from @db.mongo.capped. */
  protected _cappedOptions?: { size: number; max?: number }

  /** Whether the schema explicitly defines _id (via @db.mongo.collection or manual _id field). */
  protected _hasExplicitId = false

  /** Unique fields accumulated during onFieldScanned, returned via getMetadataOverrides. */
  private _pendingUniqueFields: string[] = []

  constructor(
    protected readonly db: Db,
    protected readonly client?: MongoClient
  ) {
    super()
  }

  // ── Transaction primitives ────────────────────────────────────────────────

  private get _client() { return this.client }

  /** Whether transaction support has been detected as unavailable (standalone MongoDB). */
  private _txDisabled = false

  protected override async _beginTransaction(): Promise<unknown> {
    if (this._txDisabled || !this._client) { return undefined }
    try {
      // Transactions require replica set or mongos — check topology
      const topology = (this._client as any).topology
      if (topology) {
        const desc = topology.description ?? topology.s?.description
        const type = desc?.type
        if (type === 'Single' || type === 'Unknown') {
          this._txDisabled = true
          return undefined
        }
      }
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

  // Uses default 'db.__topLevelArray' tag from base adapter

  override getAdapterTableName(type: TAtscriptAnnotatedType): string | undefined {
    // @db.mongo.collection may inject _id but doesn't provide a name;
    // the table name comes from @db.table (handled by AtscriptDbTable).
    return undefined
  }

  // ── Native relation loading ─────────────────────────────────────────────

  override supportsNativeRelations(): boolean {
    return true
  }

  // oxlint-disable-next-line max-params -- matches BaseDbAdapter.loadRelations() signature
  override async loadRelations(
    rows: Array<Record<string, unknown>>,
    withRelations: WithRelation[],
    relations: ReadonlyMap<string, TDbRelation>,
    foreignKeys: ReadonlyMap<string, TDbForeignKey>,
    tableResolver?: TTableResolver
  ): Promise<void> {
    if (rows.length === 0 || withRelations.length === 0) { return }

    const primaryKeys = this._table.primaryKeys as string[]

    const relMeta: Array<{ name: string; isArray: boolean; relation: TDbRelation; nestedWith?: WithRelation[]; stages: Document[] }> = []

    for (const withRel of withRelations) {
      if (withRel.name.includes('.')) { continue }

      const relation = relations.get(withRel.name)
      if (!relation) {
        throw new Error(`Unknown relation "${withRel.name}" in $with. Available relations: ${[...relations.keys()].join(', ') || '(none)'}`)
      }

      const lookupResult = this._buildRelationLookup(withRel, relation, foreignKeys, tableResolver)
      if (!lookupResult) { continue }

      relMeta.push({ name: withRel.name, isArray: lookupResult.isArray, relation, nestedWith: this._extractNestedWith(withRel), stages: lookupResult.stages })
    }

    if (relMeta.length === 0) { return }

    // If PKs are available in the rows, run $lookup aggregation pipeline
    const pkMatchFilter = this._buildPKMatchFilter(rows, primaryKeys)
    if (pkMatchFilter) {
      const pipeline: Document[] = [{ $match: pkMatchFilter }]
      for (const meta of relMeta) { pipeline.push(...meta.stages) }

      const results = await this.collection
        .aggregate(pipeline, this._getSessionOpts())
        .toArray()

      this._mergeRelationResults(rows, results, primaryKeys, relMeta)
    } else {
      // PKs not in rows (e.g. $select excluded them) — set defaults
      for (const row of rows) {
        for (const meta of relMeta) {
          row[meta.name] = meta.isArray ? [] : null
        }
      }
    }

    // Handle nested $with by delegating to target table
    await this._loadNestedRelations(rows, relMeta, tableResolver)
  }

  /** Builds a $match filter to re-select source rows by PK. */
  private _buildPKMatchFilter(
    rows: Array<Record<string, unknown>>,
    primaryKeys: string[]
  ): Document | undefined {
    if (primaryKeys.length === 1) {
      const pk = primaryKeys[0]
      const values = new Set<unknown>()
      for (const row of rows) {
        const v = row[pk]
        if (v !== null && v !== undefined) { values.add(v) }
      }
      if (values.size === 0) { return undefined }
      return { [pk]: { $in: [...values] } }
    }
    // Composite PK — build $or filter
    const seen = new Set<string>()
    const orFilters: Document[] = []
    for (const row of rows) {
      const key = primaryKeys.map(pk => String(row[pk] ?? '')).join('\0')
      if (seen.has(key)) { continue }
      seen.add(key)
      const condition: Document = {}
      let valid = true
      for (const pk of primaryKeys) {
        const val = row[pk]
        if (val === null || val === undefined) { valid = false; break }
        condition[pk] = val
      }
      if (valid) { orFilters.push(condition) }
    }
    if (orFilters.length === 0) { return undefined }
    return orFilters.length === 1 ? orFilters[0] : { $or: orFilters }
  }

  /** Dispatches to the correct $lookup builder based on relation direction. */
  private _buildRelationLookup(
    withRel: WithRelation,
    relation: TDbRelation,
    foreignKeys: ReadonlyMap<string, TDbForeignKey>,
    tableResolver?: TTableResolver
  ): { stages: Document[]; isArray: boolean } | undefined {
    switch (relation.direction) {
      case 'to': { return this._buildToLookup(withRel, relation, foreignKeys) }
      case 'from': { return this._buildFromLookup(withRel, relation, tableResolver) }
      case 'via': { return this._buildViaLookup(withRel, relation, tableResolver) }
      default: { return undefined }
    }
  }

  /** Builds `let` variable bindings and the corresponding `$expr` match for `$lookup`. */
  private _buildLookupJoin(
    localFields: string[],
    remoteFields: string[],
    varPrefix: string
  ): { letVars: Record<string, string>; exprMatch: Document } {
    const letVars = Object.fromEntries(
      localFields.map((f, i) => [`${varPrefix}${i}`, `$${f}`])
    )
    const exprMatch = remoteFields.length === 1
      ? { $eq: [`$${remoteFields[0]}`, `$$${varPrefix}0`] }
      : { $and: remoteFields.map((rf, i) => ({ $eq: [`$${rf}`, `$$${varPrefix}${i}`] })) }
    return { letVars, exprMatch }
  }

  /** $lookup for TO relations (FK is on this table → target). Always single-valued. */
  private _buildToLookup(
    withRel: WithRelation,
    relation: TDbRelation,
    foreignKeys: ReadonlyMap<string, TDbForeignKey>
  ): { stages: Document[]; isArray: boolean } | undefined {
    const fk = this._findFKForRelationLookup(relation, foreignKeys)
    if (!fk) { return undefined }

    const innerPipeline = this._buildLookupInnerPipeline(withRel, fk.targetFields)
    const { letVars, exprMatch } = this._buildLookupJoin(fk.localFields, fk.targetFields, 'fk_')

    const stages: Document[] = [{
      $lookup: {
        from: fk.targetTable,
        let: letVars,
        pipeline: [{ $match: { $expr: exprMatch } }, ...innerPipeline],
        as: withRel.name,
      },
    }, {
      $unwind: { path: `$${withRel.name}`, preserveNullAndEmptyArrays: true },
    }]

    return { stages, isArray: false }
  }

  /** $lookup for FROM relations (FK is on target → this table). */
  private _buildFromLookup(
    withRel: WithRelation,
    relation: TDbRelation,
    tableResolver?: TTableResolver
  ): { stages: Document[]; isArray: boolean } | undefined {
    const targetType = relation.targetType()
    if (!targetType || !tableResolver) { return undefined }

    const targetMeta = tableResolver(targetType)
    if (!targetMeta) { return undefined }

    const remoteFK = this._findRemoteFKFromMeta(targetMeta, this._table.tableName, relation.alias)
    if (!remoteFK) { return undefined }

    const targetTableName = this._resolveRelTargetTableName(relation)
    const innerPipeline = this._buildLookupInnerPipeline(withRel, remoteFK.fields)
    const { letVars, exprMatch } = this._buildLookupJoin(remoteFK.targetFields, remoteFK.fields, 'pk_')

    const stages: Document[] = [{
      $lookup: {
        from: targetTableName,
        let: letVars,
        pipeline: [{ $match: { $expr: exprMatch } }, ...innerPipeline],
        as: withRel.name,
      },
    }]

    if (!relation.isArray) {
      stages.push({ $unwind: { path: `$${withRel.name}`, preserveNullAndEmptyArrays: true } })
    }

    return { stages, isArray: relation.isArray }
  }

  /** $lookup for VIA relations (M:N through junction table). Always array. */
  private _buildViaLookup(
    withRel: WithRelation,
    relation: TDbRelation,
    tableResolver?: TTableResolver
  ): { stages: Document[]; isArray: boolean } | undefined {
    if (!relation.viaType || !tableResolver) { return undefined }

    const junctionType = relation.viaType()
    if (!junctionType) { return undefined }

    const junctionMeta = tableResolver(junctionType)
    if (!junctionMeta) { return undefined }

    const junctionTableName = (junctionType.metadata?.get('db.table') as string) || junctionType.id || ''
    const targetTableName = this._resolveRelTargetTableName(relation)

    const fkToThis = this._findRemoteFKFromMeta(junctionMeta, this._table.tableName)
    if (!fkToThis) { return undefined }

    const fkToTarget = this._findRemoteFKFromMeta(junctionMeta, targetTableName)
    if (!fkToTarget) { return undefined }

    const innerPipeline = this._buildLookupInnerPipeline(withRel, fkToTarget.targetFields)
    const { letVars, exprMatch } = this._buildLookupJoin(fkToThis.targetFields, fkToThis.fields, 'pk_')

    const stages: Document[] = [{
      $lookup: {
        from: junctionTableName,
        let: letVars,
        pipeline: [
          { $match: { $expr: exprMatch } },
          {
            $lookup: {
              from: targetTableName,
              localField: fkToTarget.fields[0],
              foreignField: fkToTarget.targetFields[0],
              pipeline: innerPipeline,
              as: '__target',
            },
          },
          { $unwind: { path: '$__target', preserveNullAndEmptyArrays: false } },
          { $replaceRoot: { newRoot: '$__target' } },
        ],
        as: withRel.name,
      },
    }]

    return { stages, isArray: true }
  }

  /** Builds inner pipeline stages for relation controls ($sort, $limit, $skip, $select, filter). */
  private _buildLookupInnerPipeline(
    withRel: WithRelation,
    requiredFields: string[]
  ): Document[] {
    const pipeline: Document[] = []

    // Merge flat and nested controls (same pattern as db-readable.ts)
    const flatRel = withRel as Record<string, unknown>
    const nested = (withRel.controls || {}) as Record<string, unknown>
    const filter = withRel.filter
    const sort = (nested.$sort || flatRel.$sort) as Record<string, 1 | -1> | undefined
    const limit = (nested.$limit ?? flatRel.$limit) as number | undefined
    const skip = (nested.$skip ?? flatRel.$skip) as number | undefined
    const select = (nested.$select || flatRel.$select) as string[] | undefined

    // Additional filter on the relation
    if (filter && Object.keys(filter).length > 0) {
      pipeline.push({ $match: buildMongoFilter(filter) })
    }

    if (sort) { pipeline.push({ $sort: sort }) }
    if (skip) { pipeline.push({ $skip: skip }) }
    if (limit !== null && limit !== undefined) { pipeline.push({ $limit: limit }) }

    if (select) {
      const projection: Record<string, 1 | 0> = {}
      for (const f of select) { projection[f] = 1 }
      // Ensure required FK/PK fields are in projection
      for (const f of requiredFields) { projection[f] = 1 }
      // Suppress _id if not explicitly selected
      if (!select.includes('_id') && !requiredFields.includes('_id')) {
        projection['_id'] = 0
      }
      pipeline.push({ $project: projection })
    }

    return pipeline
  }

  /** Extracts nested $with from a WithRelation's controls. */
  private _extractNestedWith(withRel: WithRelation): WithRelation[] | undefined {
    const flatRel = withRel as Record<string, unknown>
    const nested = (withRel.controls || {}) as Record<string, unknown>
    const nestedWith = (nested.$with || flatRel.$with) as WithRelation[] | undefined
    return nestedWith && nestedWith.length > 0 ? nestedWith : undefined
  }

  /** Post-processes nested $with by delegating to the target table's own relation loading. */
  private async _loadNestedRelations(
    rows: Array<Record<string, unknown>>,
    relMeta: Array<{ name: string; isArray: boolean; relation: TDbRelation; nestedWith?: WithRelation[] }>,
    tableResolver?: TTableResolver
  ): Promise<void> {
    if (!tableResolver) { return }

    const tasks: Array<Promise<void>> = []

    for (const meta of relMeta) {
      if (!meta.nestedWith || meta.nestedWith.length === 0) { continue }

      const targetType = meta.relation.targetType()
      if (!targetType) { continue }

      const targetTable = tableResolver(targetType)
      if (!targetTable) { continue }

      // Collect all sub-rows from this relation across all parent rows
      const subRows: Array<Record<string, unknown>> = []
      for (const row of rows) {
        const val = row[meta.name]
        if (meta.isArray && Array.isArray(val)) {
          for (const item of val) { subRows.push(item) }
        } else if (val && typeof val === 'object') {
          subRows.push(val as Record<string, unknown>)
        }
      }

      if (subRows.length === 0) { continue }

      // Delegate to target table's loadRelations — uses the correct adapter and collection
      tasks.push(targetTable.loadRelations(subRows, meta.nestedWith))
    }

    await Promise.all(tasks)
  }

  /** Merges aggregation results back onto the original rows by PK. */
  private _mergeRelationResults(
    rows: Array<Record<string, unknown>>,
    results: Array<Record<string, unknown>>,
    primaryKeys: string[],
    relMeta: Array<{ name: string; isArray: boolean }>
  ): void {
    const resultIndex = new Map<string, Record<string, unknown>>()
    for (const doc of results) {
      const key = primaryKeys.map(pk => String(doc[pk] ?? '')).join('\0')
      resultIndex.set(key, doc)
    }

    for (const row of rows) {
      const key = primaryKeys.map(pk => String(row[pk] ?? '')).join('\0')
      const enriched = resultIndex.get(key)

      for (const meta of relMeta) {
        if (enriched) {
          const value = enriched[meta.name]
          if (!meta.isArray && Array.isArray(value)) {
            row[meta.name] = value[0] ?? null
          } else {
            row[meta.name] = value ?? (meta.isArray ? [] : null)
          }
        } else {
          row[meta.name] = meta.isArray ? [] : null
        }
      }
    }
  }

  /** Finds FK entry for a TO relation from this table's foreignKeys map. */
  private _findFKForRelationLookup(
    relation: TDbRelation,
    foreignKeys: ReadonlyMap<string, TDbForeignKey>
  ): { localFields: string[]; targetFields: string[]; targetTable: string } | undefined {
    const targetTableName = this._resolveRelTargetTableName(relation)
    for (const fk of foreignKeys.values()) {
      if (relation.alias) {
        if (fk.alias === relation.alias) {
          return { localFields: fk.fields, targetFields: fk.targetFields, targetTable: fk.targetTable }
        }
      } else if (fk.targetTable === targetTableName) {
        return { localFields: fk.fields, targetFields: fk.targetFields, targetTable: fk.targetTable }
      }
    }
    return undefined
  }

  /** Finds a FK on a remote table that points back to the given table name. */
  private _findRemoteFKFromMeta(
    target: { foreignKeys: ReadonlyMap<string, TDbForeignKey> },
    thisTableName: string,
    alias?: string
  ): TDbForeignKey | undefined {
    for (const fk of target.foreignKeys.values()) {
      if (alias && fk.alias === alias && fk.targetTable === thisTableName) { return fk }
      if (!alias && fk.targetTable === thisTableName) { return fk }
    }
    return undefined
  }

  /** Resolves the target table/collection name from a relation's target type. */
  private _resolveRelTargetTableName(relation: TDbRelation): string {
    const targetType = relation.targetType()
    return (targetType?.metadata?.get('db.table') as string) || targetType?.id || ''
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
    // Track _id presence (set by @db.mongo.collection or explicit _id field)
    if (field === '_id') {
      this._hasExplicitId = true
    }
    // @meta.id on non-_id fields:
    // - Always add a unique index so findById can resolve by this field
    // - Only remove from primaryKeys if the schema explicitly defines _id
    //   (via @db.mongo.collection). Otherwise keep it as PK for replace/update.
    if (field !== '_id' && metadata.has('meta.id')) {
      this._addMongoIndexField('unique', '__pk', field)
      this._pendingUniqueFields.push(field)
    }
    // @db.default.increment → track for auto-increment on insert (with optional start value)
    if (metadata.has('db.default.increment')) {
      const physicalName = (metadata.get('db.column') as string | undefined) ?? field
      const startValue = metadata.get('db.default.increment')
      this._incrementFields.set(physicalName, typeof startValue === 'number' ? startValue : undefined)
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

  override getMetadataOverrides(meta: TableMetadata): TMetadataOverrides {
    const uniqueFields = this._pendingUniqueFields

    if (this._hasExplicitId) {
      // Schema defines _id explicitly (via @db.mongo.collection or manual field).
      // _id is the primary key; remove non-_id @meta.id fields from PKs (they become unique indexes).
      return {
        addPrimaryKeys: ['_id'],
        removePrimaryKeys: meta.originalMetaIdFields.filter(f => f !== '_id'),
        addUniqueFields: uniqueFields.length > 0 ? uniqueFields : undefined,
      }
    }

    // Schema does NOT define _id. The user's @meta.id field is the primary key
    // for replace/update operations. Inject a synthetic _id as unique field so
    // that findById can resolve ObjectId strings via _resolveIdFilter.
    uniqueFields.push('_id')
    return {
      injectFields: [{
        path: '_id',
        type: {
          __is_atscript_annotated_type: true,
          type: { kind: '', designType: 'string', tags: new Set(['objectId', 'mongo']) },
          metadata: new Map(),
        } as any,
      }],
      addUniqueFields: uniqueFields,
    }
  }

  override onAfterFlatten(): void {
    // Purge fields that are under navigation relation paths
    // (e.g. 'projects.id' from @db.rel.from projects?: Project[])
    if (this._table.navFields.size > 0) {
      const isUnderNav = (path: string) => {
        for (const nav of this._table.navFields) {
          if (path.startsWith(`${nav}.`)) { return true }
        }
        return false
      }
      for (const field of this._incrementFields.keys()) {
        if (isUnderNav(field)) { this._incrementFields.delete(field) }
      }
    }

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

    // Build map of fields with non-binary collation for query-time collation injection
    for (const fd of this._table.fieldDescriptors) {
      if (fd.collate && fd.collate !== 'binary') {
        if (!this._collateFields) { this._collateFields = new Map() }
        this._collateFields.set(fd.physicalName, fd.collate)
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
      type: index.type === 'vector' ? 'vector' as const : 'text' as const,
    }))
  }

  override isVectorSearchable(): boolean {
    for (const index of this.getMongoSearchIndexes().values()) {
      if (index.type === 'vector') { return true }
    }
    return false
  }

  /**
   * Builds a MongoDB `$search` pipeline stage for text search.
   */
  protected async buildSearchStage(text: string, indexName?: string): Promise<Document | undefined> {
    const index = this.getMongoSearchIndex(indexName)
    if (!index) { return undefined }
    if (index.type === 'vector') {
      throw new Error('Vector indexes cannot be used with text search. Use vectorSearch() instead.')
    }
    return {
      $search: { index: index.key, text: { query: text, path: { wildcard: '*' } } },
    }
  }

  /**
   * Builds a `$vectorSearch` aggregation stage from a pre-computed vector.
   */
  private _buildVectorSearchPipelineStage(
    vector: number[],
    indexName?: string,
    limit?: number
  ): Document {
    let index: TSearchIndex | undefined
    if (indexName) {
      const found = this.getMongoSearchIndex(indexName)
      if (!found || found.type !== 'vector') {
        throw new Error(`Vector index "${indexName}" not found`)
      }
      index = found as TSearchIndex
    } else {
      for (const idx of this.getMongoSearchIndexes().values()) {
        if (idx.type === 'vector') { index = idx as TSearchIndex; break }
      }
    }
    if (!index) {
      throw new Error('No vector index available')
    }

    const vectorField = index.definition.fields?.find(f => f.type === 'vector')
    if (!vectorField) {
      throw new Error(`Vector index "${index.name}" has no vector field`)
    }

    return {
      $vectorSearch: {
        index: index.key,
        path: vectorField.path,
        queryVector: vector,
        numCandidates: Math.max((limit || 20) * 10, 100),
        limit: limit || 20,
      },
    }
  }

  override async search(
    text: string,
    query: DbQuery,
    indexName?: string
  ): Promise<Array<Record<string, unknown>>> {
    const searchStage = await this.buildSearchStage(text, indexName)
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
    const searchStage = await this.buildSearchStage(text, indexName)
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

  // ── Vector Search ─────────────────────────────────────────────────────

  override async vectorSearch(
    vector: number[],
    query: DbQuery,
    indexName?: string
  ): Promise<Array<Record<string, unknown>>> {
    const controls = query.controls || {}
    const stage = this._buildVectorSearchPipelineStage(vector, indexName, controls.$limit as number | undefined)
    const filter = buildMongoFilter(query.filter)
    const pipeline: Document[] = [stage, { $match: filter }]
    if (controls.$sort) { pipeline.push({ $sort: controls.$sort }) }
    if (controls.$skip) { pipeline.push({ $skip: controls.$skip }) }
    if (controls.$limit) { pipeline.push({ $limit: controls.$limit }) }
    else { pipeline.push({ $limit: 1000 }) }
    if (controls.$select) { pipeline.push({ $project: controls.$select.asProjection }) }

    this._log('aggregate (vectorSearch)', pipeline)
    return this.collection.aggregate(pipeline, this._getSessionOpts()).toArray()
  }

  override async vectorSearchWithCount(
    vector: number[],
    query: DbQuery,
    indexName?: string
  ): Promise<{ data: Array<Record<string, unknown>>; count: number }> {
    const controls = query.controls || {}
    const stage = this._buildVectorSearchPipelineStage(vector, indexName, controls.$limit as number | undefined)
    const filter = buildMongoFilter(query.filter)
    const pipeline: Document[] = [
      stage,
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

    this._log('aggregate (vectorSearchWithCount)', pipeline)
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
    const result = await this.collection.aggregate(pipeline, { ...this._getCollationOpts(query), ...this._getSessionOpts() }).toArray()
    return {
      data: result[0]?.data || [],
      count: result[0]?.meta[0]?.count || 0,
    }
  }

  // ── Collection existence ─────────────────────────────────────────────────

  async collectionExists(): Promise<boolean> {
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

  /**
   * Wraps an async operation to catch MongoDB duplicate key errors
   * (code 11000) and rethrow as structured `DbError`.
   */
  private async _wrapDuplicateKeyError<R>(fn: () => Promise<R>): Promise<R> {
    try {
      return await fn()
    } catch (error: unknown) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const field = error.keyPattern ? Object.keys(error.keyPattern)[0] ?? '' : ''
        throw new DbError('CONFLICT', [{ path: field, message: error.message }])
      }
      throw error
    }
  }

  // ── CRUD implementation ──────────────────────────────────────────────────

  async insertOne(data: Record<string, unknown>): Promise<TDbInsertResult> {
    if (this._incrementFields.size > 0) {
      const fields = this._fieldsNeedingIncrement(data)
      if (fields.length > 0) {
        const nextValues = await this._allocateIncrementValues(fields, 1)
        for (const physical of fields) {
          data[physical] = nextValues.get(physical) ?? 1
        }
      }
    }
    this._log('insertOne', data)
    const result = await this._wrapDuplicateKeyError(() => this.collection.insertOne(data, this._getSessionOpts()))
    return { insertedId: this._resolveInsertedId(data, result.insertedId) }
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
        await this._assignBatchIncrements(data, allFields)
      }
    }

    this._log('insertMany', `${data.length} docs`)
    const result = await this._wrapDuplicateKeyError(() => this.collection.insertMany(data, this._getSessionOpts()))
    return {
      insertedCount: result.insertedCount,
      insertedIds: data.map((item, i) => this._resolveInsertedId(item, result.insertedIds[i])),
    }
  }

  async findOne(query: DbQuery): Promise<Record<string, unknown> | null> {
    const filter = buildMongoFilter(query.filter)
    const opts = this._buildFindOptions(query.controls)
    this._log('findOne', filter, opts)
    return this.collection.findOne(filter, { ...opts, ...this._getCollationOpts(query), ...this._getSessionOpts() })
  }

  async findMany(query: DbQuery): Promise<Array<Record<string, unknown>>> {
    const filter = buildMongoFilter(query.filter)
    const opts = this._buildFindOptions(query.controls)
    this._log('findMany', filter, opts)
    // eslint-disable-next-line unicorn/no-array-method-this-argument -- MongoDB Collection.find, not Array.find
    return this.collection.find(filter, { ...opts, ...this._getCollationOpts(query), ...this._getSessionOpts() }).toArray()
  }

  async count(query: DbQuery): Promise<number> {
    const filter = buildMongoFilter(query.filter)
    this._log('countDocuments', filter)
    return this.collection.countDocuments(filter, { ...this._getCollationOpts(query), ...this._getSessionOpts() })
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
    const result = await this._wrapDuplicateKeyError(() => this.collection.replaceOne(mongoFilter, data, this._getSessionOpts()))
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

  async tableExists(): Promise<boolean> {
    return this.collectionExists()
  }

  async detectTableOptionDrift(): Promise<boolean> {
    if (!this._cappedOptions) { return false }
    const cols = await this.db.listCollections({ name: this._table.tableName }, { nameOnly: false }).toArray()
    if (cols.length === 0) { return false }
    const opts = cols[0].options
    if (!opts?.capped) { return true } // was not capped but should be
    if (opts.size !== this._cappedOptions.size) { return true }
    if ((opts.max ?? undefined) !== (this._cappedOptions.max ?? undefined)) { return true }
    return false
  }

  async ensureTable(): Promise<void> {
    if (this._table instanceof AtscriptDbView && !this._table.isExternal) {
      return this._ensureView(this._table as AtscriptDbView)
    }
    return this.ensureCollectionExists()
  }

  /**
   * Creates a MongoDB view from the AtscriptDbView's view plan.
   * Translates joins → $lookup/$unwind, filter → $match, columns → $project.
   */
  private async _ensureView(view: AtscriptDbView): Promise<void> {
    const exists = await this.collectionExists()
    if (exists) { return }

    const plan = view.viewPlan
    const columns = view.getViewColumnMappings()
    const pipeline: Document[] = []

    // $lookup + $unwind for each join
    for (const join of plan.joins) {
      const { localField, foreignField } = this._resolveJoinFields(join.condition, plan.entryTable, join.targetTable)
      pipeline.push({
        $lookup: {
          from: join.targetTable,
          localField,
          foreignField,
          as: `${JOINED_PREFIX}${join.targetTable}`,
        },
      })
      // LEFT JOIN semantics: unwind with preserveNullAndEmptyArrays
      pipeline.push({
        $unwind: {
          path: `$__joined_${join.targetTable}`,
          preserveNullAndEmptyArrays: true,
        },
      })
    }

    // $match for view filter
    if (plan.filter) {
      const matchExpr = this._queryNodeToMatch(plan.filter, plan.entryTable)
      pipeline.push({ $match: matchExpr })
    }

    // $project for column mappings
    const project: Record<string, unknown> = { _id: 0 }
    for (const col of columns) {
      if (col.sourceTable === plan.entryTable) {
        project[col.viewColumn] = `$${col.sourceColumn}`
      } else {
        project[col.viewColumn] = `$${JOINED_PREFIX}${col.sourceTable}.${col.sourceColumn}`
      }
    }
    pipeline.push({ $project: project })

    this._log('createView', this._table.tableName, plan.entryTable, pipeline)
    await this.db.createCollection(this._table.tableName, {
      viewOn: plan.entryTable,
      pipeline,
    })
  }

  /**
   * Extracts localField/foreignField from a join condition like `User.id = Task.assigneeId`.
   * The condition is a comparison node with two field refs.
   */
  private _resolveJoinFields(
    condition: AtscriptQueryNode,
    entryTable: string,
    joinTable: string
  ): { localField: string; foreignField: string } {
    // Walk through $and if present (single-condition $and wrapper)
    const comp = '$and' in condition
      ? (condition as { $and: AtscriptQueryNode[] }).$and[0]
      : condition
    const c = comp as { left: AtscriptQueryFieldRef; op: string; right: AtscriptQueryFieldRef }

    const leftTable = c.left.type
      ? ((c.left.type()?.metadata?.get('db.table') as string) || '')
      : entryTable
    // Determine which side is the entry table (local) and which is the join table (foreign)
    if (leftTable === joinTable) {
      return { localField: (c.right as AtscriptQueryFieldRef).field, foreignField: c.left.field }
    }
    return { localField: c.left.field, foreignField: (c.right as AtscriptQueryFieldRef).field }
  }

  /**
   * Translates an AtscriptQueryNode to a MongoDB $match expression.
   * Field refs are resolved to dot-path references (joined fields use JOINED_PREFIX).
   */
  private _queryNodeToMatch(node: AtscriptQueryNode, entryTable: string): Document {
    if ('$and' in node) {
      return { $and: (node as { $and: AtscriptQueryNode[] }).$and.map(n => this._queryNodeToMatch(n, entryTable)) }
    }
    if ('$or' in node) {
      return { $or: (node as { $or: AtscriptQueryNode[] }).$or.map(n => this._queryNodeToMatch(n, entryTable)) }
    }
    if ('$not' in node) {
      return { $not: this._queryNodeToMatch((node as { $not: AtscriptQueryNode }).$not, entryTable) }
    }

    const comp = node as { left: AtscriptQueryFieldRef; op: string; right?: unknown }
    const fieldPath = this._resolveViewFieldPath(comp.left, entryTable)

    // Field-to-field comparison
    if (comp.right && typeof comp.right === 'object' && 'field' in (comp.right as object)) {
      const rightPath = this._resolveViewFieldPath(comp.right as AtscriptQueryFieldRef, entryTable)
      return { $expr: { [comp.op]: [`$${fieldPath}`, `$${rightPath}`] } }
    }

    // Value comparison
    if (comp.op === '$eq') { return { [fieldPath]: comp.right } }
    if (comp.op === '$ne') { return { [fieldPath]: { $ne: comp.right } } }
    return { [fieldPath]: { [comp.op]: comp.right } }
  }

  /**
   * Resolves a field ref to a MongoDB dot path for view pipeline expressions.
   */
  private _resolveViewFieldPath(ref: AtscriptQueryFieldRef, entryTable: string): string {
    if (!ref.type) { return ref.field }
    const table = (ref.type()?.metadata?.get('db.table') as string) || ''
    if (table === entryTable) { return ref.field }
    return `${JOINED_PREFIX}${table}.${ref.field}`
  }

  async dropTable(): Promise<void> {
    this._log('drop', this._table.tableName)
    await this.collection.drop()
    this._collection = undefined
  }

  async dropViewByName(viewName: string): Promise<void> {
    this._log('dropView', viewName)
    try {
      await this.db.collection(viewName).drop()
    } catch {
      // View may not exist — ignore
    }
  }

  async dropTableByName(tableName: string): Promise<void> {
    this._log('dropByName', tableName)
    try {
      await this.db.collection(tableName).drop()
    } catch {
      // Collection may not exist — ignore
    }
  }

  async recreateTable(): Promise<void> {
    const tableName = this._table.tableName
    this._log('recreateTable', tableName)
    const tempName = `${tableName}__tmp_${Date.now()}`

    // 1. Server-side copy to temp collection (data stays in MongoDB)
    const source = this.db.collection(tableName)
    const count = await source.countDocuments()
    if (count > 0) {
      await source.aggregate([{ $out: tempName }]).toArray()
    }

    // 2. Drop the original collection
    await this.collection.drop()
    this._collection = undefined

    // 3. Recreate with current options (e.g. new capped size/max)
    await this.ensureCollectionExists()

    // 4. Copy data back from temp into the recreated collection
    if (count > 0) {
      const temp = this.db.collection(tempName)
      await temp.aggregate([{ $merge: { into: tableName } }]).toArray()
      await temp.drop()
    }
  }

  // ── Column sync (snapshot-based Path B) ──────────────────────────────────

  async syncColumns(diff: TColumnDiff): Promise<TSyncColumnResult> {
    const renamed: string[] = []
    const added: string[] = []
    const update: Record<string, Record<string, unknown>> = {}

    // Renames — use $rename operator
    if (diff.renamed.length > 0) {
      const renameSpec: Record<string, string> = {}
      for (const r of diff.renamed) {
        renameSpec[r.oldName] = r.field.physicalName
        renamed.push(r.field.physicalName)
      }
      update.$rename = renameSpec
    }

    // Adds — use $set with default values
    if (diff.added.length > 0) {
      const setSpec: Record<string, unknown> = {}
      for (const field of diff.added) {
        const defaultVal = this._resolveSyncDefault(field)
        if (defaultVal !== undefined) {
          setSpec[field.physicalName] = defaultVal
        }
        added.push(field.physicalName)
      }
      if (Object.keys(setSpec).length > 0) {
        update.$set = setSpec
      }
    }

    if (Object.keys(update).length > 0) {
      await this.collection.updateMany({}, update, this._getSessionOpts())
    }

    return { added, renamed }
  }

  async dropColumns(columns: string[]): Promise<void> {
    if (columns.length === 0) { return }
    const unsetSpec: Record<string, ''> = {}
    for (const col of columns) {
      unsetSpec[col] = ''
    }
    await this.collection.updateMany({}, { $unset: unsetSpec }, this._getSessionOpts())
  }

  async renameTable(oldName: string): Promise<void> {
    const newName = this.resolveTableName(false)
    this._log('renameTable', oldName, '→', newName)
    await this.db.renameCollection(oldName, newName)
    this._collection = undefined
  }

  /**
   * Resolves a field's default value for bulk $set during column sync.
   * Returns `undefined` if no concrete default can be determined.
   */
  private _resolveSyncDefault(field: TDbFieldMeta): unknown {
    if (!field.defaultValue) { return field.optional ? null : undefined }
    if (field.defaultValue.kind === 'value') { return field.defaultValue.value }
    // Function defaults (increment, uuid, now) can't be bulk-applied retroactively
    return undefined
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

  // ── Meta ID resolution ──────────────────────────────────────────────────

  // ── Auto-increment helpers ────────────────────────────────────────────────

  /** Returns the counters collection used for atomic auto-increment. */
  protected get _countersCollection(): Collection<{ _id: string; seq: number }> {
    return this.db.collection('__atscript_counters')
  }

  /** Returns physical field names of increment fields that are undefined in the data. */
  private _fieldsNeedingIncrement(data: Record<string, unknown>): string[] {
    const result: string[] = []
    for (const physical of this._incrementFields.keys()) {
      if (data[physical] === undefined || data[physical] === null) {
        result.push(physical)
      }
    }
    return result
  }

  /**
   * Atomically allocates `count` sequential values for each increment field
   * using a counter collection. Returns a map of field → first allocated value.
   */
  private async _allocateIncrementValues(
    physicalFields: string[],
    count: number
  ): Promise<Map<string, number>> {
    const counters = this._countersCollection
    const collectionName = this._table.tableName
    const result = new Map<string, number>()

    for (const field of physicalFields) {
      const counterId = `${collectionName}.${field}`
      const startValue = this._incrementFields.get(field)
      const doc = await counters.findOneAndUpdate(
        { _id: counterId },
        { $inc: { seq: count } },
        { upsert: true, returnDocument: 'after', ...this._getSessionOpts() }
      )
      const seq = doc?.seq ?? count
      // If this was a fresh counter (upserted), check if collection already has data
      // with higher values and re-seed if needed, or apply the start value
      if (seq === count) {
        const currentMax = await this._getCurrentFieldMax(field)
        // Determine the minimum starting point: use start value or existing max + 1
        const minStart = typeof startValue === 'number' ? startValue : 1
        const effectiveBase = Math.max(minStart, currentMax + 1)
        if (effectiveBase > seq) {
          const adjusted = effectiveBase + count - 1
          await counters.updateOne(
            { _id: counterId },
            { $max: { seq: adjusted } },
            this._getSessionOpts()
          )
          result.set(field, effectiveBase)
          continue
        }
      }
      result.set(field, seq - count + 1)
    }

    return result
  }

  /** Reads current max value for a single field via $group aggregation. */
  private async _getCurrentFieldMax(field: string): Promise<number> {
    const alias = `max__${field.replace(/\./g, '__')}`
    const agg = await this.collection.aggregate(
      [{ $group: { _id: null, [alias]: { $max: `$${field}` } } }],
      this._getSessionOpts()
    ).toArray()
    if (agg.length > 0) {
      const val = agg[0][alias]
      if (typeof val === 'number') { return val }
    }
    return 0
  }

  /** Allocates increment values for a batch of items, assigning in order. */
  private async _assignBatchIncrements(
    data: Array<Record<string, unknown>>,
    allFields: Set<string>
  ): Promise<void> {
    // Count how many items need auto-increment per field
    const fieldCounts = new Map<string, number>()
    for (const physical of allFields) {
      let count = 0
      for (const item of data) {
        if (item[physical] === undefined || item[physical] === null) { count++ }
      }
      if (count > 0) { fieldCounts.set(physical, count) }
    }

    // Atomically allocate ranges for each field
    const fieldCounters = new Map<string, number>()
    for (const [physical, count] of fieldCounts) {
      const allocated = await this._allocateIncrementValues([physical], count)
      fieldCounters.set(physical, allocated.get(physical) ?? 1)
    }

    // Walk items in order: no value → next from allocated range; explicit → keep
    for (const item of data) {
      for (const physical of allFields) {
        if (item[physical] === undefined || item[physical] === null) {
          const next = fieldCounters.get(physical) ?? 1
          item[physical] = next
          fieldCounters.set(physical, next + 1)
        }
      }
    }
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

  /**
   * Returns MongoDB collation options if any filter field has a non-binary collation.
   * Uses pre-computed insights when available, falls back to computing them on demand.
   * Maps: nocase → strength 2 (case-insensitive), unicode → strength 1 (case+accent-insensitive).
   */
  private _getCollationOpts(query: DbQuery): { collation: CollationOptions } | undefined {
    if (!this._collateFields) { return undefined }
    const insights = query.insights ?? computeInsights(query.filter)
    let strength: 1 | 2 | undefined
    for (const field of insights.keys()) {
      const collation = this._collateFields.get(field)
      if (collation === 'unicode') { return { collation: { locale: 'en', strength: 1 } } }
      if (collation === 'nocase') { strength = 2 }
    }
    return strength ? { collation: { locale: 'en', strength } } : undefined
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

// eslint-disable max-lines
// eslint-disable max-params
import {
  isAnnotatedType,
  TAnscriptAnnotatedType,
  TAnscriptTypeObject,
  TMetadataMap,
} from '@anscript/typescript'
import { AsMongo } from './as-mongo'
import { Collection } from 'mongodb'
import { NoopLogger, TGenericLogger } from './logger'

const INDEX_PREFIX = 'anscript__'

type TPlainIndex = {
  type: 'plain' | 'unique' | 'text'
  fields: Record<string, 1 | 'text'>
  weights: Record<string, number>
}

type TSearchIndex = {
  type: 'dynamic_text' | 'search_text' | 'vector'
  definition: TMongoSearchIndexDefinition
}

type TIndex = TPlainIndex | TSearchIndex

function indexKey(type: TIndex['type'], name: string) {
  const cleanName = name
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '_') // Replace spaces & special chars with "_"
    .replace(/_+/g, '_') // Collapse multiple underscores
    .slice(0, 127 - INDEX_PREFIX.length - type.length - 2) // Ensure within limit
  return `${INDEX_PREFIX}${type}__${cleanName}`
}

export class AsCollection<T extends TAnscriptAnnotatedType & (new (...args: any[]) => any)> {
  public readonly name: string
  public readonly collection: Collection<InstanceType<T>>
  constructor(
    protected readonly asMongo: AsMongo,
    protected readonly _type: T,
    protected readonly logger: TGenericLogger = NoopLogger
  ) {
    if (!isAnnotatedType(_type)) {
      throw new Error('Anscript Annotated Type expected')
    }
    const name = _type.metadata.get('mongo.collection') as string
    if (!name) {
      throw new Error('@mongo.collection annotation expected with collection name')
    }
    if (_type.type.kind !== 'object') {
      throw new Error('Mongo collection must be an object type')
    }
    this.name = name
    this.collection = asMongo.db.collection<InstanceType<T>>(name)
  }

  async exists() {
    return this.asMongo.collectionExists(this.name)
  }

  async ensureExists() {
    const exists = await this.exists()
    if (!exists) {
      await this.asMongo.db.createCollection(this.name, {
        comment: 'Created by Anscript Mongo Collection',
      })
    }
  }

  get type() {
    return this._type as TAnscriptAnnotatedType<TAnscriptTypeObject>
  }

  protected _indexes = new Map<string, TIndex>()

  protected _vectorFilters: Map<string, string> = new Map()

  get indexes() {
    this._flatten()
    return this._indexes
  }

  protected _addIndexField(
    type: TPlainIndex['type'],
    name: string,
    field: string,
    weight?: number
  ) {
    const key = indexKey(type, name)
    let index = this._indexes.get(key) as TPlainIndex | undefined
    const value = type === 'text' ? 'text' : 1
    if (index) {
      index.fields[field] = value
    } else {
      const weights = {} as TPlainIndex['weights']
      index = { type, fields: { [field]: value }, weights }
      this._indexes.set(key, index)
    }
    if (weight) {
      index.weights[field] = weight
    }
  }

  protected _setSearchIndex(
    type: TSearchIndex['type'],
    name: string,
    definition: TMongoSearchIndexDefinition
  ) {
    this._indexes.set(indexKey(type, name), {
      type,
      definition,
    })
  }

  protected _addFieldToSearchIndex(
    type: TSearchIndex['type'],
    name: string,
    fieldName: string,
    analyzer?: string,
    boost?: number
  ) {
    const index = this._indexes.get(indexKey(type, name)) as TSearchIndex | undefined
    if (index) {
      index.definition.mappings!.fields![fieldName] = {
        type: 'string',
        analyzer,
        score: { boost: { value: boost || 1 } },
      }
    }
  }

  protected _flatMap?: Map<string, TAnscriptAnnotatedType>

  protected _flattenType(type: TAnscriptAnnotatedType, prefix?: string) {
    switch (type.type.kind) {
      case 'object':
        const items = Array.from(type.type.props.entries())
        for (const [key, value] of items) {
          this._flattenType(value, prefix ? `${prefix}.${key}` : key)
        }
        break
      case 'array':
        this._flattenType(type.type.of, prefix)
        break
      case 'intersection':
      case 'tuple':
      case 'union':
        for (const item of type.type.items) {
          this._flattenType(item, prefix)
        }
      default:
        this._flatMap?.set(prefix || '', type)
        break
    }
    if (prefix) {
      this._prepareIndexesForField(prefix, type.metadata)
    }
  }

  protected _prepareIndexesForCollection() {
    const typeMeta = this.type.metadata
    const dynamicText = typeMeta.get('mongo.dynamicTextSearch')
    if (dynamicText) {
      this._setSearchIndex('dynamic_text', dynamicText.indexName || 'default', {
        mappings: { dynamic: true },
        analyzer: dynamicText.analyzer,
        text: { fuzzy: { maxEdits: dynamicText.fuzzy || 0 } },
      })
    }
    for (const textSearch of typeMeta.get('mongo.defineTextSearch') || []) {
      this._setSearchIndex('search_text', textSearch.indexName || 'default', {
        mappings: { fields: {} },
        analyzer: textSearch.analyzer,
        text: { fuzzy: { maxEdits: textSearch.fuzzy || 0 } },
      })
    }
  }

  protected _finalizeIndexesForCollection() {
    for (const [key, value] of Array.from(this._vectorFilters.entries())) {
      const index = this._indexes.get(key)
      if (index && index.type === 'vector') {
        index.definition.fields?.push({
          type: 'filter',
          path: value,
        })
      }
    }
  }

  protected _prepareIndexesForField(fieldName: string, metadata: TMetadataMap<AnscriptMetadata>) {
    for (const index of metadata.get('mongo.index.plain') || []) {
      this._addIndexField('plain', index === true ? fieldName : index, fieldName)
    }
    for (const index of metadata.get('mongo.index.unique') || []) {
      this._addIndexField('unique', index === true ? fieldName : index, fieldName)
    }
    const textWeight = metadata.get('mongo.index.text')
    if (textWeight) {
      this._addIndexField('text', '', fieldName, textWeight === true ? 1 : textWeight)
    }
    for (const index of metadata.get('mongo.useTextSearch') || []) {
      this._addFieldToSearchIndex('search_text', index.indexName, fieldName, '', index.boost)
    }
    const vectorIndex = metadata.get('mongo.vectorIndex')
    if (vectorIndex) {
      this._setSearchIndex('vector', vectorIndex.indexName || fieldName, {
        fields: [
          {
            type: 'vector',
            path: fieldName,
            similarity: (vectorIndex.similarity as TVectorSimilarity) || 'dotProduct',
            numDimensions: vectorIndex.dimensions,
          },
        ],
      })
    }
    for (const index of metadata.get('mongo.vectorFilter') || []) {
      this._vectorFilters.set(indexKey('vector', index.indexName), fieldName)
    }
  }

  protected _flatten() {
    if (!this._flatMap) {
      this._flatMap = new Map()
      this._prepareIndexesForCollection()
      this._flattenType(this.type)
      this._finalizeIndexesForCollection()
    }
  }

  get flatMap() {
    this._flatten()
    return this._flatMap
  }

  async syncIndexes() {
    await this.ensureExists()
    const existingIndexes = (await this.collection.listIndexes().toArray()) as TMongoIndex[]

    const indexesToCreate = new Map(this.indexes)

    for (const remote of existingIndexes) {
      if (!remote.name.startsWith(INDEX_PREFIX)) {
        continue
      }
      if (indexesToCreate.has(remote.name)) {
        const local = indexesToCreate.get(remote.name)!
        switch (local.type) {
          case 'plain':
          case 'unique':
          case 'text':
            if (
              (local.type === 'text' || objMatch(local.fields, remote.key)) &&
              objMatch(local.weights || {}, remote.weights || {})
            ) {
              indexesToCreate.delete(remote.name)
            } else {
              this.logger.debug(`dropping index "${remote.name}"`)
              await this.collection.dropIndex(remote.name)
            }
            break
          default:
        }
      } else {
        await this.collection.dropIndex(remote.name)
      }
    }

    const toUpdate = new Set<string>()
    const existingSearchIndexes = (await this.collection
      .listSearchIndexes()
      .toArray()) as TMongoSearchIndex[]
    for (const remote of existingSearchIndexes) {
      if (!remote.name.startsWith(INDEX_PREFIX)) {
        continue
      }
      if (indexesToCreate.has(remote.name)) {
        const local = indexesToCreate.get(remote.name)!
        const right = remote.latestDefinition
        switch (local.type) {
          case 'dynamic_text':
          case 'search_text':
            let left = local.definition
            if (
              left.analyzer === right.analyzer &&
              fieldsMatch(left.mappings!.fields || {}, right.mappings!.fields || {})
            ) {
              indexesToCreate.delete(remote.name)
            } else {
              toUpdate.add(remote.name)
            }
            break
          case 'vector':
            if (vectorFieldsMatch(local.definition.fields || [], right.fields || [])) {
              indexesToCreate.delete(remote.name)
            } else {
              toUpdate.add(remote.name)
            }
            break
          default:
        }
      } else {
        this.logger.debug(`dropping search index "${remote.name}"`)
        await this.collection.dropSearchIndex(remote.name)
      }
    }

    for (const [key, value] of Array.from(indexesToCreate.entries())) {
      switch (value.type) {
        case 'plain':
          this.logger.debug(`creating index "${key}"`)
          await this.collection.createIndex(value.fields, { name: key })
          break
        case 'unique':
          this.logger.debug(`creating index "${key}"`)
          await this.collection.createIndex(value.fields, { name: key, unique: true })
          break
        case 'text':
          this.logger.debug(`creating index "${key}"`)
          await this.collection.createIndex(value.fields, { weights: value.weights, name: key })
          break
        case 'dynamic_text':
        case 'search_text':
        case 'vector':
          if (toUpdate.has(key)) {
            this.logger.debug(`updating search index "${key}"`)
            await this.collection.updateSearchIndex(key, value.definition)
          } else {
            this.logger.debug(`creating search index "${key}"`)
            await this.collection.createSearchIndex({
              name: key,
              type: value.type === 'vector' ? 'vectorSearch' : 'search',
              definition: value.definition,
            })
          }
          break
        default:
      }
    }
  }
}

interface TMongoIndex {
  v: number
  key:
    | { _fts: 'text'; _ftsx: 1 } // text
    | Record<string, number> // plain
  name: string
  weights?: Record<string, number>
  default_language?: string
  textIndexVersion: number
}

interface TMongoSearchIndex {
  id: string
  name: string
  type: 'search' | 'vectorSearch'
  status: string // 'DELETING'
  queryable: boolean
  latestDefinition: TMongoSearchIndexDefinition
}

type TVectorSimilarity = 'cosine' | 'euclidean' | 'dotProduct'

type TMongoSearchIndexDefinition = {
  mappings?: {
    dynamic?: boolean // Enables dynamic indexing (indexes all fields automatically)
    fields?: Record<
      string,
      {
        type: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array'
        analyzer?: string // Optional analyzer for text fields
        searchAnalyzer?: string // Alternative analyzer for searches
        index?: boolean // Enable/disable indexing for this field
        score?: { boost: { value: number } }
      }
    >
  }
  fields?: {
    path: string
    type: 'filter' | 'vector'
    similarity?: TVectorSimilarity // Only for vector search
    numDimensions?: number // Required for vector search
  }[]
  analyzer?: string // Global text analyzer for the entire index
  text?: {
    fuzzy?: { maxEdits: number } // Fuzzy search (typo tolerance)
  }
}

/**
 * Vector Index fields matching
 */
function vectorFieldsMatch(
  left: Required<TMongoSearchIndexDefinition>['fields'],
  right: Required<TMongoSearchIndexDefinition>['fields']
) {
  const leftMap = new Map<string, Required<TMongoSearchIndexDefinition>['fields'][number]>()
  left.forEach(f => leftMap.set(f.path, f))
  const rightMap = new Map<string, Required<TMongoSearchIndexDefinition>['fields'][number]>()
  ;(right || []).forEach(f => rightMap.set(f.path, f))
  if (leftMap.size === rightMap.size) {
    let match = true
    for (const [key, left] of leftMap.entries()) {
      const right = rightMap.get(key)
      if (!right) {
        match = false
        break
      }
      if (
        left.type === right.type &&
        left.path === right.path &&
        left.similarity === right.similarity &&
        left.numDimensions === right.numDimensions
      ) {
        continue
      }
      match = false
      break
    }
    return match
  } else {
    return false
  }
}

/**
 * Search Index fields matching
 */
function fieldsMatch(
  left: Required<TMongoSearchIndexDefinition>['mappings']['fields'],
  right: Required<TMongoSearchIndexDefinition>['mappings']['fields']
): boolean {
  if (!left || !right) return left === right // Both must be defined or both must be undefined

  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)

  if (leftKeys.length !== rightKeys.length) return false // Ensure same number of fields

  return leftKeys.every(key => {
    if (!(key in right)) return false // Field must exist in both

    const leftField = left[key]
    const rightField = right[key]

    return (
      leftField.type === rightField.type &&
      leftField.analyzer === rightField.analyzer &&
      leftField.searchAnalyzer === rightField.searchAnalyzer &&
      leftField.index === rightField.index &&
      JSON.stringify(leftField.score) === JSON.stringify(rightField.score) // Deep compare score object
    )
  })
}

/**
 * Shallow object matching
 */
function objMatch(
  o1: Record<string, number | string>,
  o2: Record<string, number | string>
): boolean {
  const keys1 = Object.keys(o1)
  const keys2 = Object.keys(o2)
  if (keys1.length !== keys2.length) return false // Ensure both have the same number of keys
  return keys1.every(key => o1[key] === o2[key]) // Ensure all keys match exactly
}

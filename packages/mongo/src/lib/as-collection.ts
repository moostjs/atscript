// eslint-disable max-lines
// eslint-disable max-params
import {
  isAnnotatedType,
  TAtscriptAnnotatedType,
  TAtscriptAnnotatedTypeConstructor,
  TAtscriptTypeObject,
  TMetadataMap,
  Validator,
} from '@atscript/typescript'
import { AsMongo } from './as-mongo'
import { Collection, ObjectId, OptionalId, UpdateFilter, WithId } from 'mongodb'
import { NoopLogger, TGenericLogger } from './logger'

const INDEX_PREFIX = 'anscript__'
const DEFAULT_INDEX_NAME = 'DEFAULT'

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

/**
 * Generates a key for mongo index
 * @param type index type
 * @param name index name
 * @returns index key
 */
function indexKey(type: TIndex['type'], name: string) {
  const cleanName = name
    .replace(/[^a-z0-9_.-]/gi, '_') // Replace spaces & special chars with "_"
    .replace(/_+/g, '_') // Collapse multiple underscores
    .slice(0, 127 - INDEX_PREFIX.length - type.length - 2) // Ensure within limit
  return `${INDEX_PREFIX}${type}__${cleanName}`
}

type TValidatorPurpose = 'insert' | 'update' | 'patch'

export class AsCollection<T extends TAtscriptAnnotatedTypeConstructor> {
  public readonly name: string

  public readonly collection: Collection<InstanceType<T>>

  protected readonly validators = new Map<TValidatorPurpose, Validator<T>>()

  protected _indexes = new Map<string, TIndex>()

  protected _vectorFilters: Map<string, string> = new Map()

  protected _flatMap?: Map<string, TAtscriptAnnotatedType>

  constructor(
    protected readonly asMongo: AsMongo,
    protected readonly _type: T,
    protected readonly logger: TGenericLogger = NoopLogger
  ) {
    if (!isAnnotatedType(_type)) {
      throw new Error('Atscript Annotated Type expected')
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

  public async exists() {
    return this.asMongo.collectionExists(this.name)
  }

  public async ensureExists() {
    const exists = await this.exists()
    if (!exists) {
      await this.asMongo.db.createCollection(this.name, {
        comment: 'Created by Atscript Mongo Collection',
      })
    }
  }

  /**
   * Returns the a type definition of the "_id" prop.
   */
  public get idType(): 'string' | 'number' | 'objectId' {
    const idProp = this.type.type.props.get('_id')
    const idTags = idProp?.type.tags
    if (idTags?.has('objectId') && idTags?.has('mongo')) {
      return 'objectId'
    }
    if (idProp?.type.kind === '') {
      return idProp.type.designType as 'string' | 'number'
    }
    return 'objectId' // fallback to objectId
  }

  /**
   * Transforms an "_id" value to the expected type (`ObjectId`, `number`, or `string`).
   * Assumes input has already been validated.
   *
   * @param {string | number | ObjectId} id - The validated ID.
   * @returns {string | number | ObjectId} - The transformed ID.
   * @throws {Error} If the `_id` type is unknown.
   */
  public prepareId<D = string | number | ObjectId>(id: string | number | ObjectId): D {
    switch (this.idType) {
      case 'objectId':
        return (id instanceof ObjectId ? id : new ObjectId(id)) as D
      case 'number':
        return Number(id) as D
      case 'string':
        return String(id) as D
      default:
        throw new Error('Unknown "_id" type')
    }
  }

  /**
   * Retrieves a validator for a given purpose. If the validator is not already cached,
   * it creates and stores a new one based on the purpose.
   *
   * @param {TValidatorPurpose} purpose - The validation purpose (`input`, `update`, `patch`).
   * @returns {Validator} The corresponding validator instance.
   * @throws {Error} If an unknown purpose is provided.
   */
  public getValidator(purpose: TValidatorPurpose) {
    if (!this.validators.has(purpose)) {
      switch (purpose) {
        case 'insert': {
          this.validators.set(
            purpose,
            this.type.validator(this.idType === 'objectId' ? { skipList: new Set(['_id']) } : {})
          )
          break
        }
        case 'update': {
          this.validators.set(purpose, this.type.validator())
          break
        }
        case 'patch': {
          this.validators.set(purpose, this.type.validator({ partial: 'deep' }))
          break
        }
        default:
          throw new Error(`Unknown validator purpose: ${purpose}`)
      }
    }
    return this.validators.get(purpose)
  }

  public get type() {
    return this._type as TAtscriptAnnotatedType<TAtscriptTypeObject>
  }

  public get indexes() {
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
    name: string | undefined,
    definition: TMongoSearchIndexDefinition
  ) {
    this._indexes.set(indexKey(type, name || DEFAULT_INDEX_NAME), {
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
    let index = this._indexes.get(indexKey(type, name)) as TSearchIndex | undefined
    if (!index && type === 'search_text') {
      this._setSearchIndex(type, name, {
        mappings: { fields: {} },
        text: { fuzzy: { maxEdits: 0 } },
      })
      index = this._indexes.get(indexKey(type, name)) as TSearchIndex | undefined
    }
    if (index) {
      index.definition.mappings!.fields![fieldName] = {
        type: 'string',
      }
      if (analyzer) {
        index.definition.mappings!.fields![fieldName].analyzer = analyzer
      }
    }
  }

  protected _flattenType(type: TAtscriptAnnotatedType, prefix?: string) {
    switch (type.type.kind) {
      case 'object':
        const items = Array.from(type.type.props.entries())
        for (const [key, value] of items) {
          this._flattenType(value, prefix ? `${prefix}.${key}` : key)
        }
        break
      case 'array':
        this._flatMap?.set(prefix || '', type)
        if (type.type.of.type.kind) {
          this._flattenType(type.type.of, prefix)
        }
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
    const dynamicText = typeMeta.get('mongo.search.dynamic')
    if (dynamicText) {
      this._setSearchIndex('dynamic_text', '_', {
        mappings: { dynamic: true },
        analyzer: dynamicText.analyzer,
        text: { fuzzy: { maxEdits: dynamicText.fuzzy || 0 } },
      })
    }
    for (const textSearch of typeMeta.get('mongo.search.static') || []) {
      this._setSearchIndex('search_text', textSearch.indexName, {
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

  protected _prepareIndexesForField(fieldName: string, metadata: TMetadataMap<AtscriptMetadata>) {
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
    for (const index of metadata.get('mongo.search.text') || []) {
      this._addFieldToSearchIndex('search_text', index.indexName, fieldName, index.analyzer)
    }
    const vectorIndex = metadata.get('mongo.search.vector')
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
    for (const index of metadata.get('mongo.search.filter') || []) {
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

  public get flatMap() {
    this._flatten()
    return this._flatMap
  }

  public async syncIndexes() {
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
        this.logger.debug(`dropping index "${remote.name}"`)
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
        if (remote.status !== 'DELETING') {
          this.logger.debug(`dropping search index "${remote.name}"`)
          await this.collection.dropSearchIndex(remote.name)
        } else {
          this.logger.debug(`search index "${remote.name}" is in deleting status`)
        }
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

  public prepareInsert(payload: any): OptionalId<T> {
    const v = this.getValidator('insert')!
    if (v.validate(payload)) {
      const data = { ...payload } as any & { _id?: string | number | ObjectId }
      if (data._id) {
        data._id = this.prepareId(data._id)
      } else if (this.idType !== 'objectId') {
        throw new Error('Missing "_id" field')
      }
      return data
    }
    throw new Error('Invalid payload')
  }

  public prepareUpdate(payload: any): WithId<T> {
    const v = this.getValidator('insert')!
    if (v.validate(payload)) {
      const data = { ...payload } as any & { _id: string | number | ObjectId }
      data._id = this.prepareId(data._id)
      return data
    }
    throw new Error('Invalid payload')
  }

  public preparePatch(payload: any): UpdateFilter<T> {
    const v = this.getValidator('update')!
    if (v.validate(payload)) {
      // flatten
    }
    throw new Error('Invalid payload')
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

    return leftField.type === rightField.type && leftField.analyzer === rightField.analyzer
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

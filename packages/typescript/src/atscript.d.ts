export {}

declare global {
  interface AtscriptMetadata {
    'meta.label': string
    'meta.id': string | true
    'meta.description': string
    'meta.documentation': string[]
    'meta.placeholder': string
    'meta.sensitive': boolean
    'meta.readonly': boolean
    'expect.minLength': { length: number; message?: string }
    'expect.maxLength': { length: number; message?: string }
    'expect.min': { minValue: number; message?: string }
    'expect.max': { maxValue: number; message?: string }
    'expect.int': { message?: string } | true
    'expect.pattern': { pattern: string; flags?: string; message?: string }[]
    'mongo.collection': string
    'mongo.index.plain': (string | true)[]
    'mongo.index.unique': (string | true)[]
    'mongo.index.text': number | true
    'mongo.search.dynamic': { analyzer?: string; fuzzy?: number }
    'mongo.search.static': { analyzer?: string; fuzzy?: number; indexName?: string }[]
    'mongo.search.text': { analyzer?: string; indexName?: string }[]
    'mongo.search.vector': { dimensions: number; similarity?: string; indexName?: string }
    'mongo.search.filter': { indexName: string }[]
  }
  type AtscriptPrimitiveTags = string
}

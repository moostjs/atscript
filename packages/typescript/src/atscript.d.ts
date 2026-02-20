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
    'meta.required': { message?: string } | true
    'expect.int': { message?: string } | true
    'expect.pattern': Array<{ pattern: string; flags?: string; message?: string }>
    'mongo.collection': string
    'mongo.index.plain': Array<string | true>
    'mongo.index.unique': Array<string | true>
    'mongo.index.text': number | true
    'mongo.search.dynamic': { analyzer?: string; fuzzy?: number }
    'mongo.search.static': Array<{ analyzer?: string; fuzzy?: number; indexName?: string }>
    'mongo.search.text': Array<{ analyzer?: string; indexName?: string }>
    'mongo.search.vector': { dimensions: number; similarity?: string; indexName?: string }
    'mongo.search.filter': Array<{ indexName: string }>
  }
  type AtscriptPrimitiveTags = string
}

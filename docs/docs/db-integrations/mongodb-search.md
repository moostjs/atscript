---
outline: deep
---

# MongoDB Search & Vectors

<!--@include: ./_experimental-warning.md-->

MongoDB supports three search approaches — text indexes, Atlas Search, and vector search — all configurable from your `.as` schema. Start with basic text indexes on any deployment, then upgrade to Atlas Search or vector search when you need more power.

## Text Indexes

Standard MongoDB text search uses the generic `@db.index.fulltext` annotation. This works on **all MongoDB deployments** — standalone, replica sets, and Atlas.

```atscript
@db.mongo.collection
export interface Article {
    @meta.id _id: mongo.objectId

    @db.index.fulltext 'content_idx'
    title: string

    @db.index.fulltext 'content_idx', 2
    body: string
}
```

Fields sharing the same index name (`'content_idx'`) form a **composite text index**. The optional second argument is a weight — here `body` has weight `2`, making matches in it score twice as high as `title` (default weight `1`).

Query with `search()`:

```typescript
const results = await articles.search('mongodb tutorial')
```

## Atlas Search

Atlas Search brings full-text search powered by **Apache Lucene** to your MongoDB collections. It supports fuzzy matching, language-aware analyzers, and custom scoring — but requires a **MongoDB Atlas** deployment.

There are two modes: dynamic (auto-indexes all text fields) and static (explicit per-field control).

## Dynamic Atlas Search

`@db.mongo.search.dynamic` auto-indexes every string field in the collection:

```atscript
@db.mongo.collection
@db.mongo.search.dynamic 'lucene.english', 1
export interface Product {
    @meta.id _id: mongo.objectId
    title: string
    description: string
    category: string
}
```

Arguments:

1. **Analyzer** — the Lucene analyzer to use (e.g., `'lucene.english'`)
2. **Fuzzy level** — typo tolerance (`0`, `1`, or `2`)

All string fields are searchable immediately with no per-field annotations needed.

## Static Atlas Search

`@db.mongo.search.static` creates a named index where you control exactly which fields are searchable and which analyzer each uses:

```atscript
@db.mongo.collection
@db.mongo.search.static 'lucene.english', 0, 'product_search'
export interface Product {
    @meta.id _id: mongo.objectId

    @db.mongo.search.text 'lucene.english', 'product_search'
    title: string

    @db.mongo.search.text 'lucene.standard', 'product_search'
    description: string

    // Not included in the search index
    sku: string
    price: number
}
```

Arguments for `@db.mongo.search.static`:

1. **Default analyzer** — fallback analyzer for the index
2. **Fuzzy level** — typo tolerance
3. **Index name** — identifies the index for queries

Each `@db.mongo.search.text` field can use a different analyzer while belonging to the same named index.

## Supported Analyzers

Atlas Search uses Apache Lucene analyzers. The most common:

| Analyzer | Description |
|----------|-------------|
| `lucene.standard` | General-purpose tokenizer, lowercases, removes stop words |
| `lucene.english` | English-specific with stemming ("running" matches "run") |
| `lucene.simple` | Lowercases and splits on non-letter characters |
| `lucene.keyword` | No tokenization — treats the entire field as one token |
| `lucene.whitespace` | Splits on whitespace only, no lowercasing |

Language-specific analyzers are also available: `lucene.spanish`, `lucene.french`, `lucene.german`, `lucene.chinese`, `lucene.japanese`, and about 20 more. See the [MongoDB Atlas docs](https://www.mongodb.com/docs/atlas/atlas-search/analyzers/) for the full list.

## Fuzzy Search

The fuzzy parameter controls typo tolerance using Levenshtein distance:

- **`0`** — exact match only, no typos allowed
- **`1`** — one character difference allowed (e.g., "mongo" matches "mango")
- **`2`** — two character differences allowed (e.g., "search" matches "saerch")

Higher values increase recall at the cost of precision. For most use cases, `1` is a good default.

## Vector Search

Vector search enables **semantic similarity** retrieval using embeddings. This is useful for AI-powered search, recommendations, and RAG (retrieval-augmented generation) applications.

```atscript
@db.mongo.collection
export interface Document {
    @meta.id _id: mongo.objectId
    title: string
    content: string

    @db.mongo.search.vector 1536, 'cosine', 'doc_vectors'
    embedding: mongo.vector

    @db.mongo.search.filter 'doc_vectors'
    category: string
}
```

### Annotations

`@db.mongo.search.vector dims, similarity, indexName` marks a field as a vector embedding:

| Argument | Description |
|----------|-------------|
| `dims` | Number of dimensions (must match your embedding model, e.g., 1536 for OpenAI `text-embedding-3-small`) |
| `similarity` | Distance function: `'cosine'`, `'euclidean'`, or `'dotProduct'` |
| `indexName` | Name for the vector search index |

`@db.mongo.search.filter indexName` marks a field as a **pre-filter** for vector search. Pre-filters narrow the candidate set *before* the similarity comparison runs, improving both performance and relevance.

The `mongo.vector` primitive is an alias for a number array, representing the embedding values.

## Searching at Runtime

Both text indexes and Atlas Search use the same API:

```typescript
// Basic search (uses the best available index)
const results = await table.search('search query')

// Search with filters and pagination
const { data, count } = await table.searchWithCount('query', {
  filter: { category: 'tech' },
  controls: { $limit: 20, $skip: 0 },
})

// Target a specific named index
const results = await table.search('query', {}, 'product_search')
```

## Vector Search at Runtime

Vector search accepts **pre-computed embedding vectors** — you generate them externally using any embedding provider (OpenAI, Hugging Face, Cohere, etc.), then pass the resulting `number[]` directly:

```typescript
// 1. Generate embedding externally (your concern)
const response = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: 'search query',
})
const vector = response.data[0].embedding

// 2. Vector search — uses the default (first) vector index
const results = await table.vectorSearch(vector)

// With filters and pagination
const { data, count } = await table.vectorSearchWithCount(vector, {
  filter: { category: 'tech' },
  controls: { $limit: 20, $skip: 0 },
})

// Target a specific vector index (for documents with multiple vector fields)
const results = await table.vectorSearch('contentEmbedding', vector)
const results = await table.vectorSearch('imageEmbedding', imageVector, {
  controls: { $limit: 10 },
})
```

No subclassing or callbacks required — the adapter builds the `$vectorSearch` aggregation pipeline from the vector you provide and the index metadata from your `.as` schema.

## Checking Capabilities

You can inspect whether a table supports search and which indexes are configured:

```typescript
const adapter = db.getAdapter(Product)
adapter.isSearchable()           // true if any text search index exists
adapter.isVectorSearchable()     // true if any vector search index exists
adapter.getSearchIndexes()       // list of all configured indexes (with type)
```

## Index Priority

When multiple search indexes exist on a collection, the adapter selects the default in this order:

1. **Dynamic Atlas Search** index (highest priority)
2. **Static Atlas Search** index
3. **MongoDB text index** (lowest priority)

You can always bypass the priority by passing an explicit index name to `search()`.

## Limitations

- **Atlas Search** requires MongoDB Atlas — it is not available on self-hosted MongoDB
- **Vector search** requires Atlas M10+ tier or higher
- **Text indexes** work on all MongoDB deployments including standalone and `mongodb-memory-server`
- **Embeddings** are generated externally — pass pre-computed vectors to `vectorSearch()`
- Atlas Search indexes are managed separately from standard MongoDB indexes and may take a few seconds to build

## Next Steps

- [MongoDB](./mongodb) — MongoDB adapter setup and configuration
- [CRUD Operations](./crud) — Reading, writing, and querying data
- [Creating Custom Adapters](./creating-adapters) — Build your own database adapter

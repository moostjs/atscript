# Search & Vectors

::: warning Experimental
DB Adapters are experimental. APIs may change at any moment.
:::

## Overview

The MongoDB adapter supports three types of search:

1. **MongoDB text indexes** (`@db.index.fulltext`) — native MongoDB `$text` search
2. **Atlas Search** (`@db.mongo.search.*`) — Atlas-only full-text search with `$search` pipeline
3. **Vector Search** (`@db.mongo.search.vector`) — Atlas-only similarity search

## MongoDB Text Indexes

Use the generic `@db.index.fulltext` annotation. The adapter creates a MongoDB text index with optional weights.

```atscript
@db.table 'articles'
@db.mongo.collection
export interface Article {
    @db.index.fulltext
    title: string

    @db.index.fulltext
    body: string
}
```

Query via `table.search()`:

```typescript
const results = await articles.search('mongodb tutorial', {
  filter: {},
  controls: { $limit: 10 },
})
```

## Atlas Search (Dynamic)

Dynamic mapping indexes all fields automatically. Requires Atlas.

```atscript
@db.table 'articles'
@db.mongo.collection
@db.mongo.search.dynamic 'lucene.standard' 1
export interface Article {
    title: string
    body: string
}
```

The `1` enables fuzzy matching (maxEdits=1).

## Atlas Search (Static)

For more control, define a static search index with explicit field mappings.

```atscript
@db.table 'articles'
@db.mongo.collection
@db.mongo.search.static 'lucene.standard' 0 'article_search'
export interface Article {
    @db.mongo.search.text 'lucene.standard' 'article_search'
    title: string

    @db.mongo.search.text 'lucene.standard' 'article_search'
    body: string

    // Not included in search index
    authorId: number
}
```

## Searching

Both text indexes and Atlas Search are accessed through the same API:

```typescript
// Default search (uses the best available index)
const results = await articles.search('tutorial', {
  filter: { authorId: 42 },
  controls: { $limit: 20 },
})

// Named search index
const results = await articles.search('tutorial', {
  filter: {},
  controls: { $limit: 20 },
}, 'article_search')

// Search with count (for pagination)
const { data, count } = await articles.searchWithCount('tutorial', {
  filter: {},
  controls: { $limit: 20, $skip: 0 },
})
```

### Search Index Priority

When multiple search indexes exist, the adapter picks the default:

1. Dynamic text index (highest priority)
2. Named static search index
3. MongoDB text index (lowest)

You can always specify an index name explicitly.

## Vector Search

Vector search enables similarity-based retrieval using embeddings.

### Setup

```atscript
@db.table 'documents'
@db.mongo.collection
export interface Document {
    title: string
    content: string

    @db.mongo.search.vector 1536 'dotProduct' 'doc_vectors'
    embedding: mongo.vector

    @db.mongo.search.filter 'doc_vectors'
    category: string
}
```

| Argument | Description |
|----------|-------------|
| `1536` | Vector dimensions (must match your embedding model) |
| `'dotProduct'` | Similarity function (`'cosine'`, `'euclidean'`, or `'dotProduct'`) |
| `'doc_vectors'` | Index name |

The `@db.mongo.search.filter` annotation adds a pre-filter field to the vector index, allowing you to narrow results before the similarity search runs.

### Custom Embedding Provider

The adapter's `buildVectorSearchStage()` returns `undefined` by default — vector search requires you to provide embeddings. Override it in a subclass:

```typescript
import { MongoAdapter } from '@atscript/mongo'

class MyMongoAdapter extends MongoAdapter {
  protected override buildVectorSearchStage(text: string, index: TMongoIndex) {
    // Generate embedding from text using your provider (OpenAI, etc.)
    const embedding = await getEmbedding(text)

    return {
      $vectorSearch: {
        index: index.key,
        path: index.definition.fields?.[0]?.path,
        queryVector: embedding,
        numCandidates: 100,
        limit: 20,
      },
    }
  }
}
```

## Checking Search Capabilities

```typescript
// Check if the table has any search indexes
if (todos.isSearchable()) {
  const indexes = todos.getSearchIndexes()
  // → [{ name: 'DEFAULT', description: 'dynamic_text index' }, ...]
}
```

::: tip
Atlas Search indexes are only available on MongoDB Atlas. On standalone MongoDB or in-memory instances (like `mongodb-memory-server`), search index operations are silently skipped.
:::

## See Also

- [MongoDB Guide](./mongodb) — Getting started
- [MongoDB Annotations](./mongodb-annotations) — Annotation reference
- [Queries & Filters](./queries) — Generic filter syntax

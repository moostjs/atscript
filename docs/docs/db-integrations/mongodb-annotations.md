---
outline: deep
---

# MongoDB Annotations

## Overview

MongoDB extends the generic `@db.*` namespace with `@db.mongo.*` annotations and provides MongoDB-specific primitive types. These are available when using the `MongoPlugin` in your `atscript.config.mts`.

```typescript
import { MongoPlugin } from '@atscript/mongo'

export default {
  plugins: [MongoPlugin()],
}
```

## Annotation Reference

| Annotation | Level | Arguments | Purpose |
|------------|-------|-----------|---------|
| `@db.mongo.collection` | interface | — | Marks an interface as a MongoDB collection (auto-injects `_id`) |
| `@db.mongo.capped` | interface | `size`, `max?` | Creates a capped collection with a fixed maximum size |
| `@db.mongo.search.dynamic` | interface | `analyzer?`, `fuzzy?` | Dynamic Atlas Search index on the collection |
| `@db.mongo.search.static` | interface | `analyzer?`, `fuzzy?`, `indexName` | Named static Atlas Search index |
| `@db.mongo.search.text` | field | `analyzer?`, `indexName` | Adds a field to a named Atlas Search index with text mapping |
| `@db.mongo.search.vector` | field | `dimensions`, `similarity?`, `indexName?` | Declares a vector search index on a field |
| `@db.mongo.search.filter` | field | `indexName` | Marks a field as a pre-filter for vector search |

## Primitives

### `mongo.objectId`

A string type constrained to 24-character hex strings (matching MongoDB ObjectId format). Used for `_id` fields.

```atscript
@db.table 'users'
@db.mongo.collection
export interface User {
    // _id: mongo.objectId is auto-injected by @db.mongo.collection
    name: string
}
```

### `mongo.vector`

An alias for `number[]`, used with vector search indexes.

```atscript
@db.mongo.search.vector 1536 'dotProduct'
embedding: mongo.vector
```

## Collection Annotations

### `@db.mongo.collection`

Marks an interface as a MongoDB collection. This annotation:

- Auto-injects an `_id: mongo.objectId` field if not already present
- Signals to the adapter that this type uses MongoDB's document model

```atscript
@db.table 'products'
@db.mongo.collection
export interface Product {
    // _id is auto-injected as mongo.objectId
    name: string
    price: number
}
```

You can also declare `_id` explicitly with a different type:

```atscript
@db.table 'products'
@db.mongo.collection
export interface Product {
    _id: string    // custom _id type (not ObjectId)
    name: string
}
```

## Capped Collections

### `@db.mongo.capped`

Creates a capped collection with a fixed maximum size. Capped collections maintain insertion order and automatically remove the oldest documents when the size limit is reached.

Arguments: `size` (number — maximum size in bytes), `max?` (number — maximum document count)

```atscript
@db.table 'logs'
@db.mongo.collection
@db.mongo.capped 10485760, 10000
@db.sync.method 'drop'
export interface LogEntry {
    message: string
    level: string
    timestamp: number.timestamp.created
}
```

Capped collections are ideal for logs, event streams, and cache-like data.

::: warning
Changing the cap size requires dropping and recreating the collection. Use `@db.sync.method 'drop'` to allow [schema sync](./schema-sync) to handle this automatically.
:::

## Search Annotations

### `@db.mongo.search.dynamic`

Declares a dynamic Atlas Search index on the collection. Dynamic mapping indexes all fields automatically.

Arguments: `analyzer?` (string), `fuzzy?` (number -- max edit distance, default 0)

```atscript
@db.table 'articles'
@db.mongo.collection
@db.mongo.search.dynamic 'lucene.standard'
export interface Article {
    title: string
    body: string
    tags: string[]
}
```

### `@db.mongo.search.static`

Declares a named static Atlas Search index. Fields must be explicitly mapped using `@db.mongo.search.text`.

Arguments: `analyzer?` (string), `fuzzy?` (number), `indexName` (string)

```atscript
@db.table 'articles'
@db.mongo.collection
@db.mongo.search.static 'lucene.standard' 0 'article_search'
export interface Article {
    @db.mongo.search.text 'lucene.standard' 'article_search'
    title: string

    @db.mongo.search.text 'lucene.standard' 'article_search'
    body: string
}
```

### `@db.mongo.search.text`

Adds a field to a named Atlas Search index with text mapping.

Arguments: `analyzer?` (string), `indexName` (string)

```atscript
@db.mongo.search.text 'lucene.standard' 'my_search_index'
title: string
```

### `@db.mongo.search.vector`

Declares a vector search index on a field.

Arguments: `dimensions` (number), `similarity?` (string -- `'cosine'`, `'euclidean'`, or `'dotProduct'`), `indexName?` (string)

```atscript
@db.mongo.search.vector 1536 'dotProduct' 'vector_idx'
embedding: mongo.vector
```

### `@db.mongo.search.filter`

Marks a field as a pre-filter for vector search. The field is included in the vector index for filtering before similarity comparison.

Arguments: `indexName` (string)

```atscript
@db.mongo.search.filter 'vector_idx'
category: string

@db.mongo.search.vector 1536 'dotProduct' 'vector_idx'
embedding: mongo.vector
```

## Complete Example

```atscript
@db.table 'products'
@db.mongo.collection
@db.mongo.search.dynamic 'lucene.standard' 1
export interface Product {
    @meta.id
    @db.default.fn 'increment'
    id: number

    @db.index.unique
    sku: string

    @db.index.plain 'category_status'
    category: string

    @db.index.plain 'category_status'
    status: string

    name: string
    description?: string
    price: number

    @db.mongo.search.vector 768 'cosine' 'product_vectors'
    embedding?: mongo.vector

    @db.mongo.search.filter 'product_vectors'
    inStock: boolean

    createdAt?: number.timestamp.created
}
```

## See Also

- [Core Annotations](./annotations) -- Generic `@db.*` annotations
- [MongoDB Guide](./mongodb) -- Getting started with MongoDB
- [Search & Vectors](./mongodb-search) -- Atlas Search and vector search guide

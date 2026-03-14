---
outline: deep
---

# MongoDB

<!--@include: ./_experimental-warning.md-->

The MongoDB adapter connects your `.as` models to MongoDB with native support for nested objects, aggregation pipelines, Atlas Search, and vector search. It translates annotation-driven CRUD operations into native MongoDB queries while preserving the same `AtscriptDbTable` API used by all adapters.

## Features

- Full CRUD operations (insert, find, update, delete) with the unified table API
- Native nested object storage (no flattening)
- Aggregation pipeline patches for array operations (`$insert`, `$remove`, `$update`, `$upsert`, `$replace`)
- `$lookup`-based relation loading (TO, FROM, VIA)
- Atlas Search indexes (dynamic and static mappings)
- Vector search with pre-filtering
- Capped collections for fixed-size FIFO storage
- Transaction support (replica set or mongos topology)
- Schema sync with drift detection and index management

## Installation

```bash
pnpm add @atscript/db-mongo mongodb
```

Register the MongoDB plugin in your `atscript.config.mts` to enable `@db.mongo.*` annotations and `mongo.*` primitives:

```typescript
import { defineConfig } from '@atscript/core'
import ts from '@atscript/typescript'
import mongo from '@atscript/db-mongo/plugin'

export default defineConfig({
  plugins: [ts(), mongo()],
})
```

## Quick Start

Create a `DbSpace` with a `MongoAdapter` factory:

```typescript
import { DbSpace } from '@atscript/db'
import { MongoAdapter } from '@atscript/db-mongo'
import { MongoClient } from 'mongodb'

const client = new MongoClient('mongodb://localhost:27017')
const mongoDb = client.db('myapp')
const db = new DbSpace(() => new MongoAdapter(mongoDb, client))
```

Or use the convenience helper:

```typescript
import { createAdapter } from '@atscript/db-mongo'

const db = createAdapter('mongodb://localhost:27017/myapp')
```

`createAdapter` connects the client, extracts the database from the connection string, and returns a ready-to-use `DbSpace`.

Once you have a `DbSpace`, get a table handle for any `.as` type:

```typescript
import { User } from './schema/user.as'

const users = db.getTable(User)

// Now use the standard table API
const user = await users.findById(1)
```

Run `npx asc db sync` to create or update collections and indexes. See [Schema Sync](./schema-sync) for details.

## Schema Definition

Use `@db.mongo.collection` alongside `@db.table` to mark an interface as a MongoDB collection:

```atscript
@db.table 'users'
@db.mongo.collection
export interface User {
    @meta.id
    _id: mongo.objectId

    name: string
    email: string.email
}
```

`@db.mongo.collection` auto-injects a non-optional `_id: mongo.objectId` field if you do not declare one explicitly. This means every document gets a MongoDB `_id` even when your logical primary key is a different field.

::: tip
If you want to control the `_id` type, declare it explicitly. It must be `string`, `number`, or `mongo.objectId`.
:::

## Primary Keys & _id

MongoDB always uses `_id` as the document primary key. The adapter enforces this regardless of your schema:

- **Auto-injection** -- `@db.mongo.collection` adds `_id: mongo.objectId` if not declared. The `_id` field is always non-optional.
- **Custom `@meta.id` fields** -- Marking a non-`_id` field with `@meta.id` does not make it a MongoDB primary key. Instead, the adapter creates a unique index on it and registers it for fallback lookups.
- **`findById` resolution** -- First tries `_id`, then falls back to fields marked with `@meta.id`. So `findById(42)` works when `42` is an auto-incremented `id` field rather than an ObjectId.
- **`prepareId()` conversion** -- Automatically converts string IDs to `ObjectId` instances (for `mongo.objectId` fields) or to numbers (for numeric `_id` fields), so you can pass string values from URL parameters directly.

```typescript
// All of these work:
await users.findById(new ObjectId('507f1f77bcf86cd799439011'))  // by _id
await users.findById('507f1f77bcf86cd799439011')                // string -> ObjectId
await users.findById(42)                                         // by @meta.id field
```

**ID types**: ObjectId (default), string, or number.

## Auto-Increment

The `@db.default.increment` annotation enables auto-increment behavior for numeric fields:

```atscript
@meta.id
@db.default.increment
id: number
```

The adapter uses an `__atscript_counters` collection for atomic sequence allocation via `findOneAndUpdate` with `$inc`. Each counter is keyed by `{collection}.{field}`.

- On `insertOne`, the adapter atomically increments the counter by 1 and assigns the value.
- On `insertMany`, the counter is incremented by the batch size to pre-allocate a range. Values are assigned in order -- first item gets `seq - count + 1`, second gets `seq - count + 2`, and so on.
- If a document already has an explicit value for the field, that value is kept and the counter is adjusted to stay ahead.

::: warning
Concurrent inserts under high contention could produce duplicate values in rare cases. For guaranteed uniqueness, combine `@db.default.increment` with `@db.index.unique`.
:::

## Nested Objects

Unlike relational databases where nested objects are flattened into `__`-separated columns, MongoDB stores nested objects natively. The adapter skips flattening entirely -- nested JavaScript objects are passed through to MongoDB as-is and read back without reconstruction.

```atscript
@db.table 'users'
@db.mongo.collection
export interface User {
    @meta.id
    @db.default.increment
    id: number

    name: string

    contact: {
        email: string
        phone?: string
    }

    preferences: {
        theme: string
        lang: string
    }
}
```

Dot-notation queries work directly:

```typescript
const result = await users.findMany({
  filter: { 'contact.email': 'alice@example.com' },
  controls: { $sort: { 'preferences.theme': 1 } },
})
```

::: tip
The `@db.json` annotation has no effect on MongoDB -- there is no flattening to override. You can still use it for documentation purposes, but it does not change storage behavior.
:::

## Native Patch Pipelines

MongoDB uses aggregation pipelines for array patch operations instead of the read-modify-write cycle used by relational adapters. All five patch operators are supported:

- **`$insert`** -- Append items to an array
- **`$remove`** -- Remove items matching a condition
- **`$update`** -- Update matching items in place
- **`$upsert`** -- Update if exists, insert if not
- **`$replace`** -- Replace the entire array

This is transparent to your code -- the same patch API works across all adapters, but MongoDB executes updates atomically on the server using `$concatArrays`, `$filter`, `$map`, and other aggregation operators.

See [Patch Operations](./patch-operations) for the full patch API.

## Native Relation Loading

The adapter uses MongoDB `$lookup` aggregation stages for TO, FROM, and VIA relations instead of issuing separate queries. This means relation loading happens in a single round-trip to the database.

- **TO relations** -- `$lookup` with `localField` / `foreignField`
- **FROM relations** -- Reverse `$lookup` from the related collection
- **VIA relations** -- Two-stage `$lookup` through the junction collection

Relation controls (`$sort`, `$limit`, `$filter`) are applied as pipeline stages within the `$lookup`. Nested lookups (relations of relations) are supported.

## MongoDB-Specific Annotations

These annotations are available when the `MongoPlugin` is registered. They extend the generic `@db.*` namespace with MongoDB-specific behavior.

| Annotation | Level | Purpose |
|------------|-------|---------|
| `@db.mongo.collection` | Interface | Mark as MongoDB collection, auto-inject `_id` |
| `@db.mongo.capped size, max?` | Interface | Capped collection with size limit |
| `@db.mongo.search.dynamic analyzer?, fuzzy?` | Interface | Dynamic Atlas Search index |
| `@db.mongo.search.static analyzer?, fuzzy?, indexName` | Interface | Named static Atlas Search index |
| `@db.mongo.search.text analyzer?, indexName` | Field | Include field in search index |
| `@db.mongo.search.vector dims, similarity?, indexName?` | Field | Vector search field |
| `@db.mongo.search.filter indexName` | Field | Pre-filter field for vector search |

All generic `@db.*` annotations (`@db.table`, `@db.index.*`, `@db.default.*`, `@db.rel.*`, `@db.json`, etc.) work with MongoDB as well. See [Annotations Reference](./annotations) for the full list.

## Primitives

### `mongo.objectId`

A string type constrained to 24-character hex strings matching the MongoDB ObjectId format. Used for `_id` fields. At runtime, the adapter converts these strings to native `ObjectId` instances automatically.

```atscript
@db.table 'users'
@db.mongo.collection
export interface User {
    // _id: mongo.objectId is auto-injected by @db.mongo.collection
    name: string
}
```

### `mongo.vector`

An alias for `number[]`, used as a semantic marker for embedding fields. Paired with `@db.mongo.search.vector` to declare vector search indexes.

```atscript
@db.mongo.search.vector 1536 'dotProduct' 'embeddings_idx'
embedding: mongo.vector
```

## Capped Collections

Capped collections have a fixed maximum size and maintain insertion order (FIFO). They are ideal for logs, event streams, and cache-like data. Once the collection reaches its size limit, the oldest documents are automatically removed to make room for new ones.

```atscript
@db.table 'logs'
@db.mongo.collection
@db.mongo.capped 10485760, 10000
@db.sync.method 'drop'
export interface LogEntry {
    message: string
    level: string
    @db.default.now
    timestamp: number.timestamp.created
}
```

The first argument is the maximum size in bytes (10 MB above), and the optional second argument is the maximum number of documents (10,000 above). Changing cap size requires dropping and recreating the collection, so always pair `@db.mongo.capped` with `@db.sync.method 'drop'` to allow schema sync to handle this.

::: warning
Capped collections do not support document deletion or updates that increase document size. They are append-only by design.
:::

## Transactions

MongoDB transactions require a replica set or mongos topology. The adapter detects the topology at runtime and gracefully disables transactions on standalone instances.

When available, transactions use the same `withTransaction()` API as other adapters. Call it on any table or adapter — not on `DbSpace` itself:

```typescript
const orders = db.getTable(Order)
const inventory = db.getTable(Inventory)

await orders.withTransaction(async () => {
  await orders.insertOne({ userId: 1, total: 99.99 })
  await inventory.updateOne({ productId: 42, stock: stock - 1 })
})
```

All tables in the same async context share the transaction via `AsyncLocalStorage`, even though each table has its own adapter instance.

The second constructor argument (`client`) enables transaction support. If you do not need transactions, `new MongoAdapter(db)` without the client is sufficient.

## Accessing the Adapter

For operations beyond the standard CRUD interface, access the underlying `MongoAdapter` to use native MongoDB driver methods. This is useful for aggregation pipelines, bulk writes, or any MongoDB-specific functionality not covered by the generic table API.

```typescript
const adapter = db.getAdapter(User) as MongoAdapter

// Run an aggregation pipeline
const cursor = adapter.collection.aggregate([
  { $match: { status: 'active' } },
  { $group: { _id: '$department', count: { $sum: 1 } } },
])
const results = await cursor.toArray()

// Use any MongoDB driver method
await adapter.collection.distinct('status')
await adapter.collection.bulkWrite([...])
```

You can also access the adapter through a table handle:

```typescript
const users = db.getTable(User)
const adapter = users.getAdapter()
const collection = adapter.collection  // native MongoDB Collection
```

## Complete Example

Putting it all together -- a product collection with auto-increment IDs, compound indexes, vector search, and pre-filter fields:

```atscript
@db.table 'products'
@db.mongo.collection
@db.mongo.search.dynamic 'lucene.standard' 1
export interface Product {
    @meta.id
    @db.default.increment
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

    @db.default.now
    createdAt?: number.timestamp.created
}
```

## Next Steps

- [MongoDB Search & Vectors](./mongodb-search) -- Atlas Search and vector search indexes
- [CRUD Operations](./crud) -- Full `AtscriptDbTable` API reference
- [Patch Operations](./patch-operations) -- Array patch operations and merge strategies

---
outline: deep
---

# SQLite

<!--@include: ./_experimental-warning.md-->

The SQLite adapter (`@atscript/db-sqlite`) connects your `.as` models to SQLite databases via `better-sqlite3` or any compatible driver. Define your schema once in Atscript, and the adapter handles table creation, queries, type mapping, and embedded object flattening automatically.

## Features

- Full CRUD operations (insert, find, update, replace, delete)
- Automatic schema sync — create and migrate tables from `.as` definitions
- Foreign key enforcement via `PRAGMA foreign_keys = ON`
- Index management (plain and unique)
- Transaction support for bulk and nested operations
- In-memory databases for testing and prototyping
- Custom drivers — swap `better-sqlite3` for `node:sqlite` or any other binding

## Installation

```bash
pnpm add @atscript/db-sqlite better-sqlite3
```

`better-sqlite3` is an optional peer dependency. You can use any SQLite driver that implements the `TSqliteDriver` interface.

## Quick Start

Three steps to get a typed table backed by SQLite:

```typescript
import { DbSpace } from '@atscript/db-utils'
import { SqliteAdapter, BetterSqlite3Driver } from '@atscript/db-sqlite'
import { User } from './user.as.js'

// 1. Create driver
const driver = new BetterSqlite3Driver('./myapp.db')

// 2. Create DbSpace with adapter factory
const db = new DbSpace(() => new SqliteAdapter(driver))

// 3. Get typed tables
const users = db.getTable(User)
```

Or use the convenience function that wraps all three steps:

```typescript
import { createAdapter } from '@atscript/db-sqlite'
import { User } from './user.as.js'

const db = createAdapter('./myapp.db')
const users = db.getTable(User)
```

Once you have a table, run `npx asc db sync` to create or update the database schema, then use `users.insertOne(...)`, `users.findMany(...)`, etc. See [CRUD Operations](./crud) for the full API.

## Type Mapping

Atscript types map to SQLite column types as follows:

| Atscript Type | SQLite Type | Notes |
|---------------|-------------|-------|
| `string` | `TEXT` | |
| `number` | `REAL` | `INTEGER` for primary keys (aliases `rowid`) |
| `decimal` | `REAL` | Runtime value is string; coerced on read |
| `boolean` | `INTEGER` | Stored as `0` / `1` |
| arrays | `TEXT` | JSON-serialized |
| nested objects | flattened columns | `parent__child` naming convention |
| `@db.json` fields | `TEXT` | JSON-serialized |

## Nested Objects

Nested object fields are automatically flattened into `__`-separated columns. You query with dot-notation and the adapter translates:

```atscript
@db.table 'contacts'
export interface Contact {
    @meta.id
    id: number

    name: string

    // Becomes columns: address__city, address__zip
    address: {
        city: string
        zip: string
    }
}
```

```typescript
// Insert — pass the nested structure naturally
await contacts.insertOne({
  id: 1,
  name: 'Alice',
  address: { city: 'Portland', zip: '97201' },
})

// Query — use dot-notation for nested fields
const results = await contacts.findMany({
  filter: { 'address.city': 'Portland' },
  controls: { $sort: { 'address.zip': 1 } },
})

// Read — nested objects are reconstructed automatically
// results[0].address → { city: 'Portland', zip: '97201' }
```

To store an entire nested object as a single JSON column instead of flattening, annotate it with `@db.json`. Arrays are always stored as JSON.

## Foreign Keys

SQLite foreign keys are enforced natively. The adapter enables `PRAGMA foreign_keys = ON` at connection time, so referential integrity is always active.

When a foreign key constraint is violated (e.g., inserting a row that references a non-existent parent, or deleting a parent with dependent children), the adapter raises a `DbError` with the `FK_VIOLATION` code:

```typescript
try {
  await tasks.insertOne({ id: 1, assigneeId: 999 }) // no user with id 999
} catch (err) {
  // err.code === 'FK_VIOLATION'
}
```

Cascade and set-null behaviors are controlled via `@db.rel.onDelete` and `@db.rel.onUpdate` annotations in your `.as` schema.

## Filters

All standard filter operators are supported (`$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`, `$and`, `$or`, `$not`). Regex patterns are converted to SQL `LIKE` expressions:

| Regex Pattern | SQL LIKE | Matches |
|---------------|----------|---------|
| `^abc` | `abc%` | Starts with "abc" |
| `end$` | `%end` | Ends with "end" |
| `^exact$` | `exact` | Exact match |
| `mid` | `%mid%` | Contains "mid" |

```typescript
// Pattern matching
await users.findMany({
  filter: { name: { $regex: '^Ali' } },
  controls: {},
})
// → WHERE name LIKE 'Ali%'
```

## In-Memory Databases

Pass `':memory:'` as the path to create an in-memory database — useful for tests and ephemeral data:

```typescript
const driver = new BetterSqlite3Driver(':memory:')
const db = new DbSpace(() => new SqliteAdapter(driver))
```

In-memory databases are lost when the process exits or the driver is closed.

## Custom Drivers

The `SqliteAdapter` accepts any object implementing `TSqliteDriver`. This lets you use `node:sqlite`, `sql.js`, or any other SQLite binding:

```typescript
interface TSqliteDriver {
  run(sql: string, params?: unknown[]): { changes: number; lastInsertRowid: number | bigint }
  all<T>(sql: string, params?: unknown[]): T[]
  get<T>(sql: string, params?: unknown[]): T | null
  exec(sql: string): void
  close(): void
}
```

Example using Node.js built-in `node:sqlite`:

```typescript
import { SqliteAdapter } from '@atscript/db-sqlite'
import { DatabaseSync } from 'node:sqlite'

const nodeDb = new DatabaseSync(':memory:')
const driver = {
  run(sql, params) {
    const stmt = nodeDb.prepare(sql)
    return stmt.run(...(params ?? []))
  },
  all(sql, params) {
    const stmt = nodeDb.prepare(sql)
    return stmt.all(...(params ?? []))
  },
  get(sql, params) {
    const stmt = nodeDb.prepare(sql)
    return stmt.get(...(params ?? [])) ?? null
  },
  exec(sql) { nodeDb.exec(sql) },
  close() { nodeDb.close() },
}

const adapter = new SqliteAdapter(driver)
```

## BetterSqlite3Driver

The built-in `BetterSqlite3Driver` accepts either a file path (string) or a pre-created `better-sqlite3` `Database` instance:

```typescript
// From file path
const driver = new BetterSqlite3Driver('./data.db')

// From existing instance
import Database from 'better-sqlite3'
const instance = new Database('./data.db', { verbose: console.log })
const driver = new BetterSqlite3Driver(instance)
```

The driver uses dynamic `import()` internally, so `better-sqlite3` remains an optional dependency — it is only loaded when `BetterSqlite3Driver` is instantiated.

## Limitations

- **No native fulltext search** — FTS5 indexes require manual setup outside Atscript
- **No database schemas** — the `@db.schema` annotation is ignored (SQLite has no schema namespaces)
- **Booleans stored as integers** — `true`/`false` map to `1`/`0`
- **No native array/JSON operations** — array patch operators use generic read-modify-write
- **Synchronous driver** — both `better-sqlite3` and `node:sqlite` are synchronous; the adapter wraps calls in promises for the async `BaseDbAdapter` contract

## Utilities

The package exports `buildWhere` for constructing SQL WHERE clauses from filter objects — useful when writing custom queries outside the standard CRUD flow:

```typescript
import { buildWhere } from '@atscript/db-sqlite'

const { sql, params } = buildWhere(
  { status: 'active', age: { $gte: 18 } },
  flatMap,
  columnMap,
)
// sql → 'WHERE "status" = ? AND "age" >= ?'
// params → ['active', 18]
```

## Next Steps

- [MongoDB](./mongodb) — MongoDB adapter with Atlas Search and aggregation support
- [CRUD Operations](./crud) — Full CRUD API reference for all adapters
- [Schema Sync](./schema-sync) — Automatic schema migration from `.as` definitions

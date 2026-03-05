# SQLite Adapter

::: warning Experimental
The SQLite adapter is experimental. APIs may change at any moment.
:::

`@atscript/db-sqlite` provides a SQLite adapter for the Atscript DB abstraction layer. It translates annotation-driven CRUD operations and MongoDB-style filters into SQL queries, with support for swappable SQLite driver implementations.

## Features

- Full CRUD operations (insert, find, update, replace, delete)
- Automatic table creation from Atscript field descriptors
- **Embedded object support** — nested objects flattened to `__`-separated columns, `@db.json` for JSON storage
- Index management (plain and unique indexes)
- MongoDB-style filter-to-SQL translation with parameterized queries
- Column mapping, defaults, and field ignoring via `@db.*` annotations
- Transaction support for bulk operations
- Swappable driver interface — use `better-sqlite3`, `node:sqlite`, or your own

## Installation

::: code-group
```bash [pnpm]
pnpm add @atscript/db-sqlite @atscript/utils-db better-sqlite3
```
```bash [npm]
npm install @atscript/db-sqlite @atscript/utils-db better-sqlite3
```
```bash [yarn]
yarn add @atscript/db-sqlite @atscript/utils-db better-sqlite3
```
:::

`better-sqlite3` is an optional peer dependency. You can use any SQLite driver that implements the `TSqliteDriver` interface.

## Quick Start

### 1. Define Your Schema

Create a `.as` file with `@db.*` annotations:

```atscript
// user.as
@db.table 'users'
export interface User {
    @meta.id
    id: number

    @db.index.unique 'email_idx'
    @db.column 'email_address'
    email: string

    @db.index.plain 'name_idx'
    name: string

    @db.default.value 'active'
    status: string

    @db.default.fn 'now'
    createdAt: number

    @db.ignore
    displayName?: string
}
```

### 2. Create the Adapter and Table

```typescript
import { AtscriptDbTable } from '@atscript/utils-db'
import { SqliteAdapter, BetterSqlite3Driver } from '@atscript/db-sqlite'
import UserMeta from './user.as.js'

// Open a database file (or use ':memory:' for in-memory)
const driver = new BetterSqlite3Driver('myapp.db')
const adapter = new SqliteAdapter(driver)

// Create the table instance
const users = new AtscriptDbTable<typeof UserMeta>(UserMeta, adapter)

// Create the table and indexes in the database
await users.ensureTable()
await users.syncIndexes()
```

### 3. Perform CRUD Operations

#### Insert

```typescript
await users.insertOne({
  id: 1,
  email: 'alice@example.com',
  name: 'Alice',
})
// status defaults to 'active'
// createdAt defaults to Date.now()
// displayName is stripped (@db.ignore)
// email is stored in 'email_address' column (@db.column)
```

#### Query

Read operations use the `Uniquery` format — `{ filter, controls }`:

```typescript
// Find by filter
const user = await users.findOne({
  filter: { email: 'alice@example.com' },
  controls: {},
})

// Find with sorting and pagination
const page = await users.findMany({
  filter: { status: 'active' },
  controls: { $sort: { name: 1 }, $limit: 10, $skip: 0 },
})

// Count
const total = await users.count({
  filter: { status: 'active' },
  controls: {},
})
```

#### Update

```typescript
// Partial update by primary key
await users.updateOne({ id: 1, status: 'inactive' })

// Update many by filter
await users.updateMany(
  { status: 'pending' },
  { status: 'active' }
)
```

#### Delete

```typescript
await users.deleteOne({ id: 1 })
await users.deleteMany({ status: 'deleted' })
```

## Advanced Filters

The SQLite adapter supports MongoDB-style filters translated to SQL:

```typescript
// Comparison
await users.findMany({ filter: { createdAt: { $gt: 1700000000 } }, controls: {} })

// Set membership
await users.findMany({ filter: { status: { $in: ['active', 'pending'] } }, controls: {} })

// Pattern matching (regex → LIKE)
await users.findMany({ filter: { name: { $regex: '^Ali' } }, controls: {} }) // LIKE 'Ali%'

// Logical operators
await users.findMany({
  filter: {
    $or: [
      { status: 'admin' },
      { createdAt: { $gt: 1700000000 } },
    ]
  },
  controls: {},
})
```

## Nested Objects

Nested object fields are automatically flattened into `__`-separated columns. Use `@db.json` to store as a single JSON column instead:

```atscript
// product.as
@db.table 'products'
export interface Product {
    @meta.id
    id: number
    name: string

    // Flattened → columns: dimensions__width, dimensions__height
    dimensions: {
        width: number
        height: number
    }

    // Single JSON column
    @db.json
    metadata: {
        color: string
        material?: string
    }

    // Arrays are always JSON
    tags: string[]
}
```

```typescript
// Insert with nested objects
await products.insertOne({
  id: 1,
  name: 'Widget',
  dimensions: { width: 10, height: 5 },
  metadata: { color: 'red', material: 'plastic' },
  tags: ['sale', 'new'],
})

// Query by nested path (dot-notation → __-separated column)
const results = await products.findMany({
  filter: { 'dimensions.width': { $gt: 5 } },
  controls: { $sort: { 'dimensions.height': 1 } },
})

// Read back — nested objects reconstructed automatically
// results[0].dimensions → { width: 10, height: 5 }
// results[0].metadata → { color: 'red', material: 'plastic' }
```

See [Embedded Objects](./tables#embedded-objects) for the full flattening strategy.

## Using a Custom Driver

The `SqliteAdapter` accepts any object implementing `TSqliteDriver`. This makes it easy to swap drivers or wrap existing ones:

```typescript
import { SqliteAdapter } from '@atscript/db-sqlite'
import type { TSqliteDriver } from '@atscript/db-sqlite'

// Use Node.js built-in sqlite (node:sqlite)
import { DatabaseSync } from 'node:sqlite'

const nodeDb = new DatabaseSync(':memory:')
const driver: TSqliteDriver = {
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

## In-Memory Database

For testing or transient data, use an in-memory database:

```typescript
const driver = new BetterSqlite3Driver(':memory:')
const adapter = new SqliteAdapter(driver)
```

## Limitations

- **Fulltext indexes** are skipped (not supported in basic SQLite)
- **Schema names** (`@db.schema`) are ignored (SQLite doesn't have schemas)
- **Nested objects** are flattened into `__`-separated columns by default; `@db.json` and arrays are stored as JSON TEXT
- **Booleans** are stored as INTEGER (1/0)
- **Native array patches** are not supported — patches are decomposed into flat updates

## When to Use

The SQLite adapter is a good choice for:

- **Local-first applications** — Embedded database with zero configuration
- **Development and testing** — Fast setup with in-memory or file-based databases
- **CLI tools** — Ship a single binary with embedded storage
- **Prototyping** — Quickly test your Atscript data models before choosing a production database

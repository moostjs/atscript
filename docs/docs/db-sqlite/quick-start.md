# Quick Start

::: warning Experimental
The SQLite adapter is experimental. APIs may change at any moment.
:::

## 1. Define Your Schema

Create a `.as` file with `@db.*` annotations:

```atscript
// user.as
@db.table 'users'
export interface User {
    @db.id
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

## 2. Create the Adapter and Table

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

## 3. Perform CRUD Operations

### Insert

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

### Query

```typescript
// Find by filter
const user = await users.findOne({ email: 'alice@example.com' })

// Find with sorting and pagination
const page = await users.findMany(
  { status: 'active' },
  { sort: { name: 1 }, limit: 10, skip: 0 }
)

// Count
const total = await users.count({ status: 'active' })
```

### Update

```typescript
// Partial update by primary key
await users.updateOne({ id: 1, status: 'inactive' })

// Update many by filter
await users.updateMany(
  { status: 'pending' },
  { status: 'active' }
)
```

### Delete

```typescript
await users.deleteOne({ id: 1 })
await users.deleteMany({ status: 'deleted' })
```

## 4. Advanced Filters

The SQLite adapter supports MongoDB-style filters translated to SQL:

```typescript
// Comparison
await users.findMany({ createdAt: { $gt: 1700000000 } })

// Set membership
await users.findMany({ status: { $in: ['active', 'pending'] } })

// Pattern matching (regex → LIKE)
await users.findMany({ name: { $regex: '^Ali' } }) // LIKE 'Ali%'

// Logical operators
await users.findMany({
  $or: [
    { status: 'admin' },
    { createdAt: { $gt: 1700000000 } },
  ]
})
```

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

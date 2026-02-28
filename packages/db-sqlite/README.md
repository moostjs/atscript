# @atscript/db-sqlite

SQLite adapter for `@atscript/utils-db` with a swappable driver architecture. Define your schema once in Atscript, then use it with any SQLite engine.

## Architecture

```
AtscriptDbTable ──delegates──▶ SqliteAdapter ──delegates──▶ TSqliteDriver
                                (extends BaseDbAdapter)      (interface)
                                                                │
                                                     ┌─────────┴──────────┐
                                                     │                    │
                                            BetterSqlite3Driver    (your own driver)
                                            (ships with package)    node:sqlite
                                                                    sql.js, etc.
```

The adapter defines a minimal `TSqliteDriver` interface — just raw SQL primitives (`run`, `all`, `get`, `exec`, `close`). The actual SQLite engine is injected, not hardcoded.

## Installation

```bash
pnpm add @atscript/db-sqlite better-sqlite3
```

`better-sqlite3` is an **optional peer dependency** — only required if you use the built-in `BetterSqlite3Driver`. Bring your own driver if you prefer a different engine.

## Quick Start

```typescript
import { AtscriptDbTable } from '@atscript/utils-db'
import { SqliteAdapter, BetterSqlite3Driver } from '@atscript/db-sqlite'
import { User } from './user.as'

// 1. Create a driver (in-memory or file-based)
const driver = new BetterSqlite3Driver(':memory:')
// or: new BetterSqlite3Driver('./data.db')

// 2. Create adapter + table
const adapter = new SqliteAdapter(driver)
const users = new AtscriptDbTable(User, adapter)

// 3. Set up schema
await users.ensureTable()   // CREATE TABLE IF NOT EXISTS
await users.syncIndexes()   // CREATE INDEX / DROP INDEX

// 4. CRUD
await users.insertOne({ name: 'John', email: 'john@example.com' })
const john = await users.findOne({ name: 'John' })
await users.findMany({ status: 'active' }, { limit: 10, sort: { name: 1 } })
await users.count({ status: 'active' })
await users.updateMany({ status: 'inactive' }, { status: 'archived' })
await users.deleteOne(123)
await users.deleteMany({ status: 'archived' })
```

## Swapping the Driver

The `TSqliteDriver` interface is minimal — implement these 5 methods:

```typescript
interface TSqliteDriver {
  run(sql: string, params?: unknown[]): TSqliteRunResult
  all<T>(sql: string, params?: unknown[]): T[]
  get<T>(sql: string, params?: unknown[]): T | null
  exec(sql: string): void
  close(): void
}

interface TSqliteRunResult {
  changes: number
  lastInsertRowid: number | bigint
}
```

### Example: Custom driver

```typescript
import { SqliteAdapter, type TSqliteDriver } from '@atscript/db-sqlite'

class MyDriver implements TSqliteDriver {
  run(sql: string, params?: unknown[]) {
    // your implementation
    return { changes: 0, lastInsertRowid: 0 }
  }
  all(sql: string, params?: unknown[]) { /* ... */ }
  get(sql: string, params?: unknown[]) { /* ... */ }
  exec(sql: string) { /* ... */ }
  close() { /* ... */ }
}

const adapter = new SqliteAdapter(new MyDriver())
```

### Example: node:sqlite (Node 22.5+)

```typescript
import { DatabaseSync } from 'node:sqlite'
import { SqliteAdapter, type TSqliteDriver } from '@atscript/db-sqlite'

class NodeSqliteDriver implements TSqliteDriver {
  private db: DatabaseSync

  constructor(path: string) {
    this.db = new DatabaseSync(path)
  }

  run(sql: string, params?: unknown[]) {
    const stmt = this.db.prepare(sql)
    stmt.run(...(params ?? []))
    return {
      changes: this.db.changes,
      lastInsertRowid: this.db.lastInsertRowId,
    }
  }

  all<T>(sql: string, params?: unknown[]): T[] {
    return this.db.prepare(sql).all(...(params ?? [])) as T[]
  }

  get<T>(sql: string, params?: unknown[]): T | null {
    return (this.db.prepare(sql).get(...(params ?? [])) as T) ?? null
  }

  exec(sql: string) { this.db.exec(sql) }
  close() { this.db.close() }
}

const adapter = new SqliteAdapter(new NodeSqliteDriver(':memory:'))
```

## Filter Syntax

Filters use MongoDB-style query objects (same format as URLQL):

| Filter | SQL |
|---|---|
| `{ field: value }` | `field = ?` |
| `{ field: { $gt: 5 } }` | `field > ?` |
| `{ field: { $gte: 5 } }` | `field >= ?` |
| `{ field: { $lt: 5 } }` | `field < ?` |
| `{ field: { $lte: 5 } }` | `field <= ?` |
| `{ field: { $ne: value } }` | `field != ?` |
| `{ field: { $in: [1, 2] } }` | `field IN (?, ?)` |
| `{ field: { $nin: [1, 2] } }` | `field NOT IN (?, ?)` |
| `{ field: { $exists: true } }` | `field IS NOT NULL` |
| `{ field: { $regex: '^abc' } }` | `field LIKE 'abc%'` |
| `{ $and: [...] }` | `(... AND ...)` |
| `{ $or: [...] }` | `(... OR ...)` |
| `{ $not: {...} }` | `NOT (...)` |

All values are parameterized — no SQL injection risk.

## Schema Operations

### `ensureTable()`

Generates `CREATE TABLE IF NOT EXISTS` from the Atscript type:
- Column types inferred from `designType` (`string` → TEXT, `number` → REAL, `boolean` → INTEGER)
- Primary keys from `@meta.id`
- `NOT NULL` for required fields
- `@db.column` mappings applied (logical → physical column names)
- `@db.ignore` fields excluded

### `syncIndexes()`

Compares existing indexes with `@db.index.*` annotations:
- Creates missing indexes (`CREATE INDEX` / `CREATE UNIQUE INDEX`)
- Drops stale indexes no longer in the definition
- Supports `@db.index.plain`, `@db.index.unique`
- `@db.index.fulltext` is skipped (requires FTS5 virtual tables — not auto-managed)

## Write Pipeline

When you call `insertOne(payload)`, `AtscriptDbTable` automatically:

1. Applies `@db.default.value` defaults for missing fields
2. Validates against the Atscript type
3. Strips `@db.ignore` fields
4. Maps `@db.column` logical names to physical column names
5. Delegates to `SqliteAdapter.insertOne()` which generates and runs the SQL

## Exports

```typescript
// Classes
export { SqliteAdapter } from './sqlite-adapter'
export { BetterSqlite3Driver } from './better-sqlite3-driver'

// Utilities
export { buildWhere } from './filter-builder'

// Types
export type { TSqliteDriver, TSqliteRunResult } from './types'
export type { TSqlFragment } from './filter-builder'
```

## Why Sync Driver Interface?

The driver interface is **synchronous** because:
- SQLite is an embedded engine — no network I/O
- `better-sqlite3` and `node:sqlite` are both synchronous
- The `SqliteAdapter` wraps sync calls in promises for the async `BaseDbAdapter` contract
- For truly async drivers, implement the interface with a synchronous wrapper or create a custom adapter subclass

## License

ISC

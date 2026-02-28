# API Reference

::: warning Experimental
The SQLite adapter is experimental. APIs may change at any moment.
:::

## SqliteAdapter

The main adapter class. Extends `BaseDbAdapter` from `@atscript/utils-db`.

```typescript
import { SqliteAdapter } from '@atscript/db-sqlite'
```

### Constructor

```typescript
new SqliteAdapter(driver: TSqliteDriver)
```

Accepts any object implementing the `TSqliteDriver` interface.

### Schema Operations

#### `ensureTable()`

Creates the SQLite table if it doesn't exist. Uses `CREATE TABLE IF NOT EXISTS` with column types derived from Atscript field descriptors.

Type mapping:

| Atscript Type | SQLite Type |
|---------------|-------------|
| `number`, `integer` | `REAL` |
| `boolean` | `INTEGER` |
| `string` | `TEXT` |
| Objects / arrays | `TEXT` (stored as JSON) |

Primary keys are set as `PRIMARY KEY` (single) or composite `PRIMARY KEY(col1, col2)`.

#### `syncIndexes()`

Synchronizes indexes with the database. Creates missing indexes prefixed with `atscript__` and drops stale ones. Fulltext indexes are skipped.

### Value Conversion

The adapter converts JavaScript values to SQLite-compatible formats:

| JavaScript | SQLite |
|------------|--------|
| `undefined`, `null` | `NULL` |
| `boolean` | `1` or `0` |
| Objects, arrays | JSON string |
| Numbers, strings | As-is |

### SQLite-Specific Behavior

- **`@db.schema`** is ignored — SQLite doesn't support schemas
- **`updateOne` / `deleteOne`** use a `rowid` subquery to limit to one row (SQLite doesn't support `UPDATE ... LIMIT`)
- **`replaceOne`** uses a transaction: DELETE + INSERT
- **`insertMany`** is wrapped in a BEGIN/COMMIT transaction

---

## BetterSqlite3Driver

A concrete `TSqliteDriver` implementation using the `better-sqlite3` library.

```typescript
import { BetterSqlite3Driver } from '@atscript/db-sqlite'
```

### Constructor

```typescript
// Open by file path
new BetterSqlite3Driver(filename: string, options?: object)

// Wrap an existing better-sqlite3 Database instance
new BetterSqlite3Driver(db: Database)
```

### Examples

```typescript
// File database
const driver = new BetterSqlite3Driver('./data.db')

// In-memory database
const driver = new BetterSqlite3Driver(':memory:')

// With options
const driver = new BetterSqlite3Driver('./data.db', { readonly: true })

// Existing instance
import Database from 'better-sqlite3'
const db = new Database('./data.db')
const driver = new BetterSqlite3Driver(db)
```

---

## TSqliteDriver Interface

The minimal driver contract for SQLite adapters. Intentionally synchronous because SQLite is an embedded engine with no network I/O.

```typescript
interface TSqliteDriver {
  run(sql: string, params?: unknown[]): TSqliteRunResult
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[]
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): T | null
  exec(sql: string): void
  close(): void
}

interface TSqliteRunResult {
  changes: number
  lastInsertRowid: number | bigint
}
```

| Method | Purpose |
|--------|---------|
| `run` | Execute INSERT, UPDATE, DELETE. Returns affected row count and last inserted rowid. |
| `all` | Execute SELECT, return all matching rows. |
| `get` | Execute SELECT, return first matching row or `null`. |
| `exec` | Execute raw SQL (PRAGMA, multi-statement, DDL). |
| `close` | Close the database connection. |

---

## buildWhere

Converts a MongoDB-style filter object to a SQL WHERE clause with parameterized values.

```typescript
import { buildWhere } from '@atscript/db-sqlite'
import type { TSqlFragment } from '@atscript/db-sqlite'

const { sql, params } = buildWhere({ status: 'active', age: { $gt: 18 } })
// sql:    '"status" = ? AND "age" > ?'
// params: ['active', 18]
```

### Supported Operators

| Filter | SQL Output |
|--------|------------|
| `{ field: value }` | `"field" = ?` |
| `{ field: null }` | `"field" IS NULL` |
| `{ field: { $gt: v } }` | `"field" > ?` |
| `{ field: { $gte: v } }` | `"field" >= ?` |
| `{ field: { $lt: v } }` | `"field" < ?` |
| `{ field: { $lte: v } }` | `"field" <= ?` |
| `{ field: { $ne: v } }` | `"field" != ?` |
| `{ field: { $ne: null } }` | `"field" IS NOT NULL` |
| `{ field: { $in: [a, b] } }` | `"field" IN (?, ?)` |
| `{ field: { $nin: [a, b] } }` | `"field" NOT IN (?, ?)` |
| `{ field: { $exists: true } }` | `"field" IS NOT NULL` |
| `{ field: { $exists: false } }` | `"field" IS NULL` |
| `{ field: { $regex: '^abc' } }` | `"field" LIKE 'abc%'` |
| `{ $and: [...] }` | `(... AND ...)` |
| `{ $or: [...] }` | `(... OR ...)` |
| `{ $not: {...} }` | `NOT (...)` |

### Regex-to-LIKE Conversion

| Regex Pattern | LIKE Pattern |
|---------------|-------------|
| `^abc` | `abc%` (starts with) |
| `abc$` | `%abc` (ends with) |
| `^abc$` | `abc` (exact match) |
| `abc` | `%abc%` (contains) |

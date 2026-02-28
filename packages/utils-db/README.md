# @atscript/utils-db

Generic database abstraction layer for Atscript. Provides a unified CRUD interface driven by `@db.*` annotations, with pluggable database adapters.

## Purpose

Full-stack Atscript projects define data models with `@db.*` annotations — table names, indexes, column mappings, defaults, primary keys. This package extracts all that metadata and provides:

- **`AtscriptDbTable`** — a concrete class that reads `@db.*` annotations, pre-computes indexes and field metadata, orchestrates validation/defaults/column mapping, and delegates actual database calls to an adapter.
- **`BaseDbAdapter`** — an abstract class that adapter authors extend to connect any database (MongoDB, SQLite, MySQL, PostgreSQL, etc.).

The same annotated type works with any adapter. Cross-cutting concerns (field-level permissions, audit logging, soft deletes) are added by subclassing `AtscriptDbTable` — they work with every adapter automatically.

## Architecture

```
AtscriptDbTable ──delegates CRUD──▶ BaseDbAdapter
                ◀──reads metadata── (via this._table)
```

**One adapter per table.** The adapter gets a back-reference to the table instance via `registerTable()`, giving it full access to computed metadata (flatMap, indexes, primaryKeys, columnMap, etc.) for internal use in query rendering, index sync, and other adapter-specific logic.

## Installation

```bash
pnpm add @atscript/utils-db
```

Peer dependencies: `@atscript/core`, `@atscript/typescript`.

## Quick Start

### 1. Define your type in Atscript (`.as` file)

```atscript
@db.table "users"
@db.schema "auth"
interface User {
  @meta.id
  id: number

  @db.index.unique "email_idx"
  @db.column "email_address"
  email: string

  @db.index.plain "name_idx"
  name: string

  @db.default.value "active"
  status: string

  @db.ignore
  displayName?: string
}
```

### 2. Create an adapter and table

```typescript
import { AtscriptDbTable } from '@atscript/utils-db'
import { MyAdapter } from './my-adapter'
import { User } from './user.as'

const adapter = new MyAdapter(/* db connection */)
const users = new AtscriptDbTable(User, adapter)

// CRUD operations
await users.insertOne({ name: 'John', email: 'john@example.com' })
await users.findMany({ status: 'active' }, { limit: 10 })
await users.deleteOne(123)
await users.syncIndexes()
```

## Writing a Database Adapter

Extend `BaseDbAdapter` and implement the abstract methods. The adapter receives a back-reference to the `AtscriptDbTable` instance — use `this._table` to access all computed metadata.

### Minimal adapter

```typescript
import {
  BaseDbAdapter,
  type TDbFilter,
  type TDbFindOptions,
  type TDbInsertResult,
  type TDbInsertManyResult,
  type TDbUpdateResult,
  type TDbDeleteResult,
} from '@atscript/utils-db'

class SqliteAdapter extends BaseDbAdapter {
  constructor(private db: SqliteDatabase) {
    super()
  }

  // Access table metadata via this._table:
  //   this._table.tableName    — resolved table name
  //   this._table.schema       — database schema/namespace
  //   this._table.flatMap      — Map<string, TAtscriptAnnotatedType>
  //   this._table.indexes      — Map<string, TDbIndex>
  //   this._table.primaryKeys  — readonly string[]
  //   this._table.columnMap    — Map<string, string> (logical → physical)
  //   this._table.defaults     — Map<string, TDbDefaultValue>
  //   this._table.ignoredFields — Set<string>
  //   this._table.uniqueProps  — Set<string>

  async insertOne(data: Record<string, unknown>): Promise<TDbInsertResult> {
    const table = this._table.tableName
    const keys = Object.keys(data)
    const placeholders = keys.map(() => '?').join(', ')
    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`
    const result = this.db.run(sql, Object.values(data))
    return { insertedId: result.lastInsertRowid }
  }

  async insertMany(data: Record<string, unknown>[]): Promise<TDbInsertManyResult> {
    const ids: unknown[] = []
    for (const row of data) {
      const result = await this.insertOne(row)
      ids.push(result.insertedId)
    }
    return { insertedCount: ids.length, insertedIds: ids }
  }

  async findOne(
    filter: TDbFilter,
    options?: TDbFindOptions
  ): Promise<Record<string, unknown> | null> {
    const { sql, params } = this.buildSelect(filter, { ...options, limit: 1 })
    return this.db.get(sql, params) ?? null
  }

  async findMany(
    filter: TDbFilter,
    options?: TDbFindOptions
  ): Promise<Record<string, unknown>[]> {
    const { sql, params } = this.buildSelect(filter, options)
    return this.db.all(sql, params)
  }

  async updateOne(
    filter: TDbFilter,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult> {
    // ... build UPDATE ... SET ... WHERE ...
  }

  async replaceOne(
    filter: TDbFilter,
    data: Record<string, unknown>
  ): Promise<TDbUpdateResult> {
    // ... INSERT OR REPLACE ...
  }

  async deleteOne(filter: TDbFilter): Promise<TDbDeleteResult> {
    // ... DELETE FROM ... WHERE ...
  }

  async count(filter: TDbFilter): Promise<number> {
    // ... SELECT COUNT(*) ...
  }

  async updateMany(filter: TDbFilter, data: Record<string, unknown>): Promise<TDbUpdateResult> {
    // ... UPDATE ... SET ... WHERE ...
  }

  async replaceMany(filter: TDbFilter, data: Record<string, unknown>): Promise<TDbUpdateResult> {
    // ... batch replace ...
  }

  async deleteMany(filter: TDbFilter): Promise<TDbDeleteResult> {
    // ... DELETE FROM ... WHERE ...
  }

  async syncIndexes(): Promise<void> {
    // Read this._table.indexes and CREATE INDEX / DROP INDEX as needed
    for (const [key, index] of this._table.indexes) {
      const cols = index.fields.map(f =>
        `${f.name} ${f.sort === 'desc' ? 'DESC' : 'ASC'}`
      ).join(', ')
      const unique = index.type === 'unique' ? 'UNIQUE' : ''
      this.db.run(
        `CREATE ${unique} INDEX IF NOT EXISTS ${index.name}
         ON ${this._table.tableName} (${cols})`
      )
    }
  }

  async ensureTable(): Promise<void> {
    // Use this._table.flatMap, primaryKeys, etc. to build CREATE TABLE
  }
}
```

### Adapter hooks

Override these optional methods to process adapter-specific annotations during field scanning:

| Hook | When it runs | Use case |
|---|---|---|
| `onBeforeFlatten(type)` | Before field scanning begins | Extract table-level adapter annotations |
| `onFieldScanned(field, type, metadata)` | For each field during scanning | Extract field-level adapter annotations |
| `onAfterFlatten()` | After all fields are scanned | Finalize adapter-specific computed state |
| `getAdapterTableName(type)` | During constructor | Return adapter-specific table name (e.g., from `@db.mongo.collection`) |
| `getTopLevelArrayTag()` | During flatten | Return custom tag for top-level array detection |

### Overridable behaviors

| Method | Default | Override to... |
|---|---|---|
| `prepareId(id, fieldType)` | passthrough | Convert string → ObjectId, parse UUIDs, etc. |
| `getValidatorPlugins()` | `[]` | Add adapter-specific validation (e.g., ObjectId format) |
| `supportsNativePatch()` | `false` | Enable native array patch operations |
| `nativePatch(filter, patch)` | throws | Implement native patch (e.g., MongoDB `$push`/`$pull`) |

## What `AtscriptDbTable` Does For You

When you call `insertOne(payload)`, the table automatically:

1. **Flattens** the annotated type (lazy, cached) — extracts all fields, indexes, metadata
2. **Applies defaults** — fills `@db.default.value` fields that are missing
3. **Validates** — runs Atscript validators + adapter plugins
4. **Prepares IDs** — calls `adapter.prepareId()` on primary key fields
5. **Strips ignored fields** — removes `@db.ignore` fields
6. **Maps columns** — renames `@db.column` logical names to physical names
7. **Delegates** — calls `adapter.insertOne()` with the cleaned data

For `updateOne()`, it additionally:
- Extracts a filter from primary key fields in the payload
- Routes to `adapter.nativePatch()` if supported, otherwise decomposes the patch generically

## Supported Annotations

These `@db.*` annotations are defined in `@atscript/core` and processed by `AtscriptDbTable`:

| Annotation | Level | Purpose |
|---|---|---|
| `@db.table "name"` | Interface | Table/collection name |
| `@db.schema "name"` | Interface | Database schema/namespace |
| `@meta.id` | Field | Marks primary key (no args; multiple = composite key) |
| `@db.column "name"` | Field | Physical column name override |
| `@db.default.value "val"` | Field | Default value on insert |
| `@db.default.fn "now"` | Field | Default function (`now`, `uuid`, `increment`) |
| `@db.ignore` | Field | Exclude from database operations |
| `@db.index.plain "name"` | Field | B-tree index (optional sort: `"name", "desc"`) |
| `@db.index.unique "name"` | Field | Unique index |
| `@db.index.fulltext "name"` | Field | Full-text search index |

Multiple fields with the same index name form a **composite index**.

## Cross-Cutting Concerns

Since `AtscriptDbTable` is concrete, extend it for cross-cutting concerns that work with any adapter:

```typescript
class SecureDbTable extends AtscriptDbTable {
  constructor(type, adapter, private permissions: PermissionConfig) {
    super(type, adapter)
  }

  async insertOne(payload) {
    this.checkPermission('write', payload)
    return super.insertOne(payload)
  }

  async findOne(filter, options) {
    const result = await super.findOne(filter, options)
    return result ? this.filterFields(result, 'read') : null
  }
}

// Works with any adapter:
const secureUsers = new SecureDbTable(User, new MongoAdapter(db), perms)
const secureOrders = new SecureDbTable(Order, new SqliteAdapter(db), perms)
```

## Array Patch Operations

For fields that are arrays of objects, `updateOne()` supports structured patch operators:

```typescript
await users.updateOne({
  id: 123,
  tags: {
    $insert: [{ name: 'new-tag' }],          // append items
    $upsert: [{ name: 'existing', value: 1 }], // insert or replace by key
    $update: [{ name: 'existing', value: 2 }], // partial update by key
    $remove: [{ name: 'old-tag' }],           // remove by key
    $replace: [/* full replacement */],        // replace entire array
  }
})
```

Array element identity uses `@expect.array.key` annotations. Adapters with native patch support (e.g., MongoDB's `$push`/`$pull`) can implement `nativePatch()` for optimal performance. Otherwise, `decomposePatch()` provides a generic decomposition.

## Exports

```typescript
// Classes
export { AtscriptDbTable } from './db-table'
export { BaseDbAdapter } from './base-adapter'

// Utilities
export { decomposePatch } from './patch-decomposer'
export { getKeyProps } from './patch-types'

// Types
export type {
  TDbFilter, TDbFindOptions,
  TDbInsertResult, TDbInsertManyResult, TDbUpdateResult, TDbDeleteResult,
  TDbIndex, TDbIndexField, TDbDefaultValue, TIdDescriptor, TDbFieldMeta,
  TArrayPatch, TDbPatch,
} from './types'
export type { TGenericLogger } from './logger'
export { NoopLogger } from './logger'
```

## License

ISC

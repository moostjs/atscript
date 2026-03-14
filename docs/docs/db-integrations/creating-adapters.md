---
outline: deep
---

# Creating Custom Adapters

<!--@include: ./_experimental-warning.md-->

You can create adapters for any database by extending `BaseDbAdapter` from `@atscript/db`. This guide covers the full interface — every abstract method you must implement, every optional hook you can override, and how your adapter plugs into the rest of the system.

## Architecture

Your adapter sits between the table API and the database:

```
AtscriptDbTable → BaseDbAdapter (your adapter) → Database
```

The table handles query translation, field flattening, relation orchestration, validation, and default values. Your adapter handles raw CRUD operations and DDL — it receives pre-processed data and query objects, and returns results in a standard format.

When an `AtscriptDbTable` is created with your adapter, it registers itself via `registerReadable()`. From that point, you can access all computed table metadata through `this._table`.

## Getting Started

Extend `BaseDbAdapter` and implement the abstract methods:

```typescript
import { BaseDbAdapter } from '@atscript/db'

export class PostgresAdapter extends BaseDbAdapter {
  constructor(private pool: Pool) {
    super()
  }

  // implement abstract methods (see below)
}
```

## Required Methods

These are abstract — every adapter must implement all of them.

### Insert

- **`insertOne(data)`** — Insert a single record. Returns `TDbInsertResult` with `{ insertedId }`.
- **`insertMany(data)`** — Insert multiple records. Returns `TDbInsertManyResult` with `{ insertedCount, insertedIds }`.

Data is already validated, defaults applied, and columns mapped by the table layer.

### Read

- **`findOne(query)`** — Find a single record matching the query. Returns the record or `null`. The `query` object contains `filter` (WHERE conditions) and `controls` (sort, limit, skip, select).
- **`findMany(query)`** — Find all records matching the query. Returns an array of records.
- **`count(query)`** — Count records matching the query filter. Returns a number.

### Update

- **`updateOne(filter, data)`** — Update a single record matching the filter. Returns `TDbUpdateResult` with `{ matchedCount, modifiedCount }`.
- **`updateMany(filter, data)`** — Update all records matching the filter.
- **`replaceOne(filter, data)`** — Full replacement of a single record (all columns overwritten).
- **`replaceMany(filter, data)`** — Full replacement of all matching records.

### Delete

- **`deleteOne(filter)`** — Delete a single record matching the filter. Returns `TDbDeleteResult` with `{ deletedCount }`.
- **`deleteMany(filter)`** — Delete all records matching the filter.

### Schema

- **`ensureTable()`** — Create the table/collection if it does not exist. Use `this._table.tableName`, `this._table.fieldDescriptors`, and `this._table.foreignKeys` to build the DDL.
- **`syncIndexes()`** — Synchronize indexes between Atscript definitions and the database. Use `this._table.indexes` for the desired index state.

::: tip
Data passed to insert/update/replace methods is **already processed** by the table layer — defaults applied, `@db.ignore` fields stripped, column names mapped. Your adapter only needs to translate to the database's native query language.
:::

## Capability Flags

Override these methods to declare what your database supports. All return `false` by default.

### `supportsNativePatch()`

Return `true` if your database handles array patch operators natively (e.g., MongoDB's `$push`, `$pull`). When `false`, the table layer decomposes patch operations into standard update calls.

### `supportsNestedObjects()`

Return `true` if your database stores nested objects natively (e.g., MongoDB embedded documents). When `true`, the table layer skips flattening and passes nested objects as-is. When `false`, nested objects are flattened to `__`-separated column names (e.g., `address__city`).

### `supportsNativeForeignKeys()`

Return `true` if your database enforces FK constraints at the engine level (e.g., SQLite with `PRAGMA foreign_keys = ON`). When `true`, the table layer skips application-level cascade/setNull logic on delete. When `false`, the table layer handles cascade by finding and deleting/nullifying child records before the parent.

### `supportsNativeRelations()`

Return `true` to handle `$with` relation loading natively via database features like SQL JOINs or MongoDB `$lookup`. When `false`, the table layer uses application-level batch loading — issuing separate queries per relation and stitching results together.

## Transaction Support

Override three protected methods to enable transactions:

```typescript
protected async _beginTransaction(): Promise<unknown> {
  // Start a transaction, return opaque state (e.g., a session object)
  await this.pool.query('BEGIN')
  return { /* your transaction state */ }
}

protected async _commitTransaction(state: unknown): Promise<void> {
  await this.pool.query('COMMIT')
}

protected async _rollbackTransaction(state: unknown): Promise<void> {
  await this.pool.query('ROLLBACK')
}
```

The `state` value you return from `_beginTransaction` is passed to commit and rollback. Use it to carry database-specific context (e.g., a MongoDB `ClientSession`).

Transaction context is tracked via `AsyncLocalStorage` — nested `withTransaction()` calls within the same async chain automatically reuse the existing transaction. Inside any method, call `this._getTransactionState()` to retrieve the current transaction state.

## Adapter Hooks

These optional methods are called during table initialization when the table scans its type metadata.

### `onBeforeFlatten(type)`

Called before field scanning begins. Use this to extract table-level adapter-specific annotations.

```typescript
onBeforeFlatten(type: TAtscriptAnnotatedType): void {
  // Example: read a table-level annotation
  const dynamic = type.metadata?.get('db.mongo.search.dynamic')
  if (dynamic) this.searchConfig.dynamic = true
}
```

### `onFieldScanned(field, type, metadata)`

Called for each field during the scanning process. Use this to extract per-field adapter-specific annotations.

```typescript
onFieldScanned(
  field: string,
  type: TAtscriptAnnotatedType,
  metadata: TMetadataMap
): void {
  // Example: register vector search fields
  const vector = metadata.get('db.mongo.search.vector')
  if (vector) this.vectorFields.set(field, vector)
}
```

### `onAfterFlatten()`

Called after all fields are scanned. Finalize any computed state here. You can access the fully populated `this._table` at this point.

```typescript
onAfterFlatten(): void {
  // Example: hardcode a primary key that the adapter always uses
  this._table.primaryKeys.add('_id')
}
```

### `getAdapterTableName(type)`

Return an adapter-specific table name, or `undefined` to fall back to `@db.table` or the interface name.

```typescript
getAdapterTableName(type: TAtscriptAnnotatedType): string | undefined {
  // Example: read from a custom annotation
  return type.metadata?.get('db.postgres.table') as string | undefined
}
```

## ID Preparation

Override `prepareId(id, fieldType)` to transform primary key values before they are used in queries. This is called when building filters for `findById`, relation loading, and other ID-based lookups.

```typescript
prepareId(id: unknown, fieldType: TAtscriptAnnotatedType): unknown {
  // Example: convert string IDs to MongoDB ObjectId
  return new ObjectId(id as string)
}
```

The default implementation returns `id` unchanged.

## Native Patch Support

If `supportsNativePatch()` returns `true`, implement the `nativePatch` method:

```typescript
async nativePatch(
  filter: FilterExpr,
  patch: unknown
): Promise<TDbUpdateResult> {
  // Convert patch operators to database-native operations
  // e.g., { $push: { tags: 'new' } } → MongoDB updateOne
  const result = await this.collection.updateOne(
    this.buildFilter(filter),
    patch as UpdateFilter<Document>
  )
  return {
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount,
  }
}
```

When `supportsNativePatch()` returns `false` (the default), the table layer decomposes patch operations into read-modify-write cycles using standard `updateOne`.

## Native Relation Loading

If `supportsNativeRelations()` returns `true`, implement `loadRelations`:

```typescript
async loadRelations(
  rows: Array<Record<string, unknown>>,
  withRelations: WithRelation[],
  relations: ReadonlyMap<string, TDbRelation>,
  foreignKeys: ReadonlyMap<string, TDbForeignKey>,
  tableResolver?: TTableResolver
): Promise<void> {
  // Enrich rows in place with related data
  // e.g., use $lookup aggregation stages for MongoDB
  // or JOIN queries for SQL databases
}
```

When `supportsNativeRelations()` returns `false` (the default), the table layer handles relation loading by issuing separate queries per relation and stitching results together in JavaScript.

## Schema Sync Methods

These optional methods enable the schema sync system (`asc db sync`) to introspect, diff, and apply changes to your database. Implement them if you want automatic schema migration support.

### Introspection

- **`getExistingColumns()`** — Return the current table structure as an array of `TExistingColumn` (name, type, nullability, default, PK status). The sync system diffs these against the current Atscript field descriptors.
- **`getExistingColumnsForTable(tableName)`** — Same as above but for an arbitrary table name. Used to inspect a table under its old name before a rename.
- **`tableExists()`** — Return whether the table/collection exists. Used by schema-less adapters (e.g., MongoDB) that skip column introspection.
- **`detectTableOptionDrift()`** — Return `true` if table-level options have changed and the table needs drop+recreate (e.g., MongoDB capped collection size).

### Applying Changes

- **`syncColumns(diff)`** — Apply column-level changes from a computed diff. The diff contains `added`, `renamed`, and `typeChanged` arrays. Execute `ALTER TABLE` statements or equivalent.
- **`recreateTable()`** — Full table recreation with data migration. Used when structural changes cannot be handled by `ALTER TABLE` (e.g., column drops in SQLite). Typical pattern: create temp table, copy data, drop old, rename.
- **`renameTable(oldName)`** — Rename the table from `oldName` to the adapter's current table name.

### Destructive Operations

- **`dropTable()`** — Drop the adapter's own table.
- **`dropTableByName(name)`** — Drop a table by name (for removing tables no longer in the schema).
- **`dropColumns(columns)`** — Drop specific columns from the table.

### Views

- **`ensureView(view)`** — Create or update a database view. Called when the adapter's readable is an `AtscriptDbView`.
- **`dropViewByName(name)`** — Drop a view by name (for removing views no longer in the schema).

### Type Mapping

- **`typeMapper(field)`** — Map a field's metadata to the adapter's native column type string. Receives the full field descriptor (design type, annotations, PK status) for context-aware type decisions (e.g., `VARCHAR(255)` from maxLength, `INTEGER` for numeric PKs in SQLite).

## Validation Plugins

Override `getValidatorPlugins()` to return adapter-specific validation rules that are merged with the built-in Atscript validators:

```typescript
getValidatorPlugins(): TValidatorPlugin[] {
  return [
    {
      // Example: auto-generate ObjectId for _id fields on insert
      name: 'mongo-objectid',
      validate(value, type, path) {
        if (path === '_id' && !value) {
          return { value: new ObjectId(), valid: true }
        }
        return { valid: true }
      },
    },
  ]
}
```

## Index Sync Helper

`BaseDbAdapter` provides `syncIndexesWithDiff()` — a template method that handles the diff algorithm for index synchronization. You provide the three database-specific primitives:

```typescript
async syncIndexes(): Promise<void> {
  await this.syncIndexesWithDiff({
    listExisting: async () => {
      // Return existing indexes as [{ name: string }]
      return this.pool.query('SELECT indexname AS name FROM pg_indexes WHERE ...')
    },
    createIndex: async (index) => {
      // Create a single index — index has key, fields, type ('plain'|'unique')
      const cols = index.fields.map(f => `"${f.name}" ${f.sort}`).join(', ')
      await this.pool.query(`CREATE INDEX "${index.key}" ON ... (${cols})`)
    },
    dropIndex: async (name) => {
      await this.pool.query(`DROP INDEX "${name}"`)
    },
    // Optional: skip index types your DB doesn't support
    shouldSkipType: (type) => type === 'fulltext',
  })
}
```

The helper lists existing indexes, filters to managed ones (those with the `atscript__` prefix), creates missing indexes, and drops stale ones.

## Accessing Table Metadata

Inside your adapter, `this._table` provides access to all computed metadata:

| Property | Description |
|----------|-------------|
| `this._table.tableName` | Resolved table/collection name |
| `this._table.schema` | Database schema (if applicable) |
| `this._table.flatMap` | All fields after flattening (dot-notation paths) |
| `this._table.primaryKeys` | Set of primary key field names |
| `this._table.columnMap` | Logical field name to physical column name mappings |
| `this._table.indexes` | Computed index definitions from `@db.index` annotations |
| `this._table.foreignKeys` | FK definitions from `@db.rel.FK` annotations |
| `this._table.defaults` | Default value configurations from `@db.default` |
| `this._table.fieldDescriptors` | Full field metadata (type, nullability, PK, storage) |
| `this._table.ignoredFields` | Fields excluded from the database via `@db.ignore` |
| `this._table.uniqueProps` | Single-field unique index properties |
| `this._table.isView` | Whether this readable is a view (vs a table) |

The `resolveTableName()` method on the adapter itself returns the full table name, optionally including the schema prefix. Override it for databases that don't support schemas:

```typescript
override resolveTableName(): string {
  return super.resolveTableName(false) // exclude schema prefix
}
```

## Registration

Use your adapter with `DbSpace` to create tables:

```typescript
import { DbSpace } from '@atscript/db'

const db = new DbSpace(() => new PostgresAdapter(pool))

// Create typed tables
const users = db.table(UsersType)
const posts = db.table(PostsType)

// Tables share the adapter factory — each gets its own instance
await users.ensureTable()
await posts.ensureTable()
```

`DbSpace` calls your factory function for each table, so every table gets its own adapter instance. This keeps adapter state (table metadata, cached queries) isolated per table.

## Next Steps

- [SQLite Adapter](./sqlite) — reference implementation for a relational adapter
- [MongoDB Adapter](./mongodb) — advanced implementation with native nested objects, patch operators, and search
- [Schema Sync](./schema-sync) — how the sync system uses adapter methods to manage migrations

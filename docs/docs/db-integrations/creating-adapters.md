---
outline: deep
---

# Creating Adapters

Database adapters implement the bridge between `AtscriptDbTable` and a specific database engine. The `BaseDbAdapter` abstract class from `@atscript/utils-db` defines the contract that every adapter must fulfill.

## Architecture

```
AtscriptDbTable ──delegates CRUD──▶ BaseDbAdapter (abstract)
               ◀──reads metadata──  (via this._table)
```

When you create an `AtscriptDbTable`, it registers itself with the adapter via `registerTable()`. The adapter can then access all table metadata (field descriptors, indexes, column mappings, etc.) through `this._table`.

## Implementing an Adapter

To create a new database adapter, extend `BaseDbAdapter` and implement the abstract methods:

```typescript
import { BaseDbAdapter } from '@atscript/utils-db'
import type {
  TDbInsertResult,
  TDbInsertManyResult,
  TDbUpdateResult,
  TDbDeleteResult,
} from '@atscript/utils-db'
import type { FilterExpr, Uniquery } from '@uniqu/core'

class MyAdapter extends BaseDbAdapter {
  // --- Insert ---
  async insertOne(data: Record<string, unknown>): Promise<TDbInsertResult> {
    // data is already validated, defaults applied, columns mapped
    // Implement database-specific insert logic
  }

  async insertMany(data: Array<Record<string, unknown>>): Promise<TDbInsertManyResult> {
    // Bulk insert
  }

  // --- Read ---
  async findOne(query: Uniquery): Promise<Record<string, unknown> | null> {
    // Use query.filter for WHERE, query.controls for ORDER/LIMIT/SELECT
  }

  async findMany(query: Uniquery): Promise<Array<Record<string, unknown>>> {
    // Use query.filter for WHERE, query.controls for ORDER/LIMIT/SELECT
  }

  async count(query: Uniquery): Promise<number> {
    // Use query.filter for WHERE
  }

  // --- Update ---
  async updateOne(filter: FilterExpr, data: Record<string, unknown>): Promise<TDbUpdateResult> {
    // Update one matching row
  }

  async updateMany(filter: FilterExpr, data: Record<string, unknown>): Promise<TDbUpdateResult> {
    // Update all matching rows
  }

  async replaceOne(filter: FilterExpr, data: Record<string, unknown>): Promise<TDbUpdateResult> {
    // Full replacement of one matching row
  }

  async replaceMany(filter: FilterExpr, data: Record<string, unknown>): Promise<TDbUpdateResult> {
    // Full replacement of all matching rows
  }

  // --- Delete ---
  async deleteOne(filter: FilterExpr): Promise<TDbDeleteResult> {
    // Delete one matching row
  }

  async deleteMany(filter: FilterExpr): Promise<TDbDeleteResult> {
    // Delete all matching rows
  }

  // --- Schema ---
  async syncIndexes(): Promise<void> {
    // Create/drop indexes to match annotations
  }

  async ensureTable(): Promise<void> {
    // Create table if not exists
  }
}
```

### Method Purpose Reference

| Method | When Called | What to Do |
|--------|-----------|------------|
| `insertOne` | After validation, defaults, column mapping | Execute INSERT |
| `insertMany` | After per-item validation + defaults | Execute batch INSERT |
| `findOne` | Query with filter + controls | Execute SELECT ... LIMIT 1 |
| `findMany` | Query with filter + controls | Execute SELECT with sort/limit/skip/select |
| `count` | Count query | Execute COUNT with filter |
| `updateOne` | After validation, with filter for PK | Execute UPDATE ... LIMIT 1 |
| `updateMany` | Bulk update by filter | Execute UPDATE matching filter |
| `replaceOne` | Full replacement by PK filter | Execute REPLACE or DELETE+INSERT |
| `replaceMany` | Bulk replace by filter | Execute bulk REPLACE |
| `deleteOne` | Delete by PK filter | Execute DELETE ... LIMIT 1 |
| `deleteMany` | Bulk delete by filter | Execute DELETE matching filter |
| `ensureTable` | Explicit call by user | Create table/collection DDL |
| `syncIndexes` | Explicit call by user | Diff + create/drop indexes |

::: tip
Data passed to insert/update methods is **already processed** by `AtscriptDbTable` — defaults applied, `@db.ignore` fields stripped, columns mapped. The adapter only needs to translate to its database's query language.
:::

## Adapter Hooks

Adapters can optionally implement hooks that are called during metadata scanning:

```typescript
class MyAdapter extends BaseDbAdapter {
  // Called before the table starts scanning fields
  onBeforeFlatten(type: TAtscriptAnnotatedType): void {
    // Pre-process the root type (e.g., inject synthetic fields)
  }

  // Called for each field during scanning
  onFieldScanned(field: string, type: TAtscriptAnnotatedType, metadata: TMetadataMap): void {
    // Process adapter-specific annotations on each field
  }

  // Called after all fields are scanned
  onAfterFlatten(): void {
    // Post-process metadata (e.g., set adapter-specific primary keys)
  }

  // Override the table name derived from @db.table
  getAdapterTableName(type: TAtscriptAnnotatedType): string | undefined {
    // Return a custom table name or undefined to use the default
  }
}
```

### Hook Use Cases

| Hook | Purpose | Example |
|------|---------|---------|
| `onBeforeFlatten` | Pre-process the type before scanning | MongoDB: read `@db.mongo.search.dynamic` from type metadata |
| `onFieldScanned` | Process adapter-specific annotations per field | MongoDB: detect `@db.default.fn 'increment'`, register search fields |
| `onAfterFlatten` | Post-process after all fields are known | MongoDB: hardcode `_id` as primary key, associate vector filters |
| `getAdapterTableName` | Override table name resolution | Return `undefined` to use the generic `@db.table` name |

## ID Preparation

Adapters can transform primary key values before they're used in queries:

```typescript
class MongoAdapter extends BaseDbAdapter {
  prepareId(id: unknown, fieldType: TAtscriptAnnotatedType): unknown {
    // Convert string IDs to ObjectId, parse UUIDs, etc.
    return new ObjectId(id as string)
  }
}
```

This is called by `findById()` when converting user-provided ID strings into the database's native format.

## Native Patch Support

If your database supports native array patch operations (like MongoDB's `$push`, `$pull`), implement these methods:

```typescript
class MongoAdapter extends BaseDbAdapter {
  supportsNativePatch(): boolean {
    return true
  }

  async nativePatch(filter: FilterExpr, patch: unknown): Promise<TDbUpdateResult> {
    // Convert patch operators to database-native operations
  }
}
```

When `supportsNativePatch()` returns `false` (the default), `AtscriptDbTable` uses `decomposePatch()` to flatten patch operations into standard update calls.

## Nested Object Support

If your database handles nested objects natively (like MongoDB with embedded documents), override `supportsNestedObjects()`:

```typescript
class MongoAdapter extends BaseDbAdapter {
  supportsNestedObjects(): boolean {
    return true
  }
}
```

When `supportsNestedObjects()` returns `true`:
- Nested objects are passed through as-is (no flattening into `__`-separated columns)
- `@db.json` is ignored (the adapter handles all storage decisions)
- Read results are returned as-is (no reconstruction)
- Index field names use dot-notation paths directly

When it returns `false` (the default), the generic `AtscriptDbTable` layer handles all flattening, reconstruction, and query translation. Adapters receive pre-flattened data with physical column names — they never need to know about logical dot-notation paths.

## Schema Sync Methods

Adapters can implement schema synchronization methods to support automatic table migration when `.as` definitions change. These methods are used by the schema sync system to introspect, diff, and apply changes to the underlying database.

### `getExistingColumns()`

Introspects the database table and returns information about its current columns. This is the foundation for schema diffing — the sync system compares existing columns against the current Atscript field descriptors to determine what has changed.

```typescript
class MyAdapter extends BaseDbAdapter {
  async getExistingColumns(): Promise<TColumnInfo[]> {
    // Query the database's information schema or equivalent
    // Return column names, types, nullability, defaults, etc.
  }
}
```

### `syncColumns(diff)`

Applies column-level changes to the table based on a computed diff. This handles adding new columns, changing column types, and updating defaults via `ALTER TABLE` statements (or equivalent).

```typescript
class MyAdapter extends BaseDbAdapter {
  async syncColumns(diff: TColumnDiff): Promise<void> {
    // Apply ALTER TABLE ADD COLUMN for new fields
    // Apply ALTER TABLE ALTER COLUMN for type changes
  }
}
```

### `recreateTable()`

Performs a lossless table recreation when `ALTER TABLE` is insufficient (e.g., SQLite does not support dropping columns via ALTER). This typically involves creating a new table, copying data, dropping the old table, and renaming.

```typescript
class MyAdapter extends BaseDbAdapter {
  async recreateTable(): Promise<void> {
    // 1. CREATE TABLE _new with updated schema
    // 2. INSERT INTO _new SELECT ... FROM old
    // 3. DROP TABLE old
    // 4. ALTER TABLE _new RENAME TO old
  }
}
```

### `dropTable()` / `dropColumns()`

Destructive operations for removing tables or columns. These are separated from `syncColumns()` because they require explicit opt-in due to data loss.

```typescript
class MyAdapter extends BaseDbAdapter {
  async dropTable(): Promise<void> {
    // DROP TABLE
  }

  async dropColumns(columns: string[]): Promise<void> {
    // ALTER TABLE DROP COLUMN (if supported)
    // or recreateTable() without the dropped columns
  }
}
```

### `renameTable(oldName)`

Renames a table when the `@db.table` annotation value changes. The sync system detects the rename by comparing the previous table name with the current one.

```typescript
class MyAdapter extends BaseDbAdapter {
  async renameTable(oldName: string): Promise<void> {
    // ALTER TABLE oldName RENAME TO newName
  }
}
```

### `syncForeignKeys()`

Optional method for adapters that support foreign key constraints. Synchronizes FK definitions with the database, adding new constraints and dropping stale ones.

```typescript
class MyAdapter extends BaseDbAdapter {
  async syncForeignKeys(): Promise<void> {
    // Diff declared @db.rel.* annotations against existing FK constraints
    // Add missing FKs, drop stale ones
  }
}
```

Not all databases support foreign keys (e.g., MongoDB does not). Adapters that do not support FKs can omit this method.

## Native Relations Support

Adapters can declare whether they support native relation loading (e.g., SQL JOINs) by implementing `supportsNativeRelations()`:

```typescript
class MyAdapter extends BaseDbAdapter {
  supportsNativeRelations(): boolean {
    return true
  }
}
```

When `supportsNativeRelations()` returns `true`, the adapter should also implement `loadRelations()` to perform native JOINs or equivalent operations:

```typescript
class MyAdapter extends BaseDbAdapter {
  supportsNativeRelations(): boolean {
    return true
  }

  async loadRelations(
    data: Record<string, unknown>[],
    relations: TRelationRequest[]
  ): Promise<void> {
    // Use JOINs or subqueries to load related data
    // Attach results to each record in the data array
  }
}
```

When `supportsNativeRelations()` returns `false` (the default), `AtscriptDbTable` handles relation loading by issuing separate queries for each relation and stitching results together in JavaScript. This works with any adapter but may be less efficient for databases that support JOINs natively.

## Validator Plugins

Adapters can inject custom validation plugins:

```typescript
class MongoAdapter extends BaseDbAdapter {
  override getValidatorPlugins(): TValidatorPlugin[] {
    return [validateMongoIdPlugin]
  }

  override buildInsertValidator(table: AtscriptDbTable): Validator {
    // Custom insert validator — e.g., make ObjectId PKs optional
    return table.createValidator({
      plugins: this.getValidatorPlugins(),
      replace: (type, path) => {
        if (path === '_id') return { ...type, optional: true }
        return type
      },
    })
  }
}
```

## Index Sync Helper

`BaseDbAdapter` provides a `syncIndexesWithDiff()` helper for implementing `syncIndexes()`:

```typescript
class MyAdapter extends BaseDbAdapter {
  async syncIndexes(): Promise<void> {
    await this.syncIndexesWithDiff({
      async listExisting() {
        // Return existing indexes from the database
        return [{ name: 'atscript__plain__email' }]
      },
      async createIndex(index) {
        // Create a single index in the database
      },
      async dropIndex(name) {
        // Drop a single index from the database
      },
      prefix: 'atscript__',  // Only manage indexes with this prefix
      shouldSkipType(type) {
        // Skip unsupported index types (e.g., fulltext for SQLite)
        return type === 'fulltext'
      },
    })
  }
}
```

This helper computes the diff between declared indexes and existing indexes, then creates missing ones and drops stale ones.

## Accessing Table Metadata

Inside your adapter, `this._table` gives access to all metadata:

```typescript
class MyAdapter extends BaseDbAdapter {
  async ensureTable(): Promise<void> {
    const tableName = this._table.tableName
    const schema = this._table.schema
    const fields = this._table.fieldDescriptors
    const primaryKeys = this._table.primaryKeys

    // Build CREATE TABLE from field descriptors
    for (const field of fields) {
      // field.path, field.physicalName, field.designType,
      // field.optional, field.isPrimaryKey, field.ignored,
      // field.defaultValue, field.storage, field.flattenedFrom
    }
  }
}
```

## Accessing the Adapter

Use `table.getAdapter()` to access the underlying adapter for database-specific operations that go beyond the generic CRUD interface:

```typescript
const adapter = table.getAdapter() as MongoAdapter

// Access the raw MongoDB collection
const collection = adapter.collection
await collection.bulkWrite([...])

// Run an aggregation pipeline
const cursor = adapter.collection.aggregate([
  { $match: { completed: true } },
  { $group: { _id: null, count: { $sum: 1 } } },
])
```

This is the recommended way to perform native operations — the adapter exposes all database-specific methods and properties directly.

## Available Adapters

| Adapter | Package | Database |
|---------|---------|----------|
| `SqliteAdapter` | `@atscript/db-sqlite` | SQLite (via better-sqlite3 or node:sqlite) |
| `MongoAdapter` | `@atscript/mongo` | MongoDB |

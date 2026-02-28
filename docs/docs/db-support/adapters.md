# Database Adapters

::: warning Experimental
DB Integrations are experimental. APIs may change at any moment.
:::

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
  TDbFilter,
  TDbFindOptions,
  TDbInsertResult,
  TDbInsertManyResult,
  TDbUpdateResult,
  TDbDeleteResult,
} from '@atscript/utils-db'

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
  async findOne(filter: TDbFilter, options?: TDbFindOptions): Promise<Record<string, unknown> | null> {
    // Convert filter to database query, return one row or null
  }

  async findMany(filter: TDbFilter, options?: TDbFindOptions): Promise<Array<Record<string, unknown>>> {
    // Convert filter to database query, return matching rows
  }

  async count(filter: TDbFilter): Promise<number> {
    // Return count of matching rows
  }

  // --- Update ---
  async updateOne(filter: TDbFilter, data: Record<string, unknown>): Promise<TDbUpdateResult> {
    // Update one matching row
  }

  async updateMany(filter: TDbFilter, data: Record<string, unknown>): Promise<TDbUpdateResult> {
    // Update all matching rows
  }

  async replaceOne(filter: TDbFilter, data: Record<string, unknown>): Promise<TDbUpdateResult> {
    // Full replacement of one matching row
  }

  async replaceMany(filter: TDbFilter, data: Record<string, unknown>): Promise<TDbUpdateResult> {
    // Full replacement of all matching rows
  }

  // --- Delete ---
  async deleteOne(filter: TDbFilter): Promise<TDbDeleteResult> {
    // Delete one matching row
  }

  async deleteMany(filter: TDbFilter): Promise<TDbDeleteResult> {
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
    // Post-process metadata
  }

  // Override the table name derived from @db.table
  getAdapterTableName(type: TAtscriptAnnotatedType): string | undefined {
    // Return a custom table name or undefined to use the default
  }
}
```

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

## Native Patch Support

If your database supports native array patch operations (like MongoDB's `$push`, `$pull`), implement these methods:

```typescript
class MongoAdapter extends BaseDbAdapter {
  supportsNativePatch(): boolean {
    return true
  }

  async nativePatch(filter: TDbFilter, patch: unknown): Promise<TDbUpdateResult> {
    // Convert patch operators to database-native operations
  }
}
```

When `supportsNativePatch()` returns `false` (the default), `AtscriptDbTable` uses `decomposePatch()` to flatten patch operations into standard update calls.

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
      // field.defaultValue
    }
  }
}
```

## Available Adapters

| Adapter | Package | Database |
|---------|---------|----------|
| `SqliteAdapter` | `@atscript/db-sqlite` | SQLite (via better-sqlite3 or node:sqlite) |

# DB Tables

::: warning Experimental
DB Integrations are experimental. APIs may change at any moment.
:::

`AtscriptDbTable` is the main entry point for database operations. It reads `@db.*` annotations from an Atscript type and provides a full CRUD interface with validation, column mapping, defaults, and index management.

## Creating a Table

```typescript
import { AtscriptDbTable } from '@atscript/utils-db'
import { SqliteAdapter } from '@atscript/db-sqlite'
import { BetterSqlite3Driver } from '@atscript/db-sqlite'
import UserMeta from './user.as.js'

const driver = new BetterSqlite3Driver('myapp.db')
const adapter = new SqliteAdapter(driver)
const users = new AtscriptDbTable(UserMeta, adapter)
```

The constructor takes two arguments:

1. **Type metadata** — The runtime metadata exported from a compiled `.as.js` file
2. **Adapter** — A `BaseDbAdapter` implementation for your database

## Schema Operations

### `ensureTable()`

Creates the database table if it doesn't exist, using field descriptors derived from annotations.

```typescript
await users.ensureTable()
```

### `syncIndexes()`

Synchronizes indexes defined in annotations with the database. Creates missing indexes and drops stale ones (those prefixed with `atscript__` that no longer match the schema).

```typescript
await users.syncIndexes()
```

## CRUD Operations

### Insert

```typescript
// Single insert
const result = await users.insertOne({
  id: 1,
  email: 'alice@example.com',
  name: 'Alice',
})
// → { insertedId: 1 }

// Bulk insert
const bulkResult = await users.insertMany([
  { id: 1, email: 'alice@example.com', name: 'Alice' },
  { id: 2, email: 'bob@example.com', name: 'Bob' },
])
// → { insertedCount: 2, insertedIds: [1, 2] }
```

Before inserting, `AtscriptDbTable`:
1. Applies default values (`@db.default.value` / `@db.default.fn`)
2. Validates the payload against the Atscript type
3. Strips `@db.ignore` fields
4. Maps logical field names to physical column names (`@db.column`)

### Find

```typescript
// Find one
const user = await users.findOne({ email: 'alice@example.com' })

// Find many with options
const activeUsers = await users.findMany(
  { status: 'active' },
  {
    sort: { name: 1 },    // ascending
    limit: 10,
    skip: 20,
    projection: ['id', 'name', 'email'],
  }
)

// Count
const total = await users.count({ status: 'active' })
```

See [Queries & Filters](./queries) for the full filter syntax.

### Update

```typescript
// Update by primary key (partial update)
await users.updateOne({ id: 1, status: 'inactive' })

// Update many by filter
await users.updateMany(
  { status: 'pending' },
  { status: 'active' }
)
```

`updateOne` extracts the primary key from the payload to build the filter, then applies only the remaining fields as updates.

### Replace

```typescript
// Replace one (full document replacement by primary key)
await users.replaceOne({
  id: 1,
  email: 'alice@newdomain.com',
  name: 'Alice',
  status: 'active',
})

// Replace many by filter
await users.replaceMany(
  { status: 'old' },
  { status: 'migrated' }
)
```

### Delete

```typescript
// Delete by primary key
await users.deleteOne({ id: 1 })

// Delete many by filter
await users.deleteMany({ status: 'deleted' })
```

## Metadata Access

`AtscriptDbTable` exposes computed metadata from annotations:

```typescript
// Table name from @db.table
users.tableName // → 'users'

// Schema from @db.schema (if set)
users.schema // → 'auth' or undefined

// Primary key fields from @db.id
users.primaryKeys // → ['id']

// Column mappings from @db.column
users.columnMap // → Map { 'email' → 'email_address' }

// Default values from @db.default.*
users.defaults // → Map { 'status' → { kind: 'value', value: 'active' } }

// Ignored fields from @db.ignore
users.ignoredFields // → Set { 'displayName' }

// Fields with unique indexes
users.uniqueProps // → Set { 'email' }

// Index definitions
users.indexes // → Map of index key → TDbIndex

// Full field descriptors
users.fieldDescriptors // → Array of TDbFieldMeta
```

All metadata is lazily computed on first access and cached.

## Validation

`AtscriptDbTable` validates payloads against the Atscript type before write operations. Validators are purpose-specific:

- **insert** — Validates all required fields (primary keys are optional since they may be auto-generated)
- **update** — Validates partial payloads
- **patch** — Validates partial payloads with array patch operators

```typescript
// Create a standalone validator (without adapter-specific plugins)
const validator = users.createValidator()
const errors = validator.validate(payload)

// Get the purpose-specific validator (includes adapter plugins)
const insertValidator = users.getValidator('insert')
```

## Extending AtscriptDbTable

`AtscriptDbTable` is a concrete class that can be extended for cross-cutting concerns:

```typescript
class AuditedTable<T> extends AtscriptDbTable<T> {
  async insertOne(payload: T) {
    // Add audit fields
    const audited = {
      ...payload,
      createdAt: Date.now(),
      createdBy: getCurrentUser(),
    }
    return super.insertOne(audited)
  }
}
```

Common extensions:
- **Audit logging** — Add timestamps and user tracking
- **Soft deletes** — Override `deleteOne` to set a `deletedAt` field
- **Permissions** — Check access before operations
- **Caching** — Cache query results

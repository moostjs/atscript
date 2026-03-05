# DB Tables

::: warning Experimental
DB Adapters are experimental. APIs may change at any moment.
:::

`AtscriptDbTable` is the main entry point for database operations. It reads `@db.*` annotations from an Atscript type and provides a full CRUD interface with validation, column mapping, defaults, and index management.

## Creating a Table

```typescript
import { AtscriptDbTable } from '@atscript/utils-db'
import { SqliteAdapter, BetterSqlite3Driver } from '@atscript/db-sqlite'
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
5. Flattens nested objects into `__`-separated columns (see [Embedded Objects](#embedded-objects))

### Find

Read operations accept a `Uniquery` object with `filter` and `controls`:

```typescript
// Find one
const user = await users.findOne({
  filter: { email: 'alice@example.com' },
  controls: {},
})

// Find many with controls
const activeUsers = await users.findMany({
  filter: { status: 'active' },
  controls: {
    $sort: { name: 1 },    // ascending
    $limit: 10,
    $skip: 20,
    $select: ['id', 'name', 'email'],
  },
})

// Count
const total = await users.count({
  filter: { status: 'active' },
  controls: {},
})
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

## Embedded Objects

Atscript interfaces can contain nested object fields — either inline (`contact: { email: string }`) or named embedded types (`address: Address` where `Address` has no `@db.table`). The DB layer automatically handles these based on the adapter.

### Flatten by Default

For relational databases (SQLite, PostgreSQL), nested objects are **flattened** into separate columns using `__` (double underscore) as the path separator:

```atscript
@db.table 'users'
export interface User {
    @meta.id
    id: number
    name: string

    // Flattened → columns: contact__email, contact__phone
    contact: {
        email: string
        phone?: string
    }

    // Deep nesting → columns: settings__notifications__email, settings__notifications__sms
    settings: {
        notifications: {
            email: boolean
            sms: boolean
        }
    }
}
```

The parent object field (`contact`, `settings`) does **not** get a column — only leaf scalars produce columns.

### JSON Storage

Use `@db.json` to store a nested object as a single JSON column instead of flattening:

```atscript
@db.table 'users'
export interface User {
    @meta.id
    id: number

    // Single JSON column "preferences"
    @db.json
    preferences: {
        theme: string
        lang: string
    }

    // Arrays are always stored as JSON
    tags: string[]
}
```

See [`@db.json`](./annotations#db-json) for details.

### Transparent Read/Write

The mapping is automatic — write nested JavaScript objects and read them back. `AtscriptDbTable` handles flattening on write and reconstruction on read:

```typescript
// Insert with nested objects — automatically flattened
await users.insertOne({
  id: 1,
  name: 'Alice',
  contact: { email: 'alice@example.com', phone: '555-0100' },
  preferences: { theme: 'dark', lang: 'en' },
  tags: ['admin'],
  settings: { notifications: { email: true, sms: false } },
})

// Read back — automatically reconstructed
const user = await users.findOne({ filter: { id: 1 }, controls: {} })
// user.contact → { email: 'alice@example.com', phone: '555-0100' }
// user.preferences → { theme: 'dark', lang: 'en' }
// user.tags → ['admin']
```

### Querying Nested Fields

Use dot-notation to filter and sort by nested paths:

```typescript
// Filter by nested field
await users.findMany({
  filter: { 'contact.email': 'alice@example.com' },
  controls: {},
})

// Sort by nested field
await users.findMany({
  filter: {},
  controls: { $sort: { 'contact.phone': 1 } },
})
```

Dot-notation paths are automatically translated to physical column names (`contact.email` → `contact__email`). See [Queries — Nested Fields](./queries#nested-fields) for details.

### Selecting Parent Paths

When using `$select` with a parent object path, the generic layer automatically expands it to all leaf columns:

```typescript
// Select a parent path — expands to all nested leaf fields
await users.findMany({
  filter: {},
  controls: { $select: ['id', 'contact'] },
})
// Equivalent to: $select: ['id', 'contact__email', 'contact__phone']
```

This works with both array and object forms of `$select`. Sorting by a parent path is silently ignored for relational DBs since it has no meaningful column to sort by.

See [Queries — Projection](./queries#projection) for more details.

### Annotations on Nested Fields

Most `@db.*` annotations work on nested fields:

- **`@db.index.*`** — indexes reference the physical `__`-separated column
- **`@db.column`** — overrides the auto-generated `__` name for a specific sub-field
- **`@db.ignore`** — excludes a sub-field (or entire parent and all children)
- **`@db.default.*`** — applies to the individual flattened column

### Adapter Behavior

Adapters that handle nested objects natively (like MongoDB) skip flattening entirely — nested objects are passed through as-is. The `supportsNestedObjects()` hook on the adapter controls this. See [Adapters — Nested Object Support](./creating-adapters#nested-object-support).

## Metadata Access

`AtscriptDbTable` exposes computed metadata from annotations:

```typescript
// Table name from @db.table
users.tableName // → 'users'

// Schema from @db.schema (if set)
users.schema // → 'auth' or undefined

// Primary key fields from @meta.id
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

// Path mapping for nested objects (logical dot-path → physical column name)
users.pathToPhysical // → ReadonlyMap { 'contact.email' → 'contact__email', ... }
users.physicalToPath // → ReadonlyMap { 'contact__email' → 'contact.email', ... }
```

All metadata is lazily computed on first access and cached.

### Type-Safe Dot-Notation Paths (`__flat`)

Interfaces annotated with `@db.table` get a `__flat` static property in the generated `.d.ts` file. It maps all dot-notation paths to their TypeScript value types, enabling autocomplete for filter and select operations:

```typescript
// Generated .d.ts:
declare class User {
  id: number
  name: string
  contact: { email: string; phone?: string }
  static __flat: {
    "id": number
    "name": string
    "contact": never           // intermediate — not directly queryable
    "contact.email": string
    "contact.phone"?: string
  }
}
```

Key rules:
- **Intermediate paths** (parent objects, arrays of objects) are typed as `never` — they appear in autocomplete for `$select` and `$exists` but prevent meaningless `$eq` comparisons
- **`@db.json` fields** are typed as `string` — they are stored as serialized JSON in the database
- **Only `@db.table` interfaces** get `__flat` — other interfaces are unaffected

Use the `FlatOf<T>` utility type to extract the flat type from an annotated type:

```typescript
import type { FlatOf } from '@atscript/utils-db'

type UserFlat = FlatOf<typeof User>
// → { id: number; name: string; contact: never; "contact.email": string; ... }
```

`AtscriptDbTable` uses `FlatOf<T>` as the type parameter for `findOne`, `findMany`, `count`, `updateMany`, `replaceMany`, and `deleteMany` — giving you autocomplete on filter keys and select paths.

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

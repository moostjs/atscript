---
outline: deep
---

# CRUD Operations

<!--@include: ./_experimental-warning.md-->

Atscript's DB layer provides a type-safe API for creating, reading, updating, and deleting records. All operations go through `AtscriptDbTable`, which handles validation, default values, nested object flattening, and adapter translation automatically.

## Setting Up

`DbSpace` is the entry point for all database operations. It manages adapter lifecycle, table instances, and cross-table discovery for relations.

```typescript
import { DbSpace } from '@atscript/db'
import { SqliteAdapter, BetterSqlite3Driver } from '@atscript/db-sqlite'

const driver = new BetterSqlite3Driver('./myapp.db')
const db = new DbSpace(() => new SqliteAdapter(driver))
```

Then get typed table instances by passing your compiled `.as` types:

```typescript
import { User } from './schema/user.as'

const users = db.getTable(User)
```

For views, use `db.getView(ViewType)` instead.

## Schema Setup

Before performing any operations, ensure the table exists in the database:

```typescript
await users.ensureTable()
await users.syncIndexes()
```

This creates the table if it doesn't exist and synchronizes index definitions from your `.as` file. For production workflows, use `npx asc db sync` to propagate all schema changes across every table at once. See [Schema Sync](./schema-sync).

## Inserting Records

### Insert One

Insert a single record and get back the generated primary key:

```typescript
const result = await users.insertOne({
  email: 'alice@example.com',
  name: 'Alice',
  status: 'active',
})
// result: { insertedId: 1 }
```

Fields with `@db.default` or generated defaults (`@db.default.increment`, `@db.default.uuid`, `@db.default.now`) are applied automatically --- you can omit them from the input.

### Insert Many

Insert multiple records in a single transaction:

```typescript
const result = await users.insertMany([
  { email: 'alice@example.com', name: 'Alice' },
  { email: 'bob@example.com', name: 'Bob' },
  { email: 'charlie@example.com', name: 'Charlie' },
])
// result: { insertedCount: 3, insertedIds: [1, 2, 3] }
```

::: info
Nested relation creation (inserting related records across foreign keys) is covered in [Deep Operations](./deep-operations).
:::

## Reading Records

### Find by ID

Look up a single record by primary key:

```typescript
const user = await users.findById(1)
// Returns the record or null
```

### Find One

Return the first record matching a filter:

```typescript
const user = await users.findOne({
  filter: { email: 'alice@example.com' },
})
// Returns the first match or null
```

### Find Many

Return all records matching a filter, with optional sorting and pagination:

```typescript
const active = await users.findMany({
  filter: { status: 'active' },
  controls: {
    $sort: { name: 1 },
    $limit: 10,
    $skip: 0,
  },
})
```

### Count

Count matching records without fetching data:

```typescript
const total = await users.count({
  filter: { status: 'active' },
})
```

For a full reference on filter operators (`$gt`, `$in`, `$regex`, etc.) and controls (`$sort`, `$select`, `$limit`), see [Queries & Filters](./queries).

## Updating Records

### Update One

Partially update a record by primary key. Only the fields you provide are changed:

```typescript
const result = await users.updateOne({
  id: 1,
  name: 'Alice Smith',
})
// result: { matchedCount: 1, modifiedCount: 1 }
```

The primary key field(s) must be included to identify the record.

### Update Many

Update all records matching a filter:

```typescript
const result = await users.updateMany(
  { status: 'inactive' },   // filter
  { status: 'archived' },   // data to set
)
// result: { matchedCount: 5, modifiedCount: 5 }
```

::: info
Array-level patch operators (`$push`, `$pull`, `$set`, etc.) are covered in [Patch Operations](./patch-operations).
:::

## Replacing Records

### Replace One

Replace an entire record by primary key. Unlike `updateOne`, **all fields must be provided** --- missing fields are not preserved:

```typescript
const result = await users.replaceOne({
  id: 1,
  email: 'alice.new@example.com',
  name: 'Alice Smith',
  status: 'active',
})
```

::: tip Replace vs. Update
- **`updateOne`** --- sends only the fields you want to change (partial)
- **`replaceOne`** --- replaces the entire record with new data (full)
:::

## Deleting Records

### Delete One

Delete a single record by primary key:

```typescript
const result = await users.deleteOne(1)
// result: { deletedCount: 1 }
```

### Delete Many

Delete all records matching a filter:

```typescript
const result = await users.deleteMany({
  status: 'archived',
})
// result: { deletedCount: 12 }
```

::: info
Cascade and set-null behaviors on delete are configured via `@db.rel.onDelete` in your `.as` schema. See [Relations](./relations) for details.
:::

## Validation

Tables automatically validate data on every write operation using the constraints from your `.as` definitions (`@expect.*` annotations). If validation fails, a `ValidatorError` is thrown with detailed error information.

You can also access validators directly for manual checks:

```typescript
const validator = users.getValidator('insert')
if (!validator.validate(data, true)) {
  // safe = true → returns false instead of throwing
  console.log(validator.errors)
  // [{ path: 'email', message: 'Required field' }, ...]
}
```

When called without `safe = true`, `validate()` throws a `ValidatorError` on failure. Available validator purposes: `'insert'`, `'update'`, `'patch'`, `'bulkReplace'`, `'bulkUpdate'`.

## Error Handling

Database operations throw `DbError` with a `code` property indicating the error type:

| Code | Meaning |
|------|---------|
| `CONFLICT` | Unique constraint violation |
| `FK_VIOLATION` | Foreign key constraint violated |
| `NOT_FOUND` | Record not found |

Handle errors by checking the code:

```typescript
import { DbError } from '@atscript/db'

try {
  await users.insertOne({ email: 'alice@example.com', name: 'Alice' })
} catch (err) {
  if (err instanceof DbError) {
    switch (err.code) {
      case 'CONFLICT':
        console.log('Email already exists:', err.errors)
        break
      case 'FK_VIOLATION':
        console.log('Referenced record missing:', err.errors)
        break
    }
  }
}
```

Each error includes an `errors` array with `{ path, message }` entries for detailed diagnostics.

### Error Paths in Nested Data

When validation fails inside nested or array payloads, error paths use dot notation to pinpoint the exact location:

| Context | Example path | Meaning |
|---------|-------------|---------|
| Top-level field | `"title"` | The `title` field failed validation |
| TO navigation | `"project.title"` | The `title` field inside inline `project` data |
| FROM array element | `"comments.0.body"` | The `body` field of the first comment in the array |
| Deep nesting | `"tasks.2.project.title"` | The `title` of the project in the third task |

This makes it straightforward to map errors back to specific fields in complex nested payloads — useful for building form validation UIs.

## Next Steps

- [Queries & Filters](./queries) --- Advanced filtering, sorting, and projection
- [Relations](./relations) --- Foreign keys and navigation queries
- [Patch Operations](./patch-operations) --- Array-level update operators

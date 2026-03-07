---
outline: deep
---

# CRUD Operations

All data operations go through `AtscriptDbTable` — a type-safe wrapper around your database adapter.

## Getting a Table Instance

Use `DbSpace` to create table instances. It manages adapter lifecycle and enables cross-table discovery for relations:

```typescript
import { DbSpace } from '@atscript/utils-db'
import { SqliteAdapter, BetterSqlite3Driver } from '@atscript/db-sqlite'
import { User } from './schema/user.as'
import { Project } from './schema/project.as'

const driver = new BetterSqlite3Driver('./myapp.db')
const db = new DbSpace(() => new SqliteAdapter(driver))

const users = db.getTable(User)
const projects = db.getTable(Project)
```

For views, use `getView()`:

```typescript
import { ActiveTask } from './schema/active-task.as'

const activeTasks = db.getView(ActiveTask)
```

## Insert

### Insert One

```typescript
const result = await users.insertOne({
  email: 'alice@example.com',
  name: 'Alice',
})
// result: { insertedId: 1 }
```

Fields with `@db.default` or `@db.default.fn` are optional — they're filled in automatically.

### Insert Many

```typescript
const result = await users.insertMany([
  { email: 'alice@example.com', name: 'Alice' },
  { email: 'bob@example.com', name: 'Bob' },
])
// result: { insertedCount: 2, insertedIds: [1, 2] }
```

Batch inserts run within a single transaction.

## Find

### Find Many

```typescript
const users = await userTable.findMany({
  filter: { status: 'active' },
  controls: {
    $sort: { createdAt: -1 },
    $limit: 10,
    $skip: 0,
  },
})
```

### Find One

```typescript
const user = await userTable.findOne({
  filter: { email: 'alice@example.com' },
})
// Returns the first match or null
```

### Find by ID

```typescript
const user = await userTable.findById(1)
// Looks up by primary key
```

For tables with `@db.index.unique`, `findById` also accepts the unique field value:

```typescript
const user = await userTable.findById('alice@example.com')
// Finds by unique email index
```

### Find with Count

Get results and total count in one call (useful for pagination):

```typescript
const { data, count } = await userTable.findManyWithCount({
  filter: { status: 'active' },
  controls: { $limit: 10 },
})
// data: User[], count: total matching records
```

### Count

```typescript
const total = await userTable.count({
  filter: { status: 'active' },
})
```

## Update

### Update One

Partially update a record by primary key:

```typescript
const result = await userTable.updateOne({
  id: 1,
  name: 'Alice Smith',
})
// result: { matchedCount: 1, modifiedCount: 1 }
```

The primary key field(s) must be included to identify the record.

### Update Many

Update all matching records:

```typescript
const result = await userTable.updateMany(
  { status: 'inactive' },          // filter
  { status: 'archived' },          // data to set
)
// result: { matchedCount: 5, modifiedCount: 5 }
```

## Replace

Replace an entire record (all fields must be provided):

```typescript
const result = await userTable.replaceOne({
  id: 1,
  email: 'alice.new@example.com',
  name: 'Alice Smith',
  status: 'active',
})
```

::: tip Replace vs. Update
- **`updateOne`** — sends only the fields you want to change
- **`replaceOne`** — replaces the entire record with new data
:::

## Delete

### Delete One

Delete by primary key:

```typescript
const result = await userTable.deleteOne(1)
// result: { deletedCount: 1 }
```

### Delete Many

Delete all matching records:

```typescript
const result = await userTable.deleteMany({
  status: 'archived',
})
// result: { deletedCount: 12 }
```

## Full-Text Search

If your table has `@db.index.fulltext` fields:

```typescript
const results = await userTable.search('alice', {
  filter: { status: 'active' },
  controls: { $limit: 10 },
})
```

With count:

```typescript
const { data, count } = await userTable.searchWithCount('alice', {
  controls: { $limit: 10 },
})
```

## Schema Operations

::: tip Recommended: CLI Schema Sync
For most workflows, use `npx asc db sync` to propagate all schema changes at once. See [Schema Sync](./schema-sync). The methods below are available for programmatic use.
:::

### Create Table

Create the table if it doesn't exist:

```typescript
await userTable.ensureTable()
```

### Sync Indexes

Sync index definitions from your `.as` file with the database:

```typescript
await userTable.syncIndexes()
```

## Validation

Tables automatically validate data on insert and update using the constraints from your `.as` definitions (`@expect.*` annotations).

You can also access validators directly:

```typescript
const validator = userTable.getValidator('insert')
const result = validator.validate(data)
if (!result.valid) {
  console.log(result.errors)
}
```

## Next Steps

- [Queries & Filters](./queries) — Advanced filtering, sorting, and projection
- [Patch Operations](./patch-operations) — Array-level update operators
- [Deep Operations](./deep-operations) — Nested inserts and updates across relations

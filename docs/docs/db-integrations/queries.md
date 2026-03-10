---
outline: deep
---

# Queries & Filters

<!--@include: ./_experimental-warning.md-->

Every query in Atscript's DB layer follows the same shape: a **filter** that selects which records to return, and a **controls** object that determines how they come back (sorting, pagination, projection, relations). This syntax is consistent across all adapters — SQLite, MongoDB, and any future adapter.

```typescript
const results = await table.findMany({
  filter: { /* which records */ },
  controls: { /* how to return them */ },
})
```

## Filter Syntax

Filters use a MongoDB-inspired expression language. At its simplest, you pass an object whose keys are field names and whose values are the conditions to match.

### Equality

The most common filter is a direct equality check:

```typescript
// Shorthand — value is the match target
{ filter: { status: 'active' } }

// Explicit operator form
{ filter: { status: { $eq: 'active' } } }
```

Multiple fields in the same object are combined with AND:

```typescript
{ filter: { status: 'active', role: 'admin' } }
// WHERE status = 'active' AND role = 'admin'
```

### Not Equal

```typescript
{ filter: { status: { $ne: 'done' } } }
// WHERE status != 'done'
```

### Comparisons

```typescript
{ filter: { age: { $gt: 18 } } }       // greater than
{ filter: { age: { $gte: 18 } } }      // greater than or equal
{ filter: { age: { $lt: 65 } } }       // less than
{ filter: { age: { $lte: 65 } } }      // less than or equal
```

### Set Operators

Check whether a value belongs (or does not belong) to a set:

```typescript
{ filter: { role: { $in: ['admin', 'editor'] } } }
// WHERE role IN ('admin', 'editor')

{ filter: { status: { $nin: ['archived', 'deleted'] } } }
// WHERE status NOT IN ('archived', 'deleted')
```

### Pattern Matching

```typescript
{ filter: { name: { $regex: '^Al' } } }
// SQLite: WHERE name LIKE 'Al%'
// MongoDB: WHERE name matches /^Al/
```

### Existence

Test whether a field is present (non-null) or absent (null):

```typescript
{ filter: { email: { $exists: true } } }   // WHERE email IS NOT NULL
{ filter: { email: { $exists: false } } }   // WHERE email IS NULL
```

### Null Values

You can also filter for null directly:

```typescript
{ filter: { assigneeId: null } }
// WHERE assigneeId IS NULL
```

## Logical Operators

### Implicit AND

When you put multiple fields in a single filter object, they are ANDed together automatically:

```typescript
{ filter: { status: 'active', role: 'admin' } }
```

### Explicit AND

Use `$and` when you need multiple conditions on the same field, or just prefer being explicit:

```typescript
{ filter: { $and: [
  { age: { $gte: 18 } },
  { age: { $lt: 65 } },
] } }
```

### OR

```typescript
{ filter: { $or: [
  { status: 'active' },
  { role: 'admin' },
] } }
```

### NOT

Negate a set of conditions:

```typescript
{ filter: { $not: { status: 'archived' } } }
```

### Nested Combinations

Logical operators compose naturally:

```typescript
{ filter: {
  $and: [
    { $or: [
      { priority: 'high' },
      { priority: 'critical' },
    ] },
    { $not: { status: 'done' } },
  ],
} }
```

## Nested Field Filters

Atscript automatically flattens nested objects into `__`-separated column names (e.g., a `contact.email` field becomes the `contact__email` column). When filtering, use **dot notation** — the adapter translates it to the physical column name for you:

```typescript
{ filter: { 'contact.email': 'alice@example.com' } }
// SQLite: WHERE contact__email = 'alice@example.com'

{ filter: { 'address.city': { $in: ['Berlin', 'Paris'] } } }
// SQLite: WHERE address__city IN ('Berlin', 'Paris')
```

This works with all operators — comparisons, `$regex`, `$exists`, and logical combinators.

## Query Controls

The `controls` object determines how the result set is shaped: sorting, pagination, field selection, and relation loading.

### Sorting

Use `$sort` with `1` for ascending and `-1` for descending:

```typescript
controls: { $sort: { name: 1 } }          // A → Z
controls: { $sort: { createdAt: -1 } }    // newest first
```

Multiple sort keys are applied in order:

```typescript
controls: { $sort: { status: 1, name: -1 } }
// ORDER BY status ASC, name DESC
```

### Pagination

```typescript
controls: {
  $limit: 10,   // return at most 10 records
  $skip: 20,    // skip the first 20 records
}
```

### Field Selection

Include specific fields:

```typescript
controls: { $select: ['id', 'name', 'email'] }
```

Or exclude fields with an object where `0` means exclude:

```typescript
controls: { $select: { password: 0, internalNotes: 0 } }
```

When selecting a nested object parent, all its child fields are included:

```typescript
controls: { $select: ['id', 'contact'] }
// Includes contact.email, contact.phone, etc.
```

### Counting

Get the count of matching records without fetching data:

```typescript
const count = await table.count({ status: 'active' })
```

Or use `findManyWithCount()` to get both data and total count in one call — useful for paginated UIs:

```typescript
const { data, count } = await table.findManyWithCount({
  filter: { status: 'active' },
  controls: { $limit: 10 },
})
```

## Relation Loading

Use `$with` in controls to load related records alongside the main query:

```typescript
controls: {
  $with: [
    { name: 'author' },
    { name: 'tags' },
  ],
}
```

You can apply filters and controls to the related data:

```typescript
controls: {
  $with: [
    {
      name: 'posts',
      filter: { status: 'published' },
      controls: { $sort: { createdAt: -1 }, $limit: 5 },
    },
  ],
}
```

For full details on relation types (TO, FROM, VIA), cascading, and deep loading, see the [Relations](./relations) page.

## Query Expressions

Query expressions are a **compile-time** syntax used inside `.as` files to define view filters, join conditions, and relation filters. They are _not_ used in runtime TypeScript queries — they are embedded in annotations and compiled into the schema.

### Syntax

Expressions are wrapped in backticks inside `.as` files:

```atscript
@db.view.filter `Task.status != 'done'`
```

### Field References

Reference fields using `TableName.fieldName`:

```atscript
@db.view.filter `Task.priority = 'high'`
@db.view.joins Project, `Project.id = Task.projectId`
```

### Operators

| Operator | Meaning              | Example                          |
| -------- | -------------------- | -------------------------------- |
| `=`      | equals               | `` `Task.status = 'active'` ``   |
| `!=`     | not equals           | `` `Task.status != 'done'` ``    |
| `>`      | greater than         | `` `Task.priority > 3` ``        |
| `>=`     | greater than or equal| `` `Task.priority >= 3` ``       |
| `<`      | less than            | `` `Task.age < 65` ``            |
| `<=`     | less than or equal   | `` `Task.age <= 65` ``           |
| `~=`     | regex match          | `` `User.name ~= '^Al'` ``      |
| `?`      | exists (non-null)    | `` `Task.assigneeId ?` ``        |
| `!?`     | not exists (null)    | `` `Task.deletedAt !?` ``        |

### Set Membership

Use curly braces for IN / NOT IN:

```atscript
@db.view.filter `Task.status {active, pending}`
@db.view.filter `Task.role !{guest, bot}`
```

### Logical Combinators

Combine conditions with `&&` (and), `||` (or), and `!()` (not). Use parentheses for grouping:

```atscript
@db.view.filter `Task.status != 'done' && Task.priority >= 3`
@db.view.filter `(Task.status = 'active' || Task.status = 'pending') && Task.assigneeId ?`
@db.view.filter `!(Task.status = 'archived')`
```

### Where They Are Used

Query expressions appear in three annotations:

- **`@db.view.filter`** — row-level filter for a view
- **`@db.view.joins`** — join condition between tables in a view
- **`@db.rel.filter`** — static filter applied when loading a relation

Example in context of a view definition:

```atscript
@db.view
@db.view.for Task
@db.view.joins Project, `Project.id = Task.projectId`
@db.view.filter `Task.status != 'done' && Task.priority >= 3`
type ActiveHighPriorityTasks {
  taskId: Task.id
  title: Task.title
  projectName: Project.name
}
```

## Combining It All

Here is a practical example that brings filters, sorting, pagination, field selection, and relation loading together:

```typescript
const tasks = await taskTable.findMany({
  filter: {
    status: { $ne: 'done' },
    priority: { $in: ['high', 'critical'] },
    'project.active': true,
  },
  controls: {
    $sort: { priority: -1, createdAt: 1 },
    $limit: 20,
    $skip: 0,
    $select: ['id', 'title', 'status', 'priority'],
    $with: [
      { name: 'assignee' },
      { name: 'tags' },
    ],
  },
})
```

This returns the first 20 non-done tasks with high or critical priority from active projects, sorted by priority descending then creation date ascending, including only the selected fields plus the assignee and tags relations.

## Next Steps

- [Relations](./relations) — TO, FROM, and VIA relation types, cascading, and deep loading
- [Patch Operations](./patch-operations) — Array-level update operators
- [Views](./views) — Managed, external, and materialized views

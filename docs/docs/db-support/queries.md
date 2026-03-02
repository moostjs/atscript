# Queries & Filters

::: warning Experimental
DB Integrations are experimental. APIs may change at any moment.
:::

`AtscriptDbTable` uses a MongoDB-style filter syntax for queries. Filters and controls are wrapped in a `Uniquery` object — a canonical query format provided by [`@uniqu/core`](https://github.com/niceguymissing/uniqu).

## Uniquery Format

Read operations (`findOne`, `findMany`, `count`) accept a `Uniquery` object:

```typescript
await users.findMany({
  filter: { status: 'active' },
  controls: { $sort: { name: 1 }, $limit: 10 },
})
```

| Field | Type | Description |
|-------|------|-------------|
| `filter` | `FilterExpr<T>` | MongoDB-style filter tree |
| `controls` | `UniqueryControls<T>` | Sorting, pagination, projection |

Write-with-filter operations (`updateMany`, `replaceMany`, `deleteMany`) accept a bare `FilterExpr`:

```typescript
await users.updateMany(
  { status: 'pending' },   // FilterExpr
  { status: 'active' },    // data
)
```

## Basic Filters

### Equality

```typescript
// Exact match
await users.findMany({ filter: { status: 'active' }, controls: {} })

// Multiple conditions (implicit AND)
await users.findMany({ filter: { status: 'active', role: 'admin' }, controls: {} })

// Null check
await users.findMany({ filter: { deletedAt: null }, controls: {} })
```

### Comparison Operators

```typescript
// Greater than
await users.findMany({ filter: { age: { $gt: 18 } }, controls: {} })

// Greater than or equal
await users.findMany({ filter: { age: { $gte: 18 } }, controls: {} })

// Less than
await users.findMany({ filter: { age: { $lt: 65 } }, controls: {} })

// Less than or equal
await users.findMany({ filter: { age: { $lte: 65 } }, controls: {} })

// Not equal
await users.findMany({ filter: { status: { $ne: 'banned' } }, controls: {} })
```

### Set Operators

```typescript
// In a set of values
await users.findMany({ filter: { role: { $in: ['admin', 'moderator'] } }, controls: {} })

// Not in a set of values
await users.findMany({ filter: { status: { $nin: ['banned', 'suspended'] } }, controls: {} })
```

### Existence

```typescript
// Field is not null
await users.findMany({ filter: { email: { $exists: true } }, controls: {} })

// Field is null
await users.findMany({ filter: { deletedAt: { $exists: false } }, controls: {} })
```

### Pattern Matching

```typescript
// Contains
await users.findMany({ filter: { name: { $regex: 'alice' } }, controls: {} })

// Starts with
await users.findMany({ filter: { name: { $regex: '^alice' } }, controls: {} })

// Ends with
await users.findMany({ filter: { email: { $regex: 'example.com$' } }, controls: {} })

// Exact match
await users.findMany({ filter: { code: { $regex: '^ABC123$' } }, controls: {} })
```

::: tip
The `$regex` operator is translated to database-native pattern matching. For SQLite, it becomes a `LIKE` expression. For MongoDB, it uses `$regex`. Both `RegExp` and `string` values are accepted.
:::

## Logical Operators

### `$and`

Explicit AND (usually not needed since multiple conditions are implicitly AND'd):

```typescript
await users.findMany({
  filter: {
    $and: [
      { age: { $gte: 18 } },
      { age: { $lt: 65 } },
    ]
  },
  controls: {},
})
```

### `$or`

```typescript
await users.findMany({
  filter: {
    $or: [
      { role: 'admin' },
      { role: 'moderator' },
    ]
  },
  controls: {},
})
```

### `$not`

```typescript
await users.findMany({
  filter: { $not: { status: 'banned' } },
  controls: {},
})
```

### Combining Operators

```typescript
await users.findMany({
  filter: {
    $and: [
      { status: 'active' },
      {
        $or: [
          { role: 'admin' },
          { age: { $gte: 21 } },
        ],
      },
    ],
  },
  controls: {},
})
```

::: warning
Do not mix comparison fields and logical operators in the same object (e.g., `{ name: 'foo', $or: [...] }`). This is a type error — use `$and` to combine them explicitly.
:::

## Query Controls

### Sorting

```typescript
// Ascending (1) or descending (-1)
await users.findMany({
  filter: {},
  controls: { $sort: { name: 1 } },         // A → Z
})

await users.findMany({
  filter: {},
  controls: { $sort: { createdAt: -1 } },    // newest first
})

// Multiple sort fields
await users.findMany({
  filter: {},
  controls: { $sort: { status: 1, name: 1 } },
})
```

### Pagination

```typescript
await users.findMany({
  filter: {},
  controls: {
    $limit: 10,   // max 10 results
    $skip: 20,    // skip first 20 results (page 3)
  },
})
```

### Projection

Select only specific fields:

```typescript
// Array form
await users.findMany({
  filter: {},
  controls: { $select: ['id', 'name', 'email'] },
})

// Object form (1 = include)
await users.findMany({
  filter: {},
  controls: { $select: { id: 1, name: 1, email: 1 } },
})
```

## Filter & Query Types

The filter and query types are provided by `@uniqu/core` and re-exported from `@atscript/utils-db`:

```typescript
import type {
  FilterExpr,
  FieldOpsFor,
  UniqueryControls,
  Uniquery,
} from '@atscript/utils-db'
```

| Type | Description |
|------|-------------|
| `FilterExpr<T>` | Filter tree with field conditions and logical operators (`$and`, `$or`, `$not`) |
| `FieldOpsFor<V>` | Comparison and set operators for a field value type |
| `UniqueryControls<T>` | Query controls: `$sort`, `$limit`, `$skip`, `$select` |
| `Uniquery<T>` | Combined query: `{ filter, controls }` |

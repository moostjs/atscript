# Queries & Filters

::: warning Experimental
DB Integrations are experimental. APIs may change at any moment.
:::

`AtscriptDbTable` uses a MongoDB-style filter syntax for queries. Database adapters translate these filters into their native query language (SQL WHERE clauses, MongoDB queries, etc.).

## Basic Filters

### Equality

```typescript
// Exact match
await users.findMany({ status: 'active' })

// Multiple conditions (implicit AND)
await users.findMany({ status: 'active', role: 'admin' })

// Null check
await users.findMany({ deletedAt: null })
```

### Comparison Operators

```typescript
// Greater than
await users.findMany({ age: { $gt: 18 } })

// Greater than or equal
await users.findMany({ age: { $gte: 18 } })

// Less than
await users.findMany({ age: { $lt: 65 } })

// Less than or equal
await users.findMany({ age: { $lte: 65 } })

// Not equal
await users.findMany({ status: { $ne: 'banned' } })
```

### Set Operators

```typescript
// In a set of values
await users.findMany({ role: { $in: ['admin', 'moderator'] } })

// Not in a set of values
await users.findMany({ status: { $nin: ['banned', 'suspended'] } })
```

### Existence

```typescript
// Field is not null
await users.findMany({ email: { $exists: true } })

// Field is null
await users.findMany({ deletedAt: { $exists: false } })
```

### Pattern Matching

```typescript
// Contains
await users.findMany({ name: { $regex: 'alice' } })

// Starts with
await users.findMany({ name: { $regex: '^alice' } })

// Ends with
await users.findMany({ email: { $regex: 'example.com$' } })

// Exact match
await users.findMany({ code: { $regex: '^ABC123$' } })
```

::: tip
The `$regex` operator is translated to database-native pattern matching. For SQLite, it becomes a `LIKE` expression. For MongoDB, it uses `$regex`.
:::

## Logical Operators

### `$and`

Explicit AND (usually not needed since multiple conditions are implicitly AND'd):

```typescript
await users.findMany({
  $and: [
    { age: { $gte: 18 } },
    { age: { $lt: 65 } },
  ]
})
```

### `$or`

```typescript
await users.findMany({
  $or: [
    { role: 'admin' },
    { role: 'moderator' },
  ]
})
```

### `$not`

```typescript
await users.findMany({
  $not: { status: 'banned' }
})
```

### Combining Operators

```typescript
await users.findMany({
  status: 'active',
  $or: [
    { role: 'admin' },
    { age: { $gte: 21 } },
  ],
})
```

## Query Options

### Sorting

```typescript
// Ascending (1) or descending (-1)
await users.findMany({}, {
  sort: { name: 1 }         // A → Z
})

await users.findMany({}, {
  sort: { createdAt: -1 }   // newest first
})

// Multiple sort fields
await users.findMany({}, {
  sort: { status: 1, name: 1 }
})
```

### Pagination

```typescript
await users.findMany({}, {
  limit: 10,   // max 10 results
  skip: 20,    // skip first 20 results (page 3)
})
```

### Projection

Select only specific fields:

```typescript
// Array form
await users.findMany({}, {
  projection: ['id', 'name', 'email']
})

// Object form (1 = include)
await users.findMany({}, {
  projection: { id: 1, name: 1, email: 1 }
})
```

## Filter Types

The filter and options types are fully typed:

```typescript
import type {
  TDbFilter,
  TDbFindOptions,
  TDbProjection,
  TFilterOperators,
} from '@atscript/utils-db'
```

| Type | Description |
|------|-------------|
| `TDbFilter<T>` | Filter object with field conditions and logical operators |
| `TFilterOperators<V>` | Comparison and set operators for a field value |
| `TDbFindOptions<T>` | Query options: sort, limit, skip, projection |
| `TDbProjection<T>` | Field projection (array or object form) |

# Queries & Filters

::: warning Experimental
DB Adapters are experimental. APIs may change at any moment.
:::

`AtscriptDbTable` uses a MongoDB-style filter syntax for queries. Filters and controls are wrapped in a `Uniquery` object — a canonical query format provided by [`@uniqu/core`](https://github.com/moostjs/uniqu).

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

### Relation Loading (`$with`)

Load navigational properties (relations declared with `@db.rel.to` / `@db.rel.from`) alongside query results. Each `$with` entry is a sub-query with its own filter, controls, and nested `$with`:

```typescript
// Load a single relation
await posts.findMany({
  filter: {},
  controls: {
    $with: [{ name: 'author' }],
  },
})

// Multiple relations
await posts.findMany({
  filter: {},
  controls: {
    $with: [{ name: 'author' }, { name: 'comments' }],
  },
})

// Per-relation filter + controls
await users.findMany({
  filter: {},
  controls: {
    $with: [{
      name: 'posts',
      filter: { status: 'published' },
      controls: {
        $sort: { createdAt: -1 },
        $limit: 5,
      },
    }],
  },
})

// Nested $with (2+ levels deep)
await users.findMany({
  filter: {},
  controls: {
    $with: [{
      name: 'posts',
      controls: {
        $with: [{ name: 'comments', controls: { $limit: 10 } }],
      },
    }],
  },
})
```

FK fields needed for joining are automatically included in `$select` — you don't need to add them manually.

See [Relations & Foreign Keys](./relations) for how to declare relations in your schema and full `$with` examples.

## Nested Fields

When your Atscript interface has nested objects, use dot-notation to filter, sort, and select by nested paths. The generic layer translates these paths to physical column names automatically.

### Filtering

```typescript
// Filter by nested field (contact.email → contact__email in SQL)
await users.findMany({
  filter: { 'contact.email': 'alice@example.com' },
  controls: {},
})

// Deep nested path
await users.findMany({
  filter: { 'settings.notifications.email': true },
  controls: {},
})

// All filter operators work on nested paths
await users.findMany({
  filter: { 'contact.phone': { $exists: true } },
  controls: {},
})
```

### Sorting

```typescript
await users.findMany({
  filter: {},
  controls: { $sort: { 'contact.phone': -1 } },
})
```

### Projection

```typescript
await users.findMany({
  filter: {},
  controls: { $select: ['id', 'contact.email'] },
})
```

#### Parent Path Expansion

Selecting a parent object path automatically expands it to all its leaf columns in relational databases:

```typescript
// Select a parent path
await users.findMany({
  filter: {},
  controls: { $select: ['id', 'contact'] },
})
// Translates to: $select: ['id', 'contact__email', 'contact__phone']

// Works with object form too
await users.findMany({
  filter: {},
  controls: { $select: { contact: 1, name: 1 } },
})
// Translates to: $select: { contact__email: 1, contact__phone: 1, name: 1 }
```

Deep parent paths also expand recursively — `$select: ['settings']` expands to all leaf columns under `settings` (e.g., `settings__notifications__email`, `settings__notifications__sms`).

### Parent Path in Sorting

Sorting by a parent object path (e.g., `$sort: { contact: 1 }`) is silently ignored for relational databases — there is no single column to sort by. Sort by specific leaf fields instead (e.g., `$sort: { 'contact.email': 1 }`).

::: tip
Dot-notation paths work only for **flattened** nested fields (those stored as separate `__`-separated columns). Sub-paths of `@db.json` fields cannot be queried at the generic layer — the data is stored as a single JSON string.
:::

See [Embedded Objects](./tables#embedded-objects) for how nested objects are stored.

## Insights

Every `Uniquery` can carry **insights** — a `Map<string, Set<InsightOp>>` that records which fields were mentioned and which operators were used on them. This is computed automatically when parsing URL queries via `@uniqu/url`, or you can compute it manually with `computeInsights()`.

```typescript
import { getInsights, computeInsights } from '@uniqu/core'

// From a parsed URL query (insights are pre-computed)
const query = parseUrl('age>=18&$select=name,email&$order=-createdAt')
const insights = getInsights(query)
// insights → Map {
//   'age'       → Set { '$gte' },
//   'name'      → Set { '$select' },
//   'email'     → Set { '$select' },
//   'createdAt' → Set { '$order' },
// }

// From a manually built query (computed on demand)
const insights2 = computeInsights(
  { status: 'active', age: { $gte: 18 } },
  { $select: ['name'], $sort: { createdAt: -1 } }
)
```

### Insight Operators

| Operator | Source |
|----------|--------|
| `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte` | Filter comparisons |
| `$in`, `$nin` | Filter set operators |
| `$regex`, `$exists` | Filter pattern/existence checks |
| `$select` | `controls.$select` fields |
| `$order` | `controls.$sort` fields |

### Use Cases

Insights let you answer "which fields did this query touch?" without walking the filter tree yourself. Common uses:

- **Field validation** — reject queries that reference unknown or forbidden fields (the CRUD controller does this automatically)
- **Access control** — restrict which fields certain roles can filter or select
- **Audit logging** — record which fields were queried

See [CRUD Customization — Field-Level Access Control](./crud-http-customization#field-level-access-control) for a practical example.

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

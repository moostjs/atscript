---
outline: deep
---

# Queries & Filters

Every query in Atscript follows the same structure: a **filter** to select records, and **controls** for sorting, pagination, and projection.

```typescript
const results = await table.findMany({
  filter: { /* which records */ },
  controls: { /* how to return them */ },
})
```

## Filters

### Simple Equality

```typescript
{ filter: { status: 'active' } }
// WHERE status = 'active'

{ filter: { status: 'active', role: 'admin' } }
// WHERE status = 'active' AND role = 'admin'
```

### Comparison Operators

```typescript
{ filter: { age: { $gt: 18 } } }       // greater than
{ filter: { age: { $gte: 18 } } }      // greater than or equal
{ filter: { age: { $lt: 65 } } }       // less than
{ filter: { age: { $lte: 65 } } }      // less than or equal
{ filter: { status: { $ne: 'archived' } } }  // not equal
```

### Set Operators

```typescript
{ filter: { status: { $in: ['active', 'pending'] } } }
// WHERE status IN ('active', 'pending')

{ filter: { role: { $nin: ['guest', 'bot'] } } }
// WHERE role NOT IN ('guest', 'bot')
```

### Pattern Matching

```typescript
{ filter: { name: { $regex: '^Al' } } }
// WHERE name LIKE 'Al%' (SQLite)
// WHERE name matches /^Al/ (MongoDB)
```

### Existence

```typescript
{ filter: { bio: { $exists: true } } }
// WHERE bio IS NOT NULL

{ filter: { bio: { $exists: false } } }
// WHERE bio IS NULL
```

### Logical Operators

```typescript
// AND (implicit — multiple keys)
{ filter: { status: 'active', role: 'admin' } }

// AND (explicit)
{ filter: { $and: [{ status: 'active' }, { role: 'admin' }] } }

// OR
{ filter: { $or: [{ status: 'active' }, { role: 'admin' }] } }

// NOT
{ filter: { $not: { status: 'archived' } } }
```

### Nested Field Filters

Use dot notation for nested objects:

```typescript
{ filter: { 'contact.email': 'alice@example.com' } }
```

Dot-notation paths are automatically translated to physical column names (e.g., `contact__email` in SQLite).

## Controls

### Sorting

```typescript
controls: { $sort: { name: 1 } }       // ascending
controls: { $sort: { createdAt: -1 } }  // descending

// Multiple sort keys
controls: { $sort: { status: 1, createdAt: -1 } }
```

### Pagination

```typescript
controls: {
  $limit: 10,  // max records to return
  $skip: 20,   // skip first 20 records
}
```

### Projection

Select which fields to include or exclude:

```typescript
// Include only these fields
controls: { $select: { name: 1, email: 1 } }

// Exclude these fields
controls: { $select: { bio: 0, preferences: 0 } }
```

When selecting a nested object parent, all its child fields are included:

```typescript
controls: { $select: { contact: 1 } }
// Includes contact.email, contact.phone, etc.
```

### Counting

Get just the count without fetching records:

```typescript
controls: { $count: true }
```

Or use `findManyWithCount()` to get both data and count in one call.

### Loading Relations

Use `$with` to include related data:

```typescript
controls: {
  $with: [
    { name: 'project' },
    { name: 'comments', controls: { $limit: 5 } },
    { name: 'tags' },
  ],
}
```

See [Navigation Properties](./navigation#loading-relations-with-with) for details.

## Combining Everything

```typescript
const tasks = await taskTable.findMany({
  filter: {
    status: { $ne: 'done' },
    priority: { $in: ['high', 'critical'] },
  },
  controls: {
    $sort: { priority: -1, createdAt: 1 },
    $limit: 20,
    $select: { title: 1, status: 1, priority: 1 },
    $with: [{ name: 'assignee' }],
  },
})
```

## Next Steps

- [Query Expressions](./query-expressions) — The backtick expression syntax used in view filters and join conditions
- [Patch Operations](./patch-operations) — Array-level update operators
- [CRUD over HTTP](./crud-http) — Expose queries as REST endpoints

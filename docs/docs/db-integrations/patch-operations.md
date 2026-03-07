---
outline: deep
---

# Patch Operations

When updating records with arrays or nested objects, Atscript supports fine-grained patch operators that let you modify collections without replacing them entirely.

## Array Patch Operators

Instead of replacing an entire array, use patch operators to insert, update, or remove individual items:

### `$replace`

Replace the entire array:

```typescript
await table.updateOne({
  id: 1,
  tags: { $replace: ['urgent', 'frontend'] },
})
```

### `$insert`

Append items to the array:

```typescript
await table.updateOne({
  id: 1,
  tags: { $insert: ['new-tag'] },
})
```

If the array has a key field (`@expect.array.key`), duplicates are skipped:

```atscript
@expect.array.key 'id'
items: { id: number, name: string }[]
```

```typescript
await table.updateOne({
  id: 1,
  items: { $insert: [{ id: 3, name: 'New Item' }] },
})
// Only inserts if no item with id=3 exists
```

### `$upsert`

Insert items or update them if they already exist (matched by key):

```typescript
await table.updateOne({
  id: 1,
  items: {
    $upsert: [
      { id: 3, name: 'Updated or New Item' },
    ],
  },
})
```

### `$update`

Update existing items matched by key:

```typescript
await table.updateOne({
  id: 1,
  items: {
    $update: [
      { id: 3, name: 'New Name' },
    ],
  },
})
```

### `$remove`

Remove items by key or value:

```typescript
// Remove by key
await table.updateOne({
  id: 1,
  items: { $remove: [{ id: 3 }] },
})

// Remove by value (primitive arrays)
await table.updateOne({
  id: 1,
  tags: { $remove: ['old-tag'] },
})
```

### Combining Operators

You can use multiple operators in one update:

```typescript
await table.updateOne({
  id: 1,
  items: {
    $insert: [{ id: 10, name: 'New' }],
    $update: [{ id: 3, name: 'Changed' }],
    $remove: [{ id: 5 }],
  },
})
```

## Nested Object Patch Strategy

Control how nested objects are updated with `@db.patch.strategy`:

### Replace Strategy (Default)

The entire nested object is replaced:

```atscript
@db.patch.strategy 'replace'
address: {
    line1: string
    line2?: string
    city: string
}
```

```typescript
await table.updateOne({
  id: 1,
  address: { line1: '123 New St', city: 'Portland' },
})
// address.line2 is now gone (replaced entirely)
```

### Merge Strategy

Only the provided fields are updated; others are preserved:

```atscript
@db.patch.strategy 'merge'
contacts: {
    email: string
    phone: string
}
```

```typescript
await table.updateOne({
  id: 1,
  contacts: { phone: '555-1234' },
})
// contacts.email is preserved
```

## Adapter Differences

| Feature | SQLite | MongoDB |
|---------|--------|---------|
| Array patches | Generic decomposition (read-modify-write) | Native aggregation pipelines |
| `@db.patch.strategy` | Supported | Supported |
| `@expect.array.key` | Supported | Supported |
| `@expect.array.uniqueItems` | Supported | Uses `$setUnion` / `$setDifference` |

MongoDB uses native aggregation pipeline expressions (`$map`, `$filter`, `$reduce`, `$concatArrays`) for maximum performance. Other adapters use a generic read-modify-write approach.

## Next Steps

- [CRUD Operations](./crud) — Full API for data operations
- [Transactions](./transactions) — Wrapping operations in transactions

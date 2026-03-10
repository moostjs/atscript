---
outline: deep
---

# Patch Operations

When updating records, arrays and navigation properties support declarative patch operators for fine-grained control. Instead of replacing an entire field, you can insert, update, or remove individual items — whether the field is a simple string array, a keyed object array, or a 1:N / M:N navigation property.

## Array Patch Operators

Five operators are available for array fields during `updateOne` and `bulkUpdate`:

| Operator | Effect |
|----------|--------|
| `$replace` | Replace the entire array |
| `$insert` | Append new items |
| `$upsert` | Insert or update items by key |
| `$update` | Update existing items by key |
| `$remove` | Remove items by key or value |

A simple example with a string array:

```typescript
await table.updateOne({
  id: 1,
  tags: { $insert: ['backend', 'api'] },
})
```

When multiple operators appear on the same field, they are applied in order: remove, update, upsert, insert.

## Key Fields

`@expect.array.key` marks which properties identify an element inside an object array. Keys are required for `$update`, `$upsert`, and `$remove` on object arrays.

```atscript
variants: {
    @expect.array.key
    sku: string
    color: string
    stock: number
}[]
```

Multiple fields can be marked as keys to form a composite key — an element matches only when all key fields match.

## Patch Strategies

`@db.patch.strategy` controls how matched objects are updated during `$update` and `$upsert`:

- **`"replace"`** (default) — the matched object is fully replaced. All required fields must be provided.
- **`"merge"`** — a recursive merge is performed. Only provided fields are updated; others are preserved.

```atscript
// Replace strategy (default) — $upsert replaces the entire matched object
variants: {
    @expect.array.key
    sku: string
    color: string
    stock: number
}[]

// Merge strategy — $update only touches provided fields
@db.patch.strategy 'merge'
attributes: {
    @expect.array.key
    name: string
    value: string
    visible: boolean
}[]
```

## Primitive Arrays

For simple value arrays like `tags: string[]`, operators work by value equality:

```typescript
await table.updateOne({ id: 1, tags: { $insert: ['urgent', 'reviewed'] } })
await table.updateOne({ id: 1, tags: { $remove: ['draft'] } })
await table.updateOne({ id: 1, tags: { $replace: ['final', 'approved'] } })
```

## Unique Primitive Arrays

When `@expect.array.uniqueItems` is set, `$insert` automatically skips duplicates:

```atscript
@expect.array.uniqueItems
tags: string[]
```

```typescript
// Current tags: ['api', 'backend']
await table.updateOne({ id: 1, tags: { $insert: ['api', 'frontend'] } })
// Result: ['api', 'backend', 'frontend'] — 'api' was silently skipped
```

## Keyed Object Arrays — Replace Strategy

With `@expect.array.key` and the default replace strategy, operators match elements by key:

```atscript
variants: {
    @expect.array.key
    sku: string
    color: string
    stock: number
}[]
```

```typescript
// Insert a new variant
await table.updateOne({
  id: 1,
  variants: { $insert: [{ sku: 'B2', color: 'blue', stock: 10 }] },
})

// Update — replaces the entire matched object
await table.updateOne({
  id: 1,
  variants: { $update: [{ sku: 'B2', color: 'navy', stock: 8 }] },
})

// Remove by key
await table.updateOne({
  id: 1,
  variants: { $remove: [{ sku: 'B2' }] },
})

// Upsert — insert if not found, replace if found
await table.updateOne({
  id: 1,
  variants: { $upsert: [{ sku: 'C3', color: 'green', stock: 3 }] },
})
```

Under replace strategy, `$update` and `$upsert` replace the entire matched object — every required field must be present.

## Keyed Object Arrays — Merge Strategy

With `@db.patch.strategy 'merge'`, updates merge into the existing object, preserving fields not explicitly provided:

```atscript
@db.patch.strategy 'merge'
attributes: {
    @expect.array.key
    name: string
    value: string
    visible: boolean
}[]
```

```typescript
// Current: [{ name: 'size', value: 'M', visible: true }]
await table.updateOne({
  id: 1,
  attributes: { $update: [{ name: 'size', value: 'XL' }] },
})
// Result: [{ name: 'size', value: 'XL', visible: true }] — 'visible' preserved
```

## Keyless Object Arrays

Arrays without `@expect.array.key` support only `$insert`, `$remove`, and `$replace`. Since there is no key to identify elements, `$update` and `$upsert` are not available:

```typescript
await table.updateOne({ id: 1, logs: { $insert: [{ message: 'Deployed', ts: Date.now() }] } })
await table.updateOne({ id: 1, logs: { $remove: [{ message: 'Deployed', ts: 1710000000 }] } })
await table.updateOne({ id: 1, logs: { $replace: [] } })
```

`$remove` matches items by full deep value equality — every field must match.

## JSON Fields

Fields annotated with `@db.json` reject all patch operators. The field is stored as a single opaque JSON column, so only plain replacement is allowed:

```atscript
@db.json
settings: {
    theme: string
    notifications: boolean
}
```

```typescript
// Works — plain replacement
await table.updateOne({ id: 1, settings: { theme: 'dark', notifications: false } })

// Fails — patch operators rejected on @db.json fields
await table.updateOne({ id: 1, settings: { $replace: { theme: 'dark' } } }) // Error
```

The same applies to `@db.json` arrays — use a plain array value instead of patch operators.

## FROM Navigation Properties

When patching 1:N relations (defined via `@db.rel.from`), patch operators create, update, or delete child records. The foreign key is automatically wired.

```atscript
type Task {
    @meta.id
    id: number
    title: string
    @db.rel.from 'Comment' 'taskId'
    comments: Comment[]
}

type Comment {
    @meta.id
    id: number
    body: string
    authorId: number
    @db.rel.to 'Task'
    taskId: number
}
```

```typescript
await table.updateOne({
  id: 1,
  comments: {
    $insert: [{ body: 'Looks good!', authorId: 3 }],  // FK auto-set to 1
    $remove: [{ id: 5 }],                              // Delete child by PK
    $update: [{ id: 7, body: 'Edited comment' }],      // Partial update by PK
  },
})

// Upsert — update if PK present, insert otherwise
await table.updateOne({
  id: 1,
  comments: {
    $upsert: [
      { id: 7, body: 'Updated' },         // Has PK → update
      { body: 'Brand new', authorId: 2 },  // No PK → insert
    ],
  },
})

// Replace — delete all old children, insert new ones
await table.updateOne({
  id: 1,
  comments: { $replace: [{ body: 'Only comment', authorId: 1 }] },
})
```

Passing a plain array (without operators) is equivalent to `$replace`.

## VIA Navigation Properties

When patching M:N relations (defined via `@db.rel.via`), operators manage both the target records and the junction table entries:

```atscript
type Task {
    @meta.id
    id: number
    title: string
    @db.rel.via 'TaskTag' 'Tag'
    tags: Tag[]
}

type Tag {
    @meta.id
    id: number
    name: string
}
```

```typescript
// Create new target + junction entry
await table.updateOne({ id: 1, tags: { $insert: [{ name: 'new-tag' }] } })

// Reference existing target — creates junction only
await table.updateOne({ id: 1, tags: { $insert: [{ id: 5 }] } })

// Remove junction entry (target record preserved)
await table.updateOne({ id: 1, tags: { $remove: [{ id: 5 }] } })

// Update target record (junction untouched)
await table.updateOne({ id: 1, tags: { $update: [{ id: 5, name: 'renamed' }] } })

// Replace — clear all junctions, create new ones
await table.updateOne({ id: 1, tags: { $replace: [{ name: 'only-tag' }] } })
```

As with FROM relations, passing a plain array is equivalent to `$replace`.

## Nested Object Patches

Non-array nested objects follow the same strategy system. With the default **replace** strategy, the entire nested object is replaced — omitted fields are lost. With **merge**, only provided fields are updated:

```atscript
@db.patch.strategy 'merge'
address: {
    line1: string
    line2?: string
    city: string
}
```

```typescript
// Replace (default): address.line2 would be lost
await table.updateOne({ id: 1, address: { line1: '123 New St', city: 'Portland' } })

// Merge: only city changes, line1 and line2 preserved
await table.updateOne({ id: 1, address: { city: 'Seattle' } })
```

## Combining Operators

Multiple operators can be used on the same field, and multiple fields can be patched in one request:

```typescript
await table.updateOne({
  id: 1,
  variants: {
    $remove: [{ sku: 'OLD' }],
    $update: [{ sku: 'A1', stock: 0 }],
    $insert: [{ sku: 'NEW', color: 'red', stock: 50 }],
  },
  tags: { $insert: ['reviewed'] },
  title: 'Updated title',
})
```

Operators are always applied in order: remove, update, upsert, insert — regardless of the order they appear in the object.

## Adapter Differences

SQLite uses a generic read-modify-write approach: it fetches the current array value, applies patch operations in memory, and stores the resolved array back. MongoDB uses native aggregation pipeline expressions (`$map`, `$filter`, `$reduce`, `$concatArrays`) for in-place array manipulation, avoiding the extra read. Both adapters produce identical results from the caller's perspective.

## Next Steps

- [Deep Operations](./deep-operations) — nested creation and replacement across relations
- [Relations](./tables#relations) — defining TO, FROM, and VIA relations
- [Views](./views) — read-only projections and materialized views

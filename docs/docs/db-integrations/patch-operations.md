---
outline: deep
---

# Patch Operations

<!--@include: ./_experimental-warning.md-->

Patch operators give you fine-grained control over array fields and navigation properties during `updateOne` and `bulkUpdate` calls. Instead of replacing an entire collection of items, you can insert, update, or remove individual elements.

## Where Patch Operators Apply

Patch operators work on **arrays only** — not on scalar fields or non-array nested objects. There are two distinct contexts:

| Context | Adapter support | How it works |
|---------|----------------|--------------|
| **Navigation properties** (`@db.rel.from`, `@db.rel.via`) | All adapters (SQLite, MongoDB, etc.) | Operators translate to real INSERT / UPDATE / DELETE on related tables and junction rows |
| **Embedded arrays** (e.g. `tags: string[]`, `variants: {...}[]`) | Document DBs (MongoDB) | MongoDB uses native pipeline expressions for atomic in-place array manipulation |

In **relational databases** (SQLite, Postgres, etc.), arrays are stored as JSON columns — and `@db.json` fields reject patch operators entirely. The natural pattern for collections that need partial updates is to model them as separate tables with FROM or VIA relations. Patch operators on navigation properties translate to real SQL INSERT / UPDATE / DELETE statements.

In **document databases** (MongoDB), embedded arrays are first-class data types. Patch operators work natively via aggregation pipeline expressions — no read-modify-write needed. Both embedded arrays and navigation properties are natural patterns depending on your data model.

## Operators

Five operators are available:

| Operator | Effect |
|----------|--------|
| `$replace` | Replace the entire array / set of related records |
| `$insert` | Append new items / create new related records |
| `$upsert` | Insert or update items by key |
| `$update` | Update existing items by key |
| `$remove` | Remove items by key or value |

When multiple operators appear on the same field, they are applied in order: **remove → update → upsert → insert**.

## FROM Navigation Properties {#from}

Patch operators on 1:N relations (`@db.rel.from`) translate to real database operations on the child table. The foreign key is automatically wired to the parent. Elements are identified by their **primary key** (`@meta.id`) — not by `@expect.array.key`, which only applies to embedded arrays.

```atscript
import { Comment } from './comment.as'

@db.table 'tasks'
export interface Task {
    @meta.id
    @db.default.increment
    id: number

    title: string

    @db.rel.from
    comments: Comment[]
}
```

```typescript
await tasks.updateOne({
  id: 1,
  comments: {
    $insert: [{ body: 'Looks good!', authorId: 3 }],  // INSERT into comments, FK auto-set
    $remove: [{ id: 5 }],                              // DELETE FROM comments WHERE id = 5
    $update: [{ id: 7, body: 'Edited comment' }],      // UPDATE comments SET body = ... WHERE id = 7
  },
})

// Upsert — update if PK is present, insert otherwise
await tasks.updateOne({
  id: 1,
  comments: {
    $upsert: [
      { id: 7, body: 'Updated' },         // Has PK → update
      { body: 'Brand new', authorId: 2 },  // No PK → insert with FK wired
    ],
  },
})

// Replace — delete all existing children, insert new ones
await tasks.updateOne({
  id: 1,
  comments: { $replace: [{ body: 'Only comment', authorId: 1 }] },
})
```

::: warning Plain arrays rejected on PATCH
When using `updateOne` / `bulkUpdate` (PATCH), passing a plain array instead of patch operators on a FROM navigation property returns a `400` error. Plain arrays are only accepted on `replaceOne` (PUT), where they trigger the diff-based sync described in [Deep Operations](./deep-operations). For partial updates, always use explicit operators.
:::

## VIA Navigation Properties {#via}

Patch operators on M:N relations (`@db.rel.via`) manage both the target records and the junction table entries. As with FROM, elements are identified by their **primary key** (`@meta.id`):

```atscript
import { Tag } from './tag.as'
import { TaskTag } from './task-tag.as'

@db.table 'tasks'
export interface Task {
    @meta.id
    @db.default.increment
    id: number

    title: string

    @db.rel.via TaskTag
    tags: Tag[]
}
```

```typescript
// Create new target record + junction entry
await tasks.updateOne({ id: 1, tags: { $insert: [{ name: 'new-tag' }] } })

// Reference existing target — creates junction row only
await tasks.updateOne({ id: 1, tags: { $insert: [{ id: 5 }] } })

// Remove junction entry (target record is preserved)
await tasks.updateOne({ id: 1, tags: { $remove: [{ id: 5 }] } })

// Update the target record (junction is untouched)
await tasks.updateOne({ id: 1, tags: { $update: [{ id: 5, name: 'renamed' }] } })

// Replace — clear all junction rows, create new ones
await tasks.updateOne({ id: 1, tags: { $replace: [{ name: 'only-tag' }] } })
```

::: warning Plain arrays rejected on PATCH
As with FROM relations, passing a plain array on a VIA navigation property during a PATCH operation returns a `400` error. Use `$replace` explicitly if you want to replace all entries.
:::

## Embedded Array Patches {#embedded-arrays}

Patch operators work on embedded arrays — fields like `tags: string[]` or `variants: {...}[]` that are stored directly on the record. This is a **MongoDB feature**: document databases store arrays as native data types and patch operators translate to atomic aggregation pipeline expressions.

::: warning Relational databases
In SQL adapters, arrays are stored as JSON columns. Fields marked with `@db.json` reject patch operators entirely. For collections that need partial updates in a relational database, model them as separate tables with [FROM](./relations#from) or [VIA](./relations#via) relations — patch operators on navigation properties translate to real SQL statements.
:::

### Primitive Arrays

For simple value arrays like `tags: string[]`, all operators work by **value equality** — no key fields are needed:

```typescript
await table.updateOne({ id: 1, tags: { $insert: ['urgent', 'reviewed'] } })
await table.updateOne({ id: 1, tags: { $remove: ['draft'] } })
await table.updateOne({ id: 1, tags: { $replace: ['final', 'approved'] } })
```

### Unique Primitive Arrays

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

### Key Fields

`@expect.array.key` marks which properties identify an element inside an embedded object array. Keys are required for `$update`, `$upsert`, and `$remove` on embedded object arrays.

```atscript
variants: {
    @expect.array.key
    sku: string
    color: string
    stock: number
}[]
```

Multiple fields can be marked as keys to form a composite key — an element matches only when all key fields match.

::: info Navigation properties don't need key fields
FROM and VIA relations use `@meta.id` (primary keys) to identify elements — `@expect.array.key` is not needed and has no effect on navigation properties.
:::

### Patch Strategies

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

### Keyed Object Arrays — Replace Strategy

With `@expect.array.key` and the default replace strategy, operators match elements by key:

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

### Keyed Object Arrays — Merge Strategy

With `@db.patch.strategy 'merge'`, updates merge into the existing object, preserving fields not explicitly provided:

```typescript
// Current: [{ name: 'size', value: 'M', visible: true }]
await table.updateOne({
  id: 1,
  attributes: { $update: [{ name: 'size', value: 'XL' }] },
})
// Result: [{ name: 'size', value: 'XL', visible: true }] — 'visible' preserved
```

### Keyless Object Arrays

For object arrays without `@expect.array.key`, matching falls back to **full deep value equality** — every field in the provided item must match. This means `$remove` and `$upsert` work, but `$update` is a no-op (there are no key fields to locate the target element for a partial update):

```typescript
await table.updateOne({ id: 1, logs: { $insert: [{ message: 'Deployed', ts: Date.now() }] } })
await table.updateOne({ id: 1, logs: { $remove: [{ message: 'Deployed', ts: 1710000000 }] } })
await table.updateOne({ id: 1, logs: { $replace: [] } })
```

For anything beyond simple append/remove, add `@expect.array.key` to enable key-based matching.

### JSON Fields

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

## Combining Operators

Multiple operators can be used on the same field, and multiple fields can be patched in one request:

```typescript
await tasks.updateOne({
  id: 1,
  comments: {
    $remove: [{ id: 3 }],
    $update: [{ id: 7, body: 'Revised' }],
    $insert: [{ body: 'New comment', authorId: 1 }],
  },
  tags: { $insert: [{ name: 'reviewed' }] },
  title: 'Updated title',
})
```

Operators are always applied in order: **remove → update → upsert → insert** — regardless of the order they appear in the object.

## Nested Object Update Strategies {#nested-objects}

Non-array nested objects do **not** support patch operators. Instead, they use a strategy-based approach controlled by `@db.patch.strategy`:

- **`"replace"`** (default) — the entire nested object is overwritten. Omitted fields are lost.
- **`"merge"`** — only provided fields are updated. Existing fields are preserved.

```atscript
@db.patch.strategy 'merge'
address: {
    line1: string
    line2?: string
    city: string
}
```

```typescript
// With merge strategy: only city changes, line1 and line2 are preserved
await table.updateOne({ id: 1, address: { city: 'Seattle' } })

// With replace strategy (default): the whole address is overwritten —
// line2 would be lost if not provided
await table.updateOne({ id: 1, address: { line1: '123 New St', city: 'Portland' } })
```

## Next Steps

- [Deep Operations](./deep-operations) — nested creation and replacement across relations
- [Relations](./relations) — defining TO, FROM, and VIA relations
- [Views](./views) — read-only projections and materialized views

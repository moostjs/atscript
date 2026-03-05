# Patch Operations

::: warning Experimental
DB Adapters are experimental. APIs may change at any moment.
:::

When updating records that contain arrays, simple field replacement isn't always sufficient. Atscript's DB layer defines structured patch operations that let you insert, update, upsert, and remove individual array elements. Currently, **only MongoDB supports the full set of patch operators** — see [Adapter Support](#adapter-support) for details.

## Array Patch Operators

For fields typed as arrays, `updateOne` accepts patch operators instead of raw values:

```typescript
await orders.updateOne({
  id: 1,
  items: {
    $insert: [{ productId: 3, quantity: 1 }],    // append new items
  }
})
```

### `$replace`

Replace the entire array:

```typescript
await orders.updateOne({
  id: 1,
  items: {
    $replace: [
      { productId: 1, quantity: 2 },
      { productId: 2, quantity: 1 },
    ]
  }
})
```

### `$insert`

Append items to the array:

```typescript
await orders.updateOne({
  id: 1,
  items: {
    $insert: [{ productId: 3, quantity: 1 }]
  }
})
```

### `$upsert`

Insert or replace elements by key. If an element with a matching key exists, it's replaced; otherwise the new element is appended.

```typescript
await orders.updateOne({
  id: 1,
  items: {
    $upsert: [{ productId: 2, quantity: 5 }]  // update quantity if productId=2 exists
  }
})
```

### `$update`

Partially update elements matching by key:

```typescript
await orders.updateOne({
  id: 1,
  items: {
    $update: [{ productId: 2, quantity: 3 }]  // only update quantity for productId=2
  }
})
```

### `$remove`

Remove elements matching by key:

```typescript
await orders.updateOne({
  id: 1,
  items: {
    $remove: [{ productId: 2 }]  // remove items where productId=2
  }
})
```

## Array Keys

Array patch operations use **keys** to identify elements. Keys are defined with the `@expect.array.key` annotation on fields within the array element type:

```atscript
@db.table 'orders'
export interface Order {
    @meta.id
    id: number

    items: OrderItem[]
}

interface OrderItem {
    @expect.array.key
    productId: number

    quantity: number
    price: number
}
```

With `@expect.array.key` on `productId`, the patch operations `$upsert`, `$update`, and `$remove` will match elements by their `productId` value.

::: tip @expect.array.key vs @expect.array.uniqueItems
`@expect.array.key` **identifies** which fields form an element's identity — it's used by patch operations to locate elements, but does **not** enforce uniqueness during validation.

To also **enforce** that no two elements share the same key values, add `@expect.array.uniqueItems` on the array field:

```atscript
@expect.array.uniqueItems   // reject duplicates during validation
items: OrderItem[]
```

`@expect.array.uniqueItems` works with both primitive arrays (e.g., `string[]` — checked by deep equality) and object arrays (checked by key fields if defined, otherwise by deep equality).
:::

## Adapter Support

::: warning Not all adapters support all patch operators
Array patch operations beyond `$replace` are **currently only supported by MongoDB**. Check the support matrix below before using patch operators.
:::

| Operator | MongoDB | SQLite / Relational (embedded JSON) | Relational (child tables) |
|----------|---------|-------------------------------------|---------------------------|
| `$replace` | Yes | Yes | _Planned_ |
| `$insert` | Yes | No | _Planned_ |
| `$upsert` | Yes | No | _Planned_ |
| `$update` | Yes | No | _Planned_ |
| `$remove` | Yes | No | _Planned_ |

### MongoDB (native patches)

MongoDB supports all five patch operators natively. The adapter translates them into aggregation pipeline expressions (`$reduce`, `$filter`, `$concatArrays`, `$setUnion`, `$setDifference`) executed atomically in a single `updateOne` call. See [MongoDB Patch Pipelines](./mongodb-patches) for implementation details.

### Relational adapters — embedded JSON columns

Relational adapters like SQLite store arrays as JSON columns. In this mode, only **`$replace`** is supported — it replaces the entire JSON value. The granular operators (`$insert`, `$upsert`, `$update`, `$remove`) are **not supported** because the adapter has no way to manipulate individual elements within a JSON column.

If you need granular array operations on a relational database, use `$replace` with the full updated array, or wait for child table support (see below).

### Relational adapters — child tables (planned)

In the future, relational adapters will support arrays modeled as **child tables** (one-to-many relations with foreign keys). In this mode, all five patch operators will be supported and translated into standard SQL DML:

- `$insert` → `INSERT INTO child_table ...`
- `$upsert` → `INSERT ... ON CONFLICT DO UPDATE`
- `$update` → `UPDATE child_table WHERE key = ...`
- `$remove` → `DELETE FROM child_table WHERE key = ...`
- `$replace` → `DELETE all + INSERT`

This feature is not yet implemented.

## TypeScript Types

```typescript
import type { TArrayPatch, TDbPatch } from '@atscript/utils-db'
```

| Type | Description |
|------|-------------|
| `TArrayPatch<A>` | Patch operators for an array field (`$replace`, `$insert`, `$upsert`, `$update`, `$remove`) |
| `TDbPatch<T>` | Full patch type — scalar fields accept partial values, array fields accept `TArrayPatch` |

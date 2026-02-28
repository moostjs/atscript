# Patch Operations

::: warning Experimental
DB Integrations are experimental. APIs may change at any moment.
:::

When updating records that contain arrays, simple field replacement isn't always sufficient. Atscript's DB layer supports structured patch operations that let you insert, update, upsert, and remove individual array elements.

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
    @db.id
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

## Native vs Decomposed Patches

How patches are executed depends on the database adapter:

- **Native patch** — If the adapter supports native array operations (e.g., MongoDB's `$push`, `$pull`, `$set`), the patch is passed directly to the adapter. The adapter's `supportsNativePatch()` returns `true`.

- **Decomposed patch** — If the adapter doesn't support native array operations (e.g., SQLite), patches are decomposed into flat update operations using `decomposePatch()`. This converts the structured patch into a format the adapter can execute.

```typescript
import { decomposePatch } from '@atscript/utils-db'

// Converts patch operators into flat update data
const flatData = decomposePatch(payload, table)
```

## Patch Types

```typescript
import type { TArrayPatch, TDbPatch } from '@atscript/utils-db'
```

| Type | Description |
|------|-------------|
| `TArrayPatch<A>` | Patch operators for an array field (`$replace`, `$insert`, `$upsert`, `$update`, `$remove`) |
| `TDbPatch<T>` | Full patch type — scalar fields accept partial values, array fields accept `TArrayPatch` |

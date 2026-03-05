# MongoDB Patch Operations

::: warning Experimental
The MongoDB adapter is experimental. APIs may change at any moment.
:::

MongoDB's adapter uses **aggregation pipelines** for patch operations instead of the classic `$set`/`$push`/`$pull` update operators. This gives full control over array manipulation in a single atomic `updateOne` call.

For the general patch API and operator reference, see [Patch Operations](./patch-operations).

## How It Works

When you call `updateOne` with array patch operators, the `CollectionPatcher` class translates your payload into a MongoDB aggregation pipeline consisting of `$set` stages. Each array operation becomes a pipeline expression using `$reduce`, `$filter`, `$map`, `$concatArrays`, `$setUnion`, or `$setDifference`.

```typescript
await orders.updateOne({
  _id: someId,
  name: 'Updated Name',           // simple field → $set
  items: {
    $insert: [{ productId: 3 }],  // array op → aggregation expression
  },
})
```

This produces a pipeline like:

```javascript
[{
  $set: {
    name: 'Updated Name',
    items: {
      $concatArrays: [
        { $ifNull: ['$items', []] },
        [{ productId: 3 }]
      ]
    }
  }
}]
```

## Patch Strategies for Nested Objects

Nested objects support two patch strategies, controlled by the `@db.patch.strategy` annotation:

### Replace Strategy (Default)

The entire nested object is replaced. All required fields must be provided:

```atscript
@db.patch.strategy 'replace'
address: {
    line1: string
    city: string
    state: string
    zip: string
}
```

```typescript
// Must provide all required fields
await users.updateOne({
  _id: id,
  address: { line1: '123 Main St', city: 'NY', state: 'NY', zip: '10001' },
})
// → $set: { address: { line1: '123 Main St', ... } }
```

### Merge Strategy

Individual fields within the nested object can be updated independently. The object is flattened to dot-notation paths:

```atscript
@db.patch.strategy 'merge'
contacts: {
    email: string
    phone: string
}
```

```typescript
// Only update email, leave phone unchanged
await users.updateOne({
  _id: id,
  contacts: { email: 'new@example.com' },
})
// → $set: { 'contacts.email': 'new@example.com' }
```

Strategies can be mixed at different nesting levels:

```atscript
@db.patch.strategy 'merge'
settings: {
    @db.patch.strategy 'replace'
    theme: { primary: string, secondary: string }

    @db.patch.strategy 'merge'
    notifications: { email: boolean, push: boolean }
}
```

## Array Operations in Detail

### `$replace` — Full Array Replacement

Replaces the entire array with a new value. Produces a simple `$set`:

```typescript
await orders.updateOne({
  _id: id,
  items: { $replace: [{ productId: 1, qty: 2 }] },
})
```

```javascript
// Pipeline:
[{ $set: { items: [{ productId: 1, qty: 2 }] } }]
```

### `$insert` — Append Items

Behavior depends on whether the array has keys or `@expect.array.uniqueItems`:

**Plain array (no keys, no uniqueItems)** — uses `$concatArrays`:

```javascript
[{
  $set: {
    items: {
      $concatArrays: [{ $ifNull: ['$items', []] }, [/* new items */]]
    }
  }
}]
```

**Array with `@expect.array.key` or `@expect.array.uniqueItems`** — delegates to the `$upsert` logic to prevent duplicates (see below).

### `$upsert` — Insert or Replace by Key

For **keyed arrays**, removes any existing element matching the key(s) and appends the new element. Uses `$reduce` with `$filter` + `$concatArrays`:

```atscript
items: {
    @expect.array.key
    productId: number
    quantity: number
    price: number
}[]
```

```typescript
await orders.updateOne({
  _id: id,
  items: { $upsert: [{ productId: 2, quantity: 5, price: 10 }] },
})
```

```javascript
// Pipeline: for each candidate, filter out matching elements then append
[{
  $set: {
    items: {
      $reduce: {
        input: [{ productId: 2, quantity: 5, price: 10 }],
        initialValue: { $ifNull: ['$items', []] },
        in: {
          $let: {
            vars: { acc: '$$value', cand: '$$this' },
            in: {
              $concatArrays: [
                {
                  $filter: {
                    input: '$$acc', as: 'el',
                    cond: { $not: { $eq: ['$$el.productId', '$$cand.productId'] } }
                  }
                },
                ['$$cand']
              ]
            }
          }
        }
      }
    }
  }
}]
```

For **non-keyed arrays**, uses `$setUnion` for deep-equality deduplication:

```javascript
[{
  $set: {
    tags: { $setUnion: [{ $ifNull: ['$tags', []] }, ['new-tag']] }
  }
}]
```

### `$update` — Partial Update by Key

For **keyed arrays**, maps over the array and replaces or merges matching elements. The behavior depends on `@db.patch.strategy`:

**Replace strategy (default)** — matching element is fully replaced:

```javascript
// $cond: if keys match → replace with $$this, else keep $$el
$cond: [
  { $eq: ['$$el.productId', '$$this.productId'] },
  '$$this',    // replace
  '$$el'       // keep
]
```

**Merge strategy** — matching element is merged using `$mergeObjects`:

```atscript
@db.patch.strategy 'merge'
items: {
    @expect.array.key
    id: string
    value: string
    label?: string
}[]
```

```javascript
// $cond: if keys match → merge, else keep
$cond: [
  { $eq: ['$$el.id', '$$this.id'] },
  { $mergeObjects: ['$$el', '$$this'] },  // merge
  '$$el'
]
```

For **non-keyed arrays**, `$update` behaves like `$setUnion` (insert-if-missing).

### `$remove` — Remove by Key

For **keyed arrays**, filters out elements whose key(s) match any item in the removal list:

```typescript
await orders.updateOne({
  _id: id,
  items: { $remove: [{ productId: 2 }] },
})
```

```javascript
// Pipeline: filter out elements matching any removal candidate
[{
  $set: {
    items: {
      $let: {
        vars: { rem: [{ productId: 2 }] },
        in: {
          $filter: {
            input: { $ifNull: ['$items', []] }, as: 'el',
            cond: {
              $not: {
                $anyElementTrue: {
                  $map: {
                    input: '$$rem', as: 'r',
                    in: { $eq: ['$$el.productId', '$$r.productId'] }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}]
```

For **non-keyed arrays**, uses `$setDifference` for deep-equality removal:

```javascript
[{
  $set: {
    tags: { $setDifference: [{ $ifNull: ['$tags', []] }, ['old-tag']] }
  }
}]
```

## Composite Keys

Arrays can have multiple key fields. All keys must match for an element to be identified:

```atscript
translations: {
    @expect.array.key
    lang: string
    @expect.array.key
    region: string
    text: string
}[]
```

With composite keys, the equality check uses `$and`:

```javascript
{
  $and: [
    { $eq: ['$$el.lang', '$$this.lang'] },
    { $eq: ['$$el.region', '$$this.region'] }
  ]
}
```

Single-key arrays produce a bare `$eq` without the `$and` wrapper.

## Combining Operations

Multiple patch operators can be applied to the same array in a single `updateOne` call. Each operator produces a separate `$set` pipeline stage, ensuring they execute sequentially:

```typescript
await orders.updateOne({
  _id: id,
  items: {
    $remove: [{ productId: 2 }],                   // first: remove
    $insert: [{ productId: 5, quantity: 1, price: 20 }],  // then: insert
  },
})
```

```javascript
// Two separate pipeline stages for the same field:
[
  { $set: { items: { /* $remove expression */ } } },
  { $set: { items: { /* $insert expression */ } } },
]
```

Different array fields patched in the same call share a single `$set` stage when there's no key collision:

```typescript
await orders.updateOne({
  _id: id,
  items: { $replace: [{ productId: 1, quantity: 2, price: 10 }] },
  tags: { $insert: ['urgent'] },
})
```

```javascript
// Single $set stage with both fields:
[{
  $set: {
    items: [{ productId: 1, quantity: 2, price: 10 }],
    tags: { $concatArrays: [{ $ifNull: ['$tags', []] }, ['urgent']] }
  }
}]
```

## Empty Arrays

All array operations gracefully handle empty inputs — `$insert: []`, `$remove: []`, `$upsert: []`, and `$update: []` are no-ops that produce no pipeline stages.

## `@expect.array.uniqueItems`

When an array field is annotated with `@expect.array.uniqueItems`, `$insert` operations automatically use `$setUnion` instead of `$concatArrays`, preventing duplicate entries:

```atscript
@expect.array.uniqueItems
tags: string[]
```

```typescript
// Even though $insert is used, duplicates are prevented:
await posts.updateOne({
  _id: id,
  tags: { $insert: ['typescript', 'mongodb'] },
})
// → $setUnion (not $concatArrays)
```

This applies to both primitive arrays and object arrays (which use deep equality when no keys are defined).

## See Also

- [Patch Operations](./patch-operations) — Generic patch API and operator reference
- [MongoDB Guide](./mongodb) — Setup, CRUD, and connection
- [MongoDB Annotations](./mongodb-annotations) — `@db.mongo.*` annotation reference

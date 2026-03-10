---
outline: deep
---

# Deep Operations

When inserting, replacing, or updating records, you can include related data inline — the DB layer handles the multi-phase orchestration automatically. Instead of manually creating parent records, wiring up foreign keys, and inserting children one by one, you pass a single nested payload and Atscript takes care of the rest.

## How Deep Operations Work

The table API detects navigation properties (fields defined with `@db.rel.to`, `@db.rel.from`, or `@db.rel.via`) in your payload and creates, updates, or deletes related records in the correct order. The entire operation is wrapped in a transaction, so if any phase fails, everything rolls back.

Navigation properties are the relation fields you define in your `.as` schema — the same ones used for [querying relations](./relations). When they appear in a write payload, they trigger deep processing instead of being stored directly.

## Nested Inserts

Deep inserts follow a 4-phase process to ensure foreign keys are resolved in the right order:

1. **Phase 1 — TO dependencies**: Parent records (via `@db.rel.to`) are created first, producing primary keys needed by the main record
2. **Phase 2 — Main record**: The record itself is inserted with FK fields automatically populated from phase 1
3. **Phase 3 — FROM dependents**: Child records (via `@db.rel.from`) are inserted with the main record's PK set as their FK
4. **Phase 4 — VIA entries**: For many-to-many relations, target records are created first, then junction table entries linking them to the main record

Here is an example inserting a Task with an inline Project (TO), Comments (FROM), and Tags (VIA):

```typescript
await taskTable.insertOne({
  title: 'Design homepage',
  project: { title: 'Website Redesign', ownerId: 1 },  // TO: created first
  comments: [                                              // FROM: created after
    { body: 'Looks good!', authorId: 2 },
  ],
  tags: [{ name: 'design' }, { name: 'frontend' }],       // VIA: targets + junctions
})
```

You never need to manually set `projectId` on the task or `taskId` on the comments — Atscript resolves the FK chain references from your schema and wires them up automatically.

## Nested Replaces (PUT)

A deep replace performs a full record swap including all relations. This is a 4-phase process similar to inserts, but with cleanup of old related data:

1. **TO relations**: Parent records are fully replaced
2. **Main record**: The record itself is replaced
3. **FROM relations**: Old child records are removed (orphan cleanup), then new children are inserted
4. **VIA relations**: Old junction entries are deleted, then new target records and junction entries are created

```typescript
await taskTable.replaceOne({
  id: 1,
  title: 'Redesign homepage',
  status: 'in-progress',
  projectId: 1,
  comments: [
    { body: 'Updated scope', authorId: 1 },
  ],
  tags: [
    { id: 5 },           // existing tag — junction entry created
    { name: 'urgent' },  // new tag — record + junction entry created
  ],
})
```

Sending an empty array removes all related records for that relation:

```typescript
await taskTable.replaceOne({
  id: 1,
  title: 'Solo task',
  status: 'done',
  projectId: 1,
  comments: [],  // deletes all comments for this task
  tags: [],      // removes all junction entries
})
```

## Nested Updates (PATCH)

Partial updates support relations, but with an important distinction between TO and collection relations:

- **TO relations**: Send changed fields plus the PK — the parent record is partially updated
- **FROM and VIA relations**: You **must** use patch operators (`$insert`, `$remove`, `$update`, `$upsert`, `$replace`) — plain arrays are not accepted

The reason is straightforward: a partial update cannot infer intent from a plain array. Should `comments: [{ body: 'Hi' }]` add a comment, replace all comments, or something else? Patch operators make your intent explicit.

```typescript
await taskTable.updateOne({
  id: 1,
  project: { id: 2, title: 'Updated Title' },  // TO: partial update
  comments: {                                      // FROM: requires operators
    $insert: [{ body: 'New comment', authorId: 1 }],
  },
  tags: {                                          // VIA: requires operators
    $insert: [{ name: 'urgent' }],
    $remove: [{ id: 3 }],
  },
})
```

You can combine multiple operators in a single relation field — for example, inserting new items and removing others in one call. See [Patch Operations](./patch-operations) for the full list of array operators and their behavior.

## Depth Control

By default, deep operations process up to 3 levels of nesting. You can adjust this with the `maxDepth` option:

```typescript
// Only process one level of related data
await taskTable.insertOne(data, { maxDepth: 2 })

// Process deeper nesting (e.g., Task → Project → Organization)
await taskTable.insertOne(data, { maxDepth: 5 })
```

If the payload contains navigational data that exceeds `maxDepth`, the operation throws an error rather than silently ignoring the nested data:

```
Error: Nested data in 'comments' exceeds maxDepth (1).
Increase maxDepth or strip nested data before writing.
```

This applies to all write operations — `insertOne`, `insertMany`, `replaceOne`, and `updateOne` will fail explicitly if navigational fields are present beyond the allowed depth.

## Automatic Transactions

All deep operations are wrapped in `adapter.withTransaction()`. If any phase fails — whether creating a parent record, inserting the main record, or adding children — the entire operation rolls back. No partial writes are left behind.

If you are already inside a transaction (e.g., from an explicit `withTransaction()` call), deep operations participate in the existing transaction rather than creating a nested one.

```typescript
await adapter.withTransaction(async () => {
  // Both deep inserts share the same transaction
  await taskTable.insertOne({ title: 'Task A', comments: [{ body: 'Note' }] })
  await taskTable.insertOne({ title: 'Task B', tags: [{ name: 'urgent' }] })
})
```

## Batch Deep Operations

`insertMany`, `bulkReplace`, and `bulkUpdate` all support nested data per item in the array. Each item goes through the same multi-phase process:

```typescript
await taskTable.insertMany([
  {
    title: 'Task A',
    project: { title: 'Project X', ownerId: 1 },
    comments: [{ body: 'Comment on A', authorId: 1 }],
  },
  {
    title: 'Task B',
    project: { title: 'Project Y', ownerId: 2 },
    tags: [{ name: 'backend' }],
  },
])
```

All records and their related data are processed within a single transaction.

## Next Steps

- [Patch Operations](./patch-operations) — Full reference for array patch operators (`$insert`, `$remove`, `$update`, `$upsert`, `$replace`)
- [Transactions](./transactions) — Explicit transaction management and nesting behavior
- [Relations](./queries) — Querying across related tables

---
outline: deep
---

# Deep Operations

When your tables have relations, you can insert, replace, and update records across multiple tables in a single call. Atscript handles the correct order of operations and wires up foreign keys automatically.

## Deep Inserts

Insert a record along with its related data:

```typescript
await taskTable.insertOne({
  title: 'New feature',
  status: 'todo',
  projectId: 1,
  // Create comments at the same time
  comments: [
    { body: 'Let\'s start with the API', authorId: 1 },
    { body: 'Don\'t forget tests', authorId: 2 },
  ],
})
```

### How It Works

Deep inserts happen in three phases:

1. **Parent dependencies first** (`@db.rel.to`) — If you provide a new parent object, it's created first so its primary key can be used as a FK
2. **Main record** — The record itself is inserted with all FKs resolved
3. **Child records** (`@db.rel.from`) — Related records are created with the new primary key wired in as their FK

For example, inserting a task with a new project and comments:

```typescript
await taskTable.insertOne({
  title: 'Design homepage',
  // Phase 1: create the project first
  project: { title: 'Website Redesign', ownerId: 1 },
  // Phase 2: insert the task (projectId auto-set from new project)
  // Phase 3: create comments (taskId auto-set from new task)
  comments: [
    { body: 'Start with wireframes', authorId: 1 },
  ],
})
```

### Batch Deep Inserts

Insert multiple records with their relations in one call:

```typescript
await taskTable.insertMany([
  {
    title: 'Task A',
    projectId: 1,
    comments: [{ body: 'Comment on A', authorId: 1 }],
  },
  {
    title: 'Task B',
    projectId: 1,
    comments: [{ body: 'Comment on B', authorId: 2 }],
  },
])
```

All records and their dependencies are created within a single transaction.

### Controlling Depth

By default, nesting goes up to 3 levels deep. Control this with `maxDepth`:

```typescript
await taskTable.insertOne(data, { maxDepth: 1 })
// Only one level of related data will be created
```

If the payload contains navigational data that exceeds `maxDepth`, an error is thrown to prevent silent data loss:

```
Error: Nested data in 'comments' exceeds maxDepth (1).
Increase maxDepth or strip nested data before writing.
```

This applies to all write operations — `insertOne`, `insertMany`, `replaceOne`, and `updateOne` will fail explicitly if navigational fields are present beyond the allowed depth.

## Deep Replace

Replace a record and its related data entirely:

```typescript
await taskTable.replaceOne({
  id: 1,
  title: 'Updated title',
  status: 'in-progress',
  projectId: 1,
  // Replace all comments for this task
  comments: [
    { id: 10, body: 'Updated comment', authorId: 1 },
  ],
  // Replace tags (via junction table)
  tags: [
    { id: 5 },
    { id: 8 },
  ],
})
```

Deep replace handles four phases:
1. Replace parent dependencies (`@db.rel.to`)
2. Replace the main record
3. Replace child records (`@db.rel.from`)
4. Update junction table entries (`@db.rel.via`)

## Deep Update

Partially update a record and its parent relations:

```typescript
await taskTable.updateOne({
  id: 1,
  status: 'done',
  // Update the parent project too
  project: { title: 'Updated project name' },
})
```

::: warning
Deep updates only support `@db.rel.to` (parent) relations. You cannot partially update child collections (`@db.rel.from`) or many-to-many (`@db.rel.via`) through `updateOne` — use `replaceOne` for that.
:::

## Transactions

All deep operations are automatically wrapped in a transaction. If any step fails, all changes are rolled back.

You can also create explicit transactions — see [Transactions](./transactions).

## Next Steps

- [Views](./views) — Create read-only views joining tables
- [CRUD Operations](./crud) — Full API reference for all data operations

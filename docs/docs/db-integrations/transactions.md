---
outline: deep
---

# Transactions

Transactions ensure that multiple database operations either all succeed or all roll back together. If any operation within a transaction fails, every change made during that transaction is reverted, leaving your database in a consistent state.

## Basic Usage

Call `withTransaction()` on any adapter to wrap a group of operations:

```typescript
const adapter = db.getAdapter(User)

await adapter.withTransaction(async () => {
  await users.insertOne({ email: 'alice@example.com', name: 'Alice' })
  await todos.insertOne({ title: 'Welcome task', ownerId: 1 })
})
```

If any operation throws, the entire transaction rolls back. Neither the user nor the todo will be inserted.

## Cross-Table Transactions

When using `DbSpace`, all tables share the same adapter factory. Get any adapter to start a transaction — it applies to all operations in the same async context:

```typescript
const db = new DbSpace(adapterFactory)
const users = db.getTable(User)
const projects = db.getTable(Project)
const tasks = db.getTable(Task)

const adapter = db.getAdapter(User)

await adapter.withTransaction(async () => {
  // Operations on different tables within the same transaction
  const result = await users.insertOne({ name: 'Alice', email: 'alice@example.com' })
  await projects.insertOne({ title: 'New Project', ownerId: result.insertedId })
  await tasks.insertMany([
    { title: 'Setup', projectId: 1 },
    { title: 'Deploy', projectId: 1 },
  ])
})
```

Because all tables originate from the same `DbSpace`, they share the underlying adapter and participate in the same transaction.

## Automatic Nesting

Transactions use `AsyncLocalStorage` for context tracking. Nested `withTransaction()` calls reuse the outer transaction — no savepoints are created, and no extra `BEGIN`/`COMMIT` pairs are issued:

```typescript
await adapter.withTransaction(async () => {
  await users.insertOne({ name: 'Alice', email: 'alice@example.com' })

  // Inner transaction reuses outer — no extra BEGIN/COMMIT
  await adapter.withTransaction(async () => {
    await tasks.insertOne({ title: 'Welcome task', ownerId: 1 })
  })
})
```

This means library code can safely call `withTransaction()` without worrying about whether the caller has already started one. If a transaction is active, the inner call joins it; otherwise, a new one begins.

## Deep Operations Are Transactional

All deep operations (nested inserts, replaces, updates) automatically wrap themselves in a transaction. You don't need to call `withTransaction()` explicitly for:

- `insertOne` / `insertMany` with nested relation data
- `replaceOne` / `bulkReplace` with nested data
- `updateOne` / `bulkUpdate` with nested data
- `deleteOne` with cascade behavior

For example, inserting a user with related tasks and project references runs as a single atomic operation internally — if any part fails, all changes roll back.

## Error Handling and Rollback

When an error is thrown inside `withTransaction()`, the transaction rolls back and the error propagates to the caller:

```typescript
try {
  await adapter.withTransaction(async () => {
    await users.insertOne({ email: 'alice@example.com', name: 'Alice' })
    throw new Error('Something went wrong')
    // User is NOT inserted — entire transaction rolls back
  })
} catch (error) {
  console.log('Transaction rolled back:', error.message)
}
```

This applies to any kind of failure — validation errors, constraint violations, or application-level errors. The database remains in the state it was in before the transaction began.

## Adapter Support

| Adapter | Transaction Support | Notes |
|---------|-------------------|-------|
| SQLite | Full | Via `BEGIN` / `COMMIT` / `ROLLBACK` |
| MongoDB | Replica set only | Requires replica set or mongos topology |

MongoDB on standalone (single-node) gracefully disables transactions — operations run without transactional guarantees. No errors are thrown; the adapter simply skips `BEGIN` and `COMMIT`. This allows the same application code to work in both development (standalone) and production (replica set) environments.

## When to Use Explicit Transactions

**Use `withTransaction()` when:**

- Multiple independent writes must be atomic
- Custom business logic spans multiple tables
- Batch operations where partial completion is unacceptable
- You need to coordinate reads and writes consistently

**You do NOT need explicit transactions for:**

- Single record operations (already atomic)
- Deep operations with nested data (auto-wrapped)
- Read-only queries (no mutations to protect)

## Next Steps

- [Deep Operations](./deep-operations) — Auto-transactional nested CRUD
- [Schema Sync](./schema-sync) — Automatic schema migrations
- [CRUD Operations](./crud) — Basic create, read, update, delete

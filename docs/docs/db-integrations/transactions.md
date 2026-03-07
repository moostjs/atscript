---
outline: deep
---

# Transactions

Wrap multiple operations in a transaction to ensure they all succeed or all fail.

## Using Transactions

Call `withTransaction()` on any table or adapter:

```typescript
await userTable.withTransaction(async () => {
  await userTable.insertOne({ name: 'Alice', email: 'alice@example.com' })
  await projectTable.insertOne({ title: 'New Project', ownerId: 1 })
  // If projectTable.insertOne fails, the user insert is rolled back too
})
```

## Cross-Table Transactions

When using `DbSpace`, all tables from the same space share an adapter, so transactions span across them:

```typescript
const db = new DbSpace(adapterFactory)
const users = db.getTable(User)
const projects = db.getTable(Project)

await users.withTransaction(async () => {
  const result = await users.insertOne({ name: 'Alice', email: 'alice@example.com' })
  await projects.insertOne({ title: 'My Project', ownerId: result.insertedId })
})
```

## Automatic Transactions

Deep operations ([nested inserts, replaces, and updates](./deep-operations)) are automatically wrapped in transactions. You don't need to call `withTransaction()` explicitly for those.

## Nesting

Transactions nest automatically. If you call `withTransaction()` inside another transaction, the inner call joins the outer transaction:

```typescript
await users.withTransaction(async () => {
  await users.insertOne({ name: 'Alice' })

  await users.withTransaction(async () => {
    // This runs inside the same transaction
    await projects.insertOne({ title: 'Project', ownerId: 1 })
  })
})
```

## Adapter Support

| Adapter | Transaction Support |
|---------|-------------------|
| SQLite | Full support (BEGIN/COMMIT/ROLLBACK) |
| MongoDB | Requires replica set (auto-detected; silently disabled on standalone) |

## Next Steps

- [Schema Sync](./schema-sync) — Automatic schema migrations
- [Deep Operations](./deep-operations) — Auto-transactional nested CRUD

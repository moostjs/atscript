---
outline: deep
---

# Quick Start

This guide walks you through creating a simple database-backed application with Atscript and SQLite.

## 1. Install Dependencies

```bash
pnpm add @atscript/core @atscript/typescript @atscript/utils-db @atscript/db-sqlite better-sqlite3
```

## 2. Configure Atscript

Create `atscript.config.mts`:

```typescript
import { defineConfig } from '@atscript/core'
import ts from '@atscript/typescript'

export default defineConfig({
  rootDir: 'src',
  plugins: [ts()],
  format: 'dts',
  db: {
    adapter: '@atscript/db-sqlite',
    connection: './myapp.db',
  },
})
```

## 3. Define Your Schema

Create `src/schema/todo.as`:

```atscript
@db.table 'todos'
export interface Todo {
    @meta.id
    @db.default.fn 'increment'
    id: number

    title: string

    description?: string

    @db.default 'false'
    completed: boolean

    createdAt?: number.timestamp.created
}
```

This defines a `todos` table with:
- An auto-incrementing `id` primary key
- Required `title` and optional `description`
- A `completed` flag defaulting to `false`
- A `createdAt` timestamp set automatically on insert

## 4. Compile

```bash
npx asc
```

This generates TypeScript types (`.as.d.ts`) and runtime metadata (`.as.js`) from your `.as` files.

## 5. Sync Your Schema

Propagate your `.as` definitions to the database:

```bash
npx asc db sync
```

This inspects your schema, compares it against the database, and applies any changes — creating tables, adding columns, and syncing indexes as needed. See [Schema Sync](./schema-sync) for the full guide.

## 6. Use in Your Application

```typescript
import { DbSpace } from '@atscript/utils-db'
import { SqliteAdapter, BetterSqlite3Driver } from '@atscript/db-sqlite'
import { Todo } from './schema/todo.as'

// Create a database space with SQLite adapter
const driver = new BetterSqlite3Driver('./myapp.db')
const db = new DbSpace(() => new SqliteAdapter(driver))

// Get a typed table instance
const todos = db.getTable(Todo)

// Insert a record
await todos.insertOne({
  title: 'Learn Atscript',
})

// Query records
const all = await todos.findMany({
  filter: { completed: false },
  controls: { $sort: { createdAt: -1 } },
})

// Update a record
await todos.updateOne({
  id: 1,
  completed: true,
})

// Delete a record
await todos.deleteOne(1)
```

## Next Steps

- [Tables & Fields](./tables) — Field types, nested objects, column mappings
- [Defaults & Indexes](./defaults-indexes) — Auto-generated values and indexes
- [Relations](./foreign-keys) — Connect tables with foreign keys
- [Queries & Filters](./queries) — Advanced filtering, sorting, and pagination

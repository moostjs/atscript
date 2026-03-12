---
outline: deep
---

# Quick Start

<!--@include: ./_experimental-warning.md-->

This guide builds on the [TypeScript Quick Start](/packages/typescript/quick-start) — you will use the same `.as` model-driven workflow to create a SQLite-backed application with typed CRUD operations.

::: tip What You Will Build
A **Todo app** backed by a single SQLite table. At the end, a brief two-table example shows how relations work.
:::

::: info Recommended Reading
If you are new to Atscript, start with the [TypeScript Quick Start](/packages/typescript/quick-start) first. This guide assumes you are familiar with `.as` syntax and the compilation workflow.
:::

## 1. Install Dependencies

```bash
pnpm add @atscript/core @atscript/typescript @atscript/db-utils @atscript/db-sqlite better-sqlite3
```

## 2. Configure Atscript

Create `atscript.config.mts` in your project root:

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

The `db` section tells the CLI which adapter to use for schema sync and where to find your database file.

## 3. Define Your Schema

Create `src/schema/todo.as`:

```atscript
@db.table 'todos'
export interface Todo {
    @meta.id
    @db.default.increment
    id: number

    title: string

    description?: string

    @db.default 'false'
    completed: boolean

    @db.default.now
    createdAt?: number.timestamp
}
```

This defines a `todos` table with an auto-incrementing primary key, a required `title`, an optional `description`, a `completed` flag that defaults to `false`, and a `createdAt` timestamp set automatically on insert.

## 4. Compile

```bash
npx asc
```

This generates TypeScript types (`.as.d.ts`) and runtime metadata (`.as.js`) from your `.as` files.

## 5. Sync Your Schema

```bash
npx asc db sync
```

Schema sync inspects your `@db.*` annotations, compares them against the live database, and applies any changes — creating tables, adding columns, and syncing indexes. See [Schema Sync](./schema-sync) for details.

## 6. Use in Your Application

```typescript
import { DbSpace } from '@atscript/db-utils'
import { SqliteAdapter, BetterSqlite3Driver } from '@atscript/db-sqlite'
import { Todo } from './schema/todo.as'

// Create a database space with a SQLite adapter
const driver = new BetterSqlite3Driver('./myapp.db')
const db = new DbSpace(() => new SqliteAdapter(driver))

// Get a typed table
const todos = db.getTable(Todo)

// Insert
await todos.insertOne({ title: 'Learn Atscript' })

// Query with filter and sort
const pending = await todos.findMany({
  filter: { completed: false },
  controls: { $sort: { createdAt: -1 } },
})

// Update
await todos.updateOne({ id: 1, completed: true })

// Delete
await todos.deleteOne(1)
```

Every operation is fully typed — `insertOne` requires `title` (the only non-optional, non-defaulted field), and `findMany` returns `Todo[]` with the correct shape.

## 7. Bonus: Adding Relations

Suppose each todo belongs to a category. Add a second `.as` file:

```atscript
@db.table 'categories'
export interface Category {
    @meta.id
    @db.default.increment
    id: number

    name: string
}
```

Then update `todo.as` to reference it:

```atscript
import { Category } from './category.as'

@db.table 'todos'
export interface Todo {
    @meta.id
    @db.default.increment
    id: number

    title: string
    description?: string

    @db.default 'false'
    completed: boolean

    @db.default.now
    createdAt?: number.timestamp

    @db.rel.FK
    categoryId?: Category.id

    @db.rel.to
    category?: Category
}
```

Now you can load todos with their category in a single query:

```typescript
const todosWithCategory = await todos.findMany({
  controls: { $with: [{ name: 'category' }] },
})
// todosWithCategory[0].category?.name → 'Work'
```

See [Relations](./relations) for the full guide on TO, FROM, and VIA relation types.

## Next Steps

- [Tables & Fields](./tables) — Field types, nested objects, column mappings
- [Defaults & Indexes](./defaults-indexes) — Auto-generated values and indexes
- [Relations](./relations) — Foreign keys, reverse relations, and many-to-many
- [Queries & Filters](./queries) — Advanced filtering, sorting, and pagination

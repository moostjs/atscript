# DB Adapters

::: warning Experimental
DB Adapters are experimental. APIs may change at any moment.
:::

Atscript provides a database abstraction layer that turns annotated `.as` interfaces into fully functional database tables — with CRUD operations, validation, index management, and more — all driven by annotations.

## How It Works

The DB integration stack has three layers:

1. **Annotations** — `@db.*` annotations in your `.as` files declare table names, indexes, column mappings, defaults, and ignored fields. These are provided by `@atscript/core` and work with any database.

2. **Abstraction layer** (`@atscript/utils-db`) — The `AtscriptDbTable` class reads annotations from your types and provides a unified CRUD interface. The `BaseDbAdapter` abstract class defines what each database driver must implement.

3. **Database adapters** — Concrete adapter packages (like `@atscript/db-sqlite` or `@atscript/mongo`) implement the `BaseDbAdapter` for a specific database engine.

```
┌─────────────────────────────────┐
│  .as file with @db.* annotations│
└──────────────┬──────────────────┘
               │
┌──────────────▼──────────────────┐
│  AtscriptDbTable                │
│  (reads annotations, validates, │
│   maps columns, applies defaults│
│   flattens nested objects,      │
│   delegates CRUD to adapter)    │
└──────────────┬──────────────────┘
               │
┌──────────────▼──────────────────┐
│  BaseDbAdapter (abstract)       │
│  ├─ SqliteAdapter               │
│  ├─ MongoAdapter                │
│  └─ PostgresAdapter (planned)   │
└─────────────────────────────────┘
```

## Quick Example

Define a table in Atscript:

```atscript
@db.table 'users'
export interface User {
    @meta.id
    id: number

    @db.index.unique 'email_idx'
    @db.column 'email_address'
    email: string

    @db.default 'active'
    status: string

    @db.ignore
    displayName?: string
}
```

Use it in TypeScript:

```typescript
import { AtscriptDbTable } from '@atscript/utils-db'
import { SqliteAdapter, BetterSqlite3Driver } from '@atscript/db-sqlite'
import UserMeta from './user.as.js'

// Create adapter and table
const driver = new BetterSqlite3Driver('myapp.db')
const adapter = new SqliteAdapter(driver)
const users = new AtscriptDbTable(UserMeta, adapter)

// Create table and sync indexes
await users.ensureTable()
await users.syncIndexes()

// Insert
await users.insertOne({ id: 1, email: 'alice@example.com' })
// → status defaults to 'active', displayName is stripped

// Query
const user = await users.findOne({
  filter: { email: 'alice@example.com' },
  controls: {},
})

// Update
await users.updateOne({ id: 1, status: 'inactive' })

// Delete
await users.deleteOne({ id: 1 })
```

## What's in This Section

### Core Concepts

| Page | Description |
|------|-------------|
| [Core Annotations](./annotations) | Reference for all `@db.*` annotations |
| [DB Tables](./tables) | Working with `AtscriptDbTable` — the main entry point |
| [Queries & Filters](./queries) | Filter syntax, sorting, projection, and pagination |
| [Patch Operations](./patch-operations) | Array-level patch operations (`$insert`, `$upsert`, `$remove`, etc.) |

### Database Guides

| Page | Description |
|------|-------------|
| [SQLite Guide](./sqlite) | Install, setup, and use the SQLite adapter |
| [SQLite API Reference](./sqlite-api) | `SqliteAdapter`, `BetterSqlite3Driver`, `buildWhere` |
| [MongoDB Guide](./mongodb) | Install, setup, and use the MongoDB adapter |
| [MongoDB Annotations](./mongodb-annotations) | `@db.mongo.*` annotations and custom primitives |
| [MongoDB Search & Vectors](./mongodb-search) | Atlas Search and vector search |

### CRUD over HTTP

| Page | Description |
|------|-------------|
| [CRUD over HTTP Guide](./crud-http) | Expose database tables as REST endpoints with `@atscript/moost-db` |
| [URL Query Syntax](./crud-http-query-syntax) | `@uniqu/url` query string format for filtering, sorting, and pagination |
| [Customization](./crud-http-customization) | Hooks, overrides, and extending the controller |

### Advanced

| Page | Description |
|------|-------------|
| [Creating Adapters](./creating-adapters) | The `BaseDbAdapter` interface and how to build custom adapters |
| [Future Features](./future) | Phase 2 roadmap: relations, views, query expressions |

## Not an ORM

Atscript's data layer is **not** an ORM — it's something broader. An ORM's entire job is mapping objects to database tables. Atscript's job is being the single source of truth for *everything* about your data: types, validation, database schemas, UI metadata, API contracts, and documentation.

The database layer is one capability among many. Where an ORM stops at the database, Atscript keeps going — the same `.as` file that creates your table also drives TypeScript types, runtime validators, JSON Schema, and rich metadata for UI tools.

| | Traditional ORM | Atscript |
|---|---|---|
| **Scope** | Database only | Types + validation + DB + metadata + API schemas |
| **Schema source** | ORM-specific model classes | Language-agnostic `.as` files |
| **Validation** | Separate library (Zod, Joi, etc.) | Built into the type system |
| **UI metadata** | Manual config | Annotations on the same type |
| **Multi-database** | Usually one DB engine | Same `.as` file, swap the adapter |
| **Multi-language** | One language | Designed for any language target |

As the data layer matures (relations, joins, migrations are [on the roadmap](./future)), it will cover most ORM capabilities — but it will always be one part of a larger system. Think of it as an **annotation-driven data layer** inside a universal type definition language.

## Available Adapters

| Adapter | Package | Database | Status |
|---------|---------|----------|--------|
| [SQLite](./sqlite) | `@atscript/db-sqlite` | SQLite (via better-sqlite3 or node:sqlite) | Experimental |
| [MongoDB](./mongodb) | `@atscript/mongo` | MongoDB | Experimental |
| PostgreSQL | — | PostgreSQL | Planned |

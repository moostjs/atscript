---
outline: deep
---

# Database Integrations

<!--@include: ./_experimental-warning.md-->

Atscript's DB layer extends the `.as` model with database annotations — define tables, relations, views, and constraints in the same files that drive your TypeScript types. One model powers your types, validation, schema, and runtime queries.

::: info New to Atscript?
Start with the [TypeScript Quick Start](/packages/typescript/quick-start) to learn `.as` syntax and project setup. The DB layer builds on the same model.
:::

## How It Works

Add `@db.*` annotations to your `.as` definitions and the DB layer takes it from there:

```atscript
@db.table 'users'
export interface User {
    @meta.id
    @db.default.increment
    id: number

    @db.index.unique 'email_idx'
    email: string

    name: string

    @db.default.now
    createdAt?: number.timestamp
}
```

From this single definition you get:

- **TypeScript types** — fully typed interfaces and runtime metadata
- **Database schema** — tables, columns, indexes, and constraints
- **Validation** — automatic data validation from the same annotations
- **CRUD operations** — type-safe insert, find, update, and delete
- **Schema sync** — drift detection and automatic migrations via CLI

## Architecture

The DB layer is organized in three tiers:

| Layer | Role | Example |
|-------|------|---------|
| **Annotations** (`@db.*`) | Declare schema, indexes, relations, and views inside `.as` files | `@db.table`, `@db.rel.to`, `@db.view` |
| **Table API** (`AtscriptDbTable`) | Type-safe CRUD, relation loading, query translation, schema sync | `table.find()`, `table.insert()` |
| **Adapters** (`BaseDbAdapter`) | Database-specific drivers that implement the adapter interface | `SqliteAdapter`, `MongoAdapter` |

Your application code talks to the Table API. The adapter handles SQL generation, document mapping, or whatever your database needs — you never write driver-level code directly.

## What's Included

| Package | Purpose |
|---------|---------|
| `@atscript/core` | Ships all generic `@db.*` annotations — no extra install needed |
| `@atscript/db-utils` | Table API, views, relations, query translation, schema sync engine |
| `@atscript/db-sqlite` | SQLite adapter (better-sqlite3 or node:sqlite) |
| `@atscript/mongo` | MongoDB adapter with Atlas Search and vector search support |
| `@atscript/moost-db` | REST API controller for the Moost framework |

## Feature Highlights

- **Relations** — TO (foreign key), FROM (reverse 1:N), and VIA (M:N junction table) with explicit `$with` loading
- **Views** — managed, materialized, and external views defined with `@db.view` annotations
- **Array patch operators** — `$insert`, `$remove`, `$update`, `$upsert`, and `$replace` work across all adapters
- **Schema sync** — CLI-driven migrations with FNV-1a drift detection, column renames, and distributed locking
- **Transactions** — adapter-agnostic transaction support via `AsyncLocalStorage`
- **Adapter-agnostic design** — swap SQLite for MongoDB (or a future adapter) without changing application code

## Model-First, Not ORM-First

Atscript is a **model-first data layer**, not a traditional ORM. The `.as` model is the center of the system — the database is one consumer of that model, alongside TypeScript types, validators, and API metadata.

| | Traditional ORM | Atscript DB Layer |
|---|---|---|
| **Source of truth** | Entity classes or ORM config | Shared `.as` model |
| **Optimized for** | Object mapping and DB access | Reusing one model across types, validation, DB, and APIs |
| **Validation** | Separate library or DTO layer | Built into the same model |
| **Schema evolution** | ORM-specific migrations | Schema sync from `@db.*` annotations |
| **Relations** | Object graph with lazy loading | Explicit relation loading via `$with` |
| **Metadata reuse** | Mostly DB-focused | Same model powers validators, JSON Schema, and UI metadata |

## Next Steps

- [Quick Start](./quick-start) — build your first table in five minutes
- [Tables & Fields](./tables) — define columns, indexes, and defaults
- [Relations](./relations) — connect tables with TO, FROM, and VIA relations
- [CRUD Operations](./crud) — insert, query, update, and delete data

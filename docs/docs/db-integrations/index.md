---
outline: deep
---

# Database Integrations

Atscript's database layer is the next step after the TypeScript model workflow. Define tables, relations, views, and constraints directly in `.as` files, then use the same model at runtime with supported database integrations.

::: info Start with the Model
If you are new to Atscript, read the [TypeScript Quick Start](/packages/typescript/quick-start) first. The DB layer builds on the same `.as` model rather than introducing a separate schema system.
:::

## How It Works

Your `.as` files are the single source of truth. You define your schema once, and the DB layer handles the rest:

```atscript
@db.table 'users'
export interface User {
    @meta.id
    @db.default.fn 'increment'
    id: number

    @db.index.unique 'email_idx'
    email: string

    name: string

    createdAt?: number.timestamp.created
}
```

From this single definition, you get:

- **TypeScript types** — fully typed interfaces for your application code
- **Database schema** — tables, columns, indexes, constraints
- **Validation** — automatic data validation based on annotations
- **CRUD operations** — type-safe insert, find, update, delete
- **Schema sync** — automatic migrations via CLI

## Architecture

The DB layer has three tiers:

| Layer | What it does |
|-------|-------------|
| **Annotations** (`@db.*`) | Define schema, indexes, relations, and views in `.as` files |
| **Table API** (`AtscriptDbTable`) | Type-safe CRUD, relation loading, query translation |
| **Adapters** (`BaseDbAdapter`) | Database-specific drivers (SQLite, MongoDB, etc.) |

Your code interacts with the Table API. The adapter handles the database-specific details behind the scenes.

## What's Included

| Package | Purpose |
|---------|---------|
| `@atscript/core` | Ships all `@db.*` annotations |
| `@atscript/utils-db` | Table API, views, relations, schema sync engine |
| `@atscript/db-sqlite` | SQLite adapter (better-sqlite3 or node:sqlite) |
| `@atscript/mongo` | MongoDB adapter with Atlas Search support |
| `@atscript/moost-db` | REST API controller for Moost framework |

## Compared to ORMs

Atscript's DB layer is **not an ORM**. Here's how it differs:

| | Traditional ORM | Atscript DB |
|---|---|---|
| **Schema definition** | Language-specific decorators or config | Language-agnostic `.as` files |
| **Type safety** | Generated or manually synced | Derived from the same source |
| **Validation** | Separate library | Built into the schema |
| **Migrations** | Separate migration files | Automatic schema sync |
| **Relations** | Object graph with lazy loading | Explicit `$with` loading |
| **Query builder** | Method chaining | Filter expressions |

## Next Steps

- [Quick Start](./quick-start) — Build your first table in 5 minutes
- [Tables & Fields](./tables) — Learn how to define your schema
- [Relations](./foreign-keys) — Connect tables with foreign keys
- [Views](./views) — Create database views

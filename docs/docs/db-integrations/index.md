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

## Model-First, Not ORM-First

Atscript's DB layer grows out of the same `.as` model that already drives your TypeScript types, validation rules, and runtime metadata. The database layer is one consumer of that model, not the center of the system.

That is why Atscript is better described as a **model-first data layer with database integrations** than as a traditional ORM.

| | Traditional ORM | Atscript DB layer |
|---|---|---|
| **Primary source of truth** | Entity classes, decorators, or ORM config | Shared `.as` model |
| **What it optimizes for** | Object mapping and database access | Reusing one model across TS, validation, DB, and API tooling |
| **Validation** | Usually a separate library or DTO layer | Built into the same model |
| **Schema evolution** | Migrations or ORM-specific schema files | Schema sync from `@db.*` annotations |
| **Relations** | Object graph patterns, often with lazy loading | Explicit relation loading with `$with` |
| **Runtime metadata reuse** | Mostly DB-focused | The same model can also power validators, JSON Schema, and app-facing metadata |

If you are coming from an ORM, think of Atscript as a shared model layer with table APIs and adapters, not as an entity manager centered on database objects.

## Next Steps

- [Quick Start](./quick-start) — Build your first table in 5 minutes
- [Tables & Fields](./tables) — Learn how to define your schema
- [Relations](./foreign-keys) — Connect tables with foreign keys
- [Views](./views) — Create database views

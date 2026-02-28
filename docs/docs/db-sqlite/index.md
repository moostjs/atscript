# SQLite Adapter

::: warning Experimental
The SQLite adapter is experimental. APIs may change at any moment.
:::

`@atscript/db-sqlite` provides a SQLite adapter for the Atscript DB abstraction layer. It translates annotation-driven CRUD operations and MongoDB-style filters into SQL queries, with support for swappable SQLite driver implementations.

## Features

- Full CRUD operations (insert, find, update, replace, delete)
- Automatic table creation from Atscript field descriptors
- Index management (plain and unique indexes)
- MongoDB-style filter-to-SQL translation with parameterized queries
- Column mapping, defaults, and field ignoring via `@db.*` annotations
- Transaction support for bulk operations
- Swappable driver interface — use `better-sqlite3`, `node:sqlite`, or your own

## Installation

::: code-group
```bash [pnpm]
pnpm add @atscript/db-sqlite @atscript/utils-db better-sqlite3
```
```bash [npm]
npm install @atscript/db-sqlite @atscript/utils-db better-sqlite3
```
```bash [yarn]
yarn add @atscript/db-sqlite @atscript/utils-db better-sqlite3
```
:::

`better-sqlite3` is an optional peer dependency. You can use any SQLite driver that implements the `TSqliteDriver` interface.

## Limitations

- **Fulltext indexes** are skipped (not supported in basic SQLite)
- **Schema names** (`@db.schema`) are ignored (SQLite doesn't have schemas)
- **Objects and arrays** are stored as JSON strings in TEXT columns
- **Booleans** are stored as INTEGER (1/0)
- **Native array patches** are not supported — patches are decomposed into flat updates

## When to Use

The SQLite adapter is a good choice for:

- **Local-first applications** — Embedded database with zero configuration
- **Development and testing** — Fast setup with in-memory or file-based databases
- **CLI tools** — Ship a single binary with embedded storage
- **Prototyping** — Quickly test your Atscript data models before choosing a production database

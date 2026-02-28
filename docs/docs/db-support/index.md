# DB Support

Atscript provides a layered annotation system for database integration. Generic annotations under the `@db.*` namespace cover concepts shared across all databases, while database-specific plugins add their own annotations under namespaces like `@db.mongo.*`.

## Design Philosophy

Database metadata in Atscript follows two principles:

1. **Generic first** — Common concepts (table names, indexes, column mappings) are defined once in `@db.*` and work with any database plugin.
2. **Specific when needed** — Database-specific features (MongoDB's `_id` auto-injection, Atlas Search indexes, patch strategies) live in dedicated sub-namespaces like `@db.mongo.*`.

This means a single `.as` file can describe a data model that works with multiple databases, while still using database-specific features where needed.

## Core `@db.*` Annotations

These annotations are provided by Atscript core and are available to all database plugins.

| Annotation | Level | Arguments | Purpose |
|------------|-------|-----------|---------|
| `@db.table` | interface | `name` (string) | Names the database table or collection |
| `@db.schema` | interface | `name` (string) | Database schema (e.g. PostgreSQL schemas) |
| `@db.index.plain` | field | `name?`, `sort?` | Standard index; shared names create compound indexes |
| `@db.index.unique` | field | `name?` | Unique constraint index |
| `@db.index.fulltext` | field | `name?` | Fulltext search index |
| `@db.column` | field | `name` (string) | Override the database column/field name |
| `@db.default.value` | field | `value` (string) | Static default value |
| `@db.default.fn` | field | `fn` (string) | Database function for default value |
| `@db.ignore` | field | — | Exclude field from database operations |

### `@db.table`

Names the database table or collection. This is the primary annotation that marks an interface as a database entity.

```atscript
@db.table 'users'
export interface User {
    name: string
    email: string.email
}
```

The name argument is the table/collection name used by the database driver.

### `@db.index.plain`

Creates a standard index on a field. Fields sharing the same index name form a compound index.

```atscript
@db.table 'products'
export interface Product {
    @db.index.plain 'category_status'
    category: string

    @db.index.plain 'category_status'
    status: string

    @db.index.plain
    sku: string
}
```

Arguments: `name?` (optional index name), `sort?` (sort direction).

### `@db.index.unique`

Creates a unique index, enforcing that no two documents share the same value.

```atscript
@db.table 'users'
export interface User {
    @db.index.unique 'email_idx'
    email: string.email

    name: string
}
```

### `@db.index.fulltext`

Creates a fulltext search index for text-based searching.

```atscript
@db.table 'articles'
export interface Article {
    @db.index.fulltext
    title: string

    @db.index.fulltext
    body: string
}
```

### `@db.column`

Overrides the field name used in the database. The Atscript property name is used in code, while the column name is used in the database.

```atscript
@db.table 'users'
export interface User {
    @db.column 'full_name'
    name: string
}
```

### `@db.default.value` / `@db.default.fn`

Sets default values for fields.

```atscript
@db.table 'posts'
export interface Post {
    @db.default.value 'draft'
    status: string

    @db.default.fn 'now()'
    createdAt: string.isoDate
}
```

### `@db.ignore`

Excludes a field from database operations. The field exists in the type but is not persisted.

```atscript
@db.table 'users'
export interface User {
    name: string

    @db.ignore
    temporaryToken?: string
}
```

### `@db.schema`

Specifies a database schema name (for databases that support schemas like PostgreSQL).

```atscript
@db.table 'users'
@db.schema 'auth'
export interface User {
    name: string
}
```

## Database-Specific Plugins

Each database plugin extends the `@db.*` namespace with its own annotations:

| Plugin | Namespace | Package |
|--------|-----------|---------|
| MongoDB | `@db.mongo.*` | `@atscript/mongo` |

### MongoDB (`@db.mongo.*`)

The MongoDB plugin adds annotations for MongoDB-specific features. See the [MongoDB documentation](/packages/mongo/) for full details.

Key annotations:

- `@db.mongo.collection` — Optional; auto-injects `_id: mongo.objectId` if missing
- `@db.mongo.index.text weight` — Text index with weight (extends `@db.index.fulltext` with weight support)
- `@db.mongo.search.*` — Atlas Search index definitions
- `@db.mongo.patch.strategy` — Controls update behavior for objects and arrays
- `@db.mongo.array.uniqueItems` — Enforces set-semantics on array insertions

Example combining core and MongoDB annotations:

```atscript
@db.table 'users'
@db.mongo.collection
export interface User {
    @db.index.unique 'email_idx'
    email: string.email

    @db.mongo.index.text 5
    name: string

    @db.index.plain 'status_idx'
    isActive: boolean

    @db.mongo.patch.strategy 'merge'
    profile: {
        bio?: string
        avatar?: string
    }
}
```

## Adding Database Support

Database plugins are regular Atscript plugins that contribute annotations under the `@db.*` namespace. To create support for a new database:

1. Define your annotations in the `db.yourdb.*` namespace
2. Read core `@db.*` metadata in your runtime code
3. Add database-specific annotations for features not covered by core

See [Creating a Plugin](/plugin-development/) for the full plugin development guide.

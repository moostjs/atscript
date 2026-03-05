# Core `@db.*` Annotations

::: warning Experimental
DB Adapters are experimental. APIs may change at any moment.
:::

Atscript provides a layered annotation system for database integration. Generic annotations under the `@db.*` namespace cover concepts shared across all databases, while database-specific plugins add their own annotations under namespaces like `@db.mongo.*`.

## Design Philosophy

Database metadata in Atscript follows two principles:

1. **Generic first** — Common concepts (table names, indexes, column mappings) are defined once in `@db.*` and work with any database plugin.
2. **Specific when needed** — Database-specific features (MongoDB's `_id` auto-injection, Atlas Search indexes) live in dedicated sub-namespaces like `@db.mongo.*`.

This means a single `.as` file can describe a data model that works with multiple databases.

## Annotation Reference

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
| `@db.json` | field | — | Force a field to be stored as a single JSON column |

::: tip Primary Keys
Primary keys are declared with `@meta.id` (from the `@meta.*` namespace, not `@db.*`). See [Primary Keys](#primary-keys) below.
:::

## `@db.table`

Names the database table or collection. This is the primary annotation that marks an interface as a database entity.

```atscript
@db.table 'users'
export interface User {
    name: string
    email: string.email
}
```

The name argument is the table/collection name used by the database driver. If omitted, adapters may fall back to the interface name.

## `@db.schema`

Specifies a database schema name (for databases that support schemas like PostgreSQL). Not all adapters use this — SQLite ignores it.

```atscript
@db.table 'users'
@db.schema 'auth'
export interface User {
    name: string
}
```

## `@db.index.plain`

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

Arguments: `name?` (optional index name — auto-generated if omitted), `sort?` (`'asc'` or `'desc'`).

## `@db.index.unique`

Creates a unique index, enforcing that no two records share the same value. The index name is **optional** — when omitted, it is auto-generated from the field name:

```atscript
@db.table 'users'
export interface User {
    @db.index.unique
    email: string.email

    @db.index.unique
    username: string

    name: string
}
// → Two separate unique indexes (auto-named from field names)
```

You can also pass an explicit name: `@db.index.unique 'email_idx'`. An explicit name is only **required** when creating compound unique indexes.

To create a **compound unique index** (uniqueness enforced across the combination of fields), pass the **same index name** on multiple fields:

```atscript
@db.table 'tenants'
export interface TenantUser {
    @db.index.unique 'tenant_email'
    tenantId: string

    @db.index.unique 'tenant_email'
    email: string.email

    name: string
}
// → One compound unique index on (tenantId, email)
// Each tenantId can have the same email only once
```

Single-field unique indexes participate in [`findById` resolution](./tables#find-by-id) and contribute to the [`__pk` type](./tables#pk-type). Compound unique indexes do not, since they cannot be resolved from a single scalar value.

## `@db.index.fulltext`

Creates a fulltext search index for text-based searching. Not all adapters support this — SQLite skips fulltext indexes.

```atscript
@db.table 'articles'
export interface Article {
    @db.index.fulltext
    title: string

    @db.index.fulltext
    body: string
}
```

## `@db.column`

Overrides the field name used in the database. The Atscript property name is used in code, while the column name is used in the database.

```atscript
@db.table 'users'
export interface User {
    @db.column 'full_name'
    name: string
}
```

## `@db.default.value` / `@db.default.fn`

Sets default values for fields. `@db.default.value` sets a static string value. `@db.default.fn` specifies a function name for the adapter to resolve (e.g., `'now'`, `'uuid'`, `'increment'`).

```atscript
@db.table 'posts'
export interface Post {
    @db.default.value 'draft'
    status: string

    @db.default.fn 'now'
    createdAt: number
}
```

## `@db.ignore`

Excludes a field from database operations. The field exists in the type but is not persisted.

```atscript
@db.table 'users'
export interface User {
    name: string

    @db.ignore
    temporaryToken?: string
}
```

## Primary Keys

Primary keys use `@meta.id` — a general-purpose annotation from the `@meta.*` namespace (not `@db.*`). Multiple fields annotated with `@meta.id` form a composite primary key. `@meta.id` takes no arguments.

```atscript
@db.table 'users'
export interface User {
    @meta.id
    @db.default.fn 'increment'
    id: number

    name: string
}
```

Composite primary key:

```atscript
@db.table 'order_items'
export interface OrderItem {
    @meta.id
    orderId: number

    @meta.id
    productId: number

    quantity: number
}
```

## `@db.json`

Forces a field to be stored as a single JSON column instead of being flattened into separate columns. By default, nested object fields are flattened into `__`-separated columns (e.g., `contact: { email: string }` becomes a `contact__email` column). `@db.json` overrides this behavior.

```atscript
@db.table 'users'
export interface User {
    @meta.id
    id: number

    // Flattened by default → columns: contact__email, contact__phone
    contact: {
        email: string
        phone?: string
    }

    // Stored as single JSON column "preferences"
    @db.json
    preferences: {
        theme: string
        lang: string
    }

    // Arrays are always stored as JSON (no annotation needed)
    tags: string[]
}
```

When to use `@db.json`:
- **Opaque data** — metadata, settings, or config you don't need to query by individual keys
- **Deep nesting** — use `@db.json` on an intermediate field to cap flatten depth
- **Variable structure** — data where the shape changes frequently

::: tip
Array fields (`string[]`, `{ label: string }[]`) are always stored as JSON — no `@db.json` needed.
:::

::: warning
`@db.json` on a primitive field (string, number, boolean) has no effect and produces a warning. Most databases cannot index into JSON columns — placing `@db.index.*` on a `@db.json` field also produces a warning.
:::

See [Embedded Objects](./tables#embedded-objects) for the full flattening strategy.

## Database-Specific Extensions

Each database plugin can extend the `@db.*` namespace with its own annotations:

| Plugin | Namespace | Package | Docs |
|--------|-----------|---------|------|
| MongoDB | `@db.mongo.*` | `@atscript/mongo` | [MongoDB Annotations](./mongodb-annotations) |

Database-specific annotations are documented in their respective adapter sections.

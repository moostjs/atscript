---
outline: deep
---

# Defaults & Indexes

## Default Values

### Static Defaults

Set a fixed default value with `@db.default`:

```atscript
@db.default 'active'
status: string

@db.default 'false'
completed: boolean

@db.default 'medium'
priority: string
```

Static defaults are applied at insert time when the field is not provided.

### Generated Defaults

Use `@db.default.fn` for values generated automatically:

```atscript
@db.default.fn 'increment'
id: number
// Auto-incrementing integer (1, 2, 3, ...)

@db.default.fn 'uuid'
id: string
// Random UUID (e.g., "550e8400-e29b-41d4-a716-446655440000")

@db.default.fn 'now'
createdAt?: number
// Current timestamp at insert time
```

| Function | Type | Description |
|----------|------|-------------|
| `increment` | `number` | Auto-incrementing integer |
| `uuid` | `string` | Random UUID v4 |
| `now` | `number` | Current timestamp (milliseconds) |

::: tip Semantic Primitives Include Defaults
Semantic types like `number.timestamp.created` already include `@db.default.fn 'now'` — you don't need to add it yourself. Using semantic types keeps your schema concise:

```atscript
// Concise — semantic type handles the default
createdAt?: number.timestamp.created

// Verbose — only needed for plain number types
@db.default.fn 'now'
createdAt?: number
```

Fields with `@db.default.fn` are typically marked optional (`?`) since they don't need to be provided on insert.
:::

## Indexes

### Plain Index

Create a non-unique index for faster lookups:

```atscript
@db.index.plain 'name_idx'
name: string
```

### Unique Index

Enforce uniqueness with a unique index:

```atscript
@db.index.unique 'email_idx'
email: string
```

### Composite Indexes

Add the same index name to multiple fields to create a composite index:

```atscript
@db.index.plain 'name_created_idx'
name: string

@db.index.plain 'name_created_idx', 'desc'
createdAt: number
```

The optional second argument sets the sort direction (`'asc'` or `'desc'`).

### Full-Text Search Index

Mark fields for full-text search:

```atscript
@db.index.fulltext 'search_idx'
bio?: string
```

Full-text indexes are handled differently by each adapter:
- **SQLite** — Requires FTS5 extension (not auto-managed)
- **MongoDB** — Creates a text index; also supports Atlas Search via `@db.mongo.search.*`

### Multiple Indexes on One Field

A field can participate in multiple indexes:

```atscript
@db.index.plain 'name_idx'
@db.index.plain 'name_created_idx'
name: string
```

## Complete Example

```atscript
@db.table 'users'
@db.schema 'auth'
export interface User {
    @meta.id
    id: number

    @db.index.unique 'email_idx'
    @db.column 'email_address'
    email: string

    @db.index.plain 'name_idx'
    name: string

    @db.index.plain 'name_idx'
    @db.index.plain 'created_idx', 'desc'
    @db.default.fn 'now'
    createdAt: number

    @db.ignore
    displayName?: string

    @db.default 'active'
    status: string

    @db.index.fulltext 'search_idx'
    bio?: string
}
```

## Next Steps

- [Annotations Reference](./annotations) — Complete `@db.*` annotation list
- [Relations](./foreign-keys) — Connect tables with foreign keys

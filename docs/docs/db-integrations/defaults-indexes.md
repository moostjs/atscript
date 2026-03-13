---
outline: deep
---

# Defaults & Indexes

<!--@include: ./_experimental-warning.md-->

Atscript lets you set default values and create database indexes directly in your `.as` schema. Defaults ensure fields are populated automatically on insert, while indexes speed up queries and enforce constraints.

## Static Defaults

Use `@db.default` to assign a fixed value when a field is not provided at insert time. The argument is always a string — non-string values are parsed as JSON:

```atscript
// String default — used as-is
@db.default 'pending'
status: string

// Boolean default — parsed from JSON
@db.default 'false'
isArchived: boolean

// Number default — parsed from JSON
@db.default '0'
retryCount: number
```

## Generated Defaults

Some defaults need to be computed at insert time. Atscript provides three portable generated-default annotations:

### `@db.default.increment` — Auto-Incrementing Integer

Generates sequential integers (1, 2, 3, ...). The field must be a number type. An optional argument sets the starting value:

```atscript
@db.default.increment
id: number

// With optional start value:
@db.default.increment 1000
id: number
```

### `@db.default.uuid` — Random UUID

Generates a random UUID v4 string. The field must be a string type:

```atscript
@db.default.uuid
id: string
```

### `@db.default.now` — Current Timestamp

Captures the current time at insert. Works with number (Unix epoch milliseconds) and string (ISO format) types:

```atscript
@db.default.now
createdAt?: number
```

Timestamps use `number` (epoch milliseconds) rather than a `Date` type — this is deliberate. Numbers are JSON-native, so timestamps pass through HTTP boundaries (client ↔ server) without any serialization or hydration step. A `Date` type would require walking every response to convert strings back to `Date` instances on both sides.

::: tip Semantic Types Include Defaults
Semantic types like `number.timestamp.created` already include `@db.default.now` — you don't need to add it manually:

```atscript
// Concise — semantic type handles the default
createdAt?: number.timestamp.created

// Equivalent verbose form
@db.default.now
createdAt?: number
```

:::

## Column Storage Hints

### Collation

Use `@db.column.collate` to control how string comparison and sorting work. The value is portable — each adapter maps it to its native collation:

```atscript
@db.column.collate 'nocase'
username: string
```

| Value | Behavior |
|-------|----------|
| `'binary'` | Exact byte comparison (case-sensitive) |
| `'nocase'` | Case-insensitive comparison |
| `'unicode'` | Full Unicode-aware sorting |

For adapter-specific collations, use `@db.<engine>.collate` instead.

### Decimal Precision

Use `@db.column.precision` to set decimal precision and scale for database storage. Adapters map this to their native decimal type (e.g., `DECIMAL(10,2)` in SQL):

```atscript
@db.column.precision 10, 2
price: decimal
```

The `decimal` type stores values as strings at runtime (e.g., `"19.99"`) to preserve exact precision. This also means decimal values pass through JSON transport (client ↔ server) without any loss — no serialization or hydration step is needed. Use `decimal` for prices, financial amounts, and any field where floating-point rounding is unacceptable.

`@db.column.precision` also works on `number` fields for cases where you want a database-level decimal column but don't need string precision at runtime.

## Indexes

Indexes improve query performance and can enforce constraints. Atscript supports three index types through the `@db.index.*` annotations.

### Plain Index

Create a standard index for faster lookups with `@db.index.plain`. The first argument is the index name, and an optional second argument sets the sort direction (`'asc'` or `'desc'`):

```atscript
@db.index.plain 'name_idx'
name: string

@db.index.plain 'created_idx', 'desc'
createdAt: number
```

### Unique Index

Enforce that no two records share the same value with `@db.index.unique`:

```atscript
@db.index.unique 'email_idx'
email: string
```

Any attempt to insert a duplicate value will result in a constraint violation error.

### Full-Text Search Index

Mark fields for full-text search with `@db.index.fulltext`. An optional second argument sets the field's **weight** — higher weight means greater relevance in search results:

```atscript
@db.index.fulltext 'search_idx', 10
title: string

@db.index.fulltext 'search_idx', 1
body?: string
```

The weight defaults to `1` when omitted. Weighted full-text search is supported by databases like MongoDB and PostgreSQL. SQLite requires the FTS5 extension and does not auto-manage full-text indexes.

## Composite Indexes

When multiple fields share the same index name, they form a **composite index**. This is useful for queries that filter or sort on multiple columns together:

```atscript
@db.index.plain 'name_email_idx'
name: string

@db.index.plain 'name_email_idx'
email: string
```

This creates a single index spanning both `name` and `email`, which speeds up queries that filter on both fields simultaneously.

## Multiple Indexes Per Field

A single field can participate in more than one index. Simply stack multiple `@db.index.*` annotations:

```atscript
@db.index.unique 'email_idx'
@db.index.plain 'name_email_idx'
email: string
```

Here `email` has its own unique index and also participates in a composite index with another field.

## Complete Example

Putting it all together — a `User` table with defaults, generated values, and several index types:

```atscript
@db.table 'users'
export interface User {
    // Primary key with auto-increment
    @meta.id
    @db.default.increment
    id: number

    // Unique index ensures no duplicate emails
    @db.index.unique 'email_idx'
    email: string

    // Plain index for fast name lookups, also part of a composite index
    @db.index.plain 'name_idx'
    @db.index.plain 'name_status_idx'
    name: string

    // Static default — new users start as 'active'
    @db.default 'active'
    @db.index.plain 'name_status_idx'
    status: string

    // Full-text search on bio
    @db.index.fulltext 'search_idx'
    bio?: string

    // Auto-generated timestamps
    @db.default.now
    createdAt?: number

    @db.default.now
    updatedAt?: number
}
```

This gives you auto-incrementing IDs, a unique email constraint, composite and full-text indexes, a static default for `status`, and auto-generated timestamps -- all declared in one place.

## Next Steps

- [CRUD Operations](./crud) — Insert, read, update, and delete records
- [Queries & Filters](./queries) — Filter, sort, and paginate results
- [Relations](./relations) — Connect tables with foreign keys and joins

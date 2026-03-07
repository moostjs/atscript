---
outline: deep
---

# Tables & Fields

Every database table starts with an interface annotated with `@db.table`.

## Defining a Table

```atscript
@db.table 'users'
export interface User {
    @meta.id
    id: number

    name: string
    email: string
    bio?: string
}
```

- `@db.table 'users'` — maps this interface to a database table named `users`
- `@meta.id` — marks the primary key field
- Optional fields (`?`) become nullable columns

If you omit the table name, the interface name is used as-is:

```atscript
@db.table
export interface User { ... }
// Table name: "User"
```

## Field Types

Atscript fields map to database column types:

| Atscript Type | SQLite | MongoDB |
|--------------|--------|---------|
| `string` | TEXT | string |
| `number` | REAL | number |
| `boolean` | INTEGER (0/1) | boolean |
| `number.int` | INTEGER | number |
| `number.timestamp` | REAL | number |
| `string.email` | TEXT | string |
| Arrays | TEXT (JSON) | array |
| Objects | Flattened or JSON | embedded |

## Nested Objects

By default, nested objects are **flattened** into separate columns using `__` as a separator:

```atscript
@db.table 'profiles'
export interface Profile {
    @meta.id
    id: number

    name: string

    contact: {
        email: string
        phone?: string
    }
}
```

This creates three columns: `id`, `name`, `contact__email`, and `contact__phone`.

When you read data back, the flat columns are automatically reconstructed into the nested structure:

```typescript
const profile = await profiles.findOne({ filter: { id: 1 } })
// { id: 1, name: 'Alice', contact: { email: 'alice@...', phone: '...' } }
```

### Deeply Nested Objects

Flattening works at any depth:

```atscript
settings: {
    notifications: {
        email: boolean
        sms: boolean
    }
}
// Columns: settings__notifications__email, settings__notifications__sms
```

### Storing as JSON

If you prefer to store a nested object as a single JSON column instead of flattening, use `@db.json`:

```atscript
@db.json
preferences: {
    theme: string
    lang: string
}
// Single column: preferences (stored as JSON string)
```

This is useful for:
- Objects with many fields where you don't need individual column queries
- Dynamic or loosely-structured data
- Arrays of objects

::: tip
Arrays are **always** stored as JSON, regardless of `@db.json`. You only need `@db.json` for plain objects you want to keep as a single column.
:::

## Column Name Mapping

Override the physical column name with `@db.column`:

```atscript
@db.column 'email_address'
email: string
// Column in DB: email_address
// Field in code: email
```

## Excluding Fields

Use `@db.ignore` to exclude a field from the database schema. The field still exists in your TypeScript types but has no corresponding column:

```atscript
@db.ignore
displayName?: string
// No column created, not stored in DB
```

## Database Schema

Assign a table to a database schema (namespace) with `@db.schema`:

```atscript
@db.table 'users'
@db.schema 'auth'
export interface User { ... }
// Full table path: auth.users
```

## Composite Primary Keys

Annotate multiple fields with `@meta.id` to create a composite primary key:

```atscript
@db.table 'task_tags'
export interface TaskTag {
    @meta.id
    taskId: number

    @meta.id
    tagId: number

    assignedAt?: number.timestamp.created
}
```

## Querying Nested Fields

You can filter on nested object fields using dot notation:

```typescript
const results = await profiles.findMany({
  filter: { 'contact.email': 'alice@example.com' },
})
```

The dot-notation path is automatically translated to the physical column name (`contact__email`) before reaching the database.

## Next Steps

- [Defaults & Indexes](./defaults-indexes) — Auto-generated values and database indexes
- [Annotations Reference](./annotations) — Complete `@db.*` annotation list
- [Relations](./foreign-keys) — Connect tables with foreign keys

---
outline: deep
---

# Tables & Fields

<!--@include: ./_experimental-warning.md-->

Atscript lets you define database tables directly in `.as` files. Each table is an interface annotated with `@db.table` — the fields become columns, and annotations control how they map to the underlying database.

## Declaring a Table

Add `@db.table` to an interface to make it a database table:

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

The string argument sets the physical table name in the database. Optional fields (marked with `?`) become nullable columns.

If you omit the name, the interface name is used directly:

```atscript
@db.table
export interface User { ... }
// Table name: "User"
```

Providing an explicit name is recommended — it gives you control over casing and pluralization regardless of how you name your interface.

## Primary Keys

Mark the primary key with `@meta.id`:

```atscript
@db.table 'tasks'
export interface Task {
    @meta.id
    id: number

    title: string
    done: boolean
}
```

The `@meta.id` annotation takes no arguments. Every table should have at least one primary key field. When a `number` field is used as a primary key, SQLite maps it to `INTEGER` (rather than the default `REAL`), enabling auto-increment behavior.

## Composite Primary Keys

When multiple fields are annotated with `@meta.id`, they form a composite primary key. This is common for junction tables in many-to-many relationships:

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

Here, the combination of `taskId` and `tagId` uniquely identifies each row. Neither field alone is unique — only the pair together serves as the key.

### Composite Key Operations

All CRUD operations work with composite keys. For programmatic usage, pass an object with all key fields:

```typescript
// Find by composite key
const entry = await taskTags.findById({ taskId: 1, tagId: 2 })

// Delete by composite key
await taskTags.deleteOne({ taskId: 1, tagId: 2 })

// Replace by composite key (all fields required)
await taskTags.replaceOne({ taskId: 1, tagId: 2, assignedAt: Date.now() })

// Update by composite key (partial)
await taskTags.updateOne({ taskId: 1, tagId: 2, assignedAt: Date.now() })
```

Via HTTP, composite key fields are passed as query parameters:

```
GET    /task-tags/one?taskId=1&tagId=2
DELETE /task-tags/?taskId=1&tagId=2
```

Providing only some key fields results in a `400` error for operations that require the full key (getOne, delete, replace, update). For `findMany`, partial key fields act as regular filters:

```
GET /task-tags/query?taskId=1    # returns all tags for task 1
```

## Field Types

Atscript types map to database column types automatically:

| Atscript Type | SQLite | MongoDB |
|---------------|--------|---------|
| `string` | TEXT | string |
| `number` | REAL (INTEGER for PK) | number |
| `boolean` | INTEGER (0/1) | boolean |
| Arrays | TEXT (JSON) | native array |
| Nested objects | Flattened columns | native object (unless flattened) |

Semantic subtypes like `string.email`, `number.int`, and `number.timestamp` map to the same base column types. They carry meaning for validation and code generation, but the storage type follows the base type.

## Nested Objects

By default, nested objects are **flattened** into separate columns using `__` (double underscore) as a separator:

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

This creates four columns: `id`, `name`, `contact__email`, and `contact__phone`. When you read data back, the flat columns are automatically reconstructed into the nested object structure.

Flattening works recursively at any depth:

```atscript
settings: {
    notifications: {
        email: boolean
        sms: boolean
    }
}
// Columns: settings__notifications__email, settings__notifications__sms
```

You can filter on nested fields using dot notation in queries. The path is translated to the physical column name automatically:

```typescript
const results = await profiles.findMany({
  filter: { 'contact.email': 'alice@example.com' },
})
// Translates to: WHERE contact__email = 'alice@example.com'
```

## JSON Storage

Use `@db.json` to store a nested object as a single JSON column instead of flattening it:

```atscript
@db.json
preferences: {
    theme: string
    lang: string
    shortcuts: string[]
}
// Single column: preferences (stored as JSON string in SQLite, native object in MongoDB)
```

When to use `@db.json`:

- **Arrays** — always stored as JSON automatically, no annotation needed
- **Complex objects** you don't need to query by individual sub-fields
- **Dynamic or loosely-structured data** where flattening creates too many columns

::: tip
Arrays are always stored as JSON regardless of `@db.json`. You only need the annotation for plain objects you want to keep as a single column.
:::

## Custom Column Names

Override the physical column name with `@db.column`:

```atscript
@db.column 'email_address'
email: string
// Column in DB: email_address
// Field in code: email
```

For nested objects that are flattened, the parent prefix is prepended automatically. If you rename a parent field, all its flattened children reflect the new prefix.

## Excluding Fields

Use `@db.ignore` to keep a field in the type but exclude it from the database:

```atscript
@db.table 'users'
export interface User {
    @meta.id
    id: number

    name: string

    @db.ignore
    displayName?: string
    // Exists in TypeScript types, no column in DB
}
```

An ignored field cannot also be a primary key — `@db.ignore` and `@meta.id` on the same field is an error.

## Database Schemas

Assign a table to a schema or namespace with `@db.schema`:

```atscript
@db.table 'users'
@db.schema 'auth'
export interface User {
    @meta.id
    id: number
    name: string
}
// Full table path: auth.users
```

This is useful for organizing tables into logical groups, particularly with databases that support schemas natively (like PostgreSQL). SQLite adapters typically prefix the table name.

## Rename Tracking

When you rename a table or column, the schema sync system needs to know the old name to perform a rename migration rather than dropping and recreating:

```atscript
@db.table 'team_members'
@db.table.renamed 'users'
export interface TeamMember {
    @meta.id
    id: number

    @db.column.renamed 'name'
    fullName: string

    email: string
}
```

- `@db.table.renamed 'users'` — tells sync that this table was previously called `users`
- `@db.column.renamed 'name'` — tells sync that `fullName` was previously called `name`

These annotations are consumed during [Schema Sync](./schema-sync) and can be removed after the migration has been applied to all environments.

## Next Steps

- [Defaults & Indexes](./defaults-indexes) — Auto-generated values and database indexes
- [CRUD Operations](./crud) — Reading and writing data
- [Relations](./relations) — Foreign keys and table relationships

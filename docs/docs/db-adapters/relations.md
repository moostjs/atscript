# Relations & Foreign Keys

::: warning Experimental
DB Adapters are experimental. APIs may change at any moment.
:::

Atscript's `@db.rel.*` annotations declare foreign keys, navigational properties, and referential actions. Relations are explicit — the compiler never guesses FK direction, and every navigational property is opt-in at query time.

## Field Categories

A `@db.table` interface can have five kinds of fields:

| Pattern | Annotation | DB Column? | Meaning |
|---------|------------|------------|---------|
| `authorId: User.id` | `@db.rel.FK` | Yes | FK scalar — constraint generated |
| `someField: User.id` | (none) | Yes | Type borrowing — resolves type from chain ref, no FK |
| `address: Address` | (none) | Yes (inline) | Embedded type — `Address` has no `@db.table` |
| `author?: User` | `@db.rel.to` | **No** | Forward navigation — FK is on this interface |
| `comments: Comment[]` | `@db.rel.from` | **No** | Inverse navigation — FK is on the target |

A chain reference (`User.id`) without `@db.rel.FK` is type-only — it borrows the resolved type but creates no DB constraint. An interface reference without `@db.rel.*` is embedded — its fields are inlined into the parent's columns. With `@db.rel.to` or `@db.rel.from`, it becomes a navigational property — no DB column, loaded on demand.

## `@db.rel.FK` — Foreign Key Declaration

Marks a field as a foreign key. The field **must** use a chain reference type — the chain ref fully determines the FK target:

```atscript
@db.table "posts"
export interface Post extends Identifiable, Timestamped {
    @db.rel.FK
    @db.rel.onDelete "cascade"
    authorId: User.id

    title: string
    content: string
}
```

- **FK column** — the annotated field itself (`authorId`)
- **Target type** — resolved from the chain reference (`User`)
- **Target column** — the referenced field (`id`)

The chain ref target must be either a `@meta.id` field or a `@db.index.unique` field on the target type.

### Aliases

When multiple FKs on the same interface point to the same target type, aliases disambiguate:

```atscript
@db.rel.FK 'author'
authorId: User.id

@db.rel.FK 'editor'
editorId: User.id?
```

### Composite FK

Multiple fields sharing the same alias form a single composite FK constraint:

```atscript
@db.rel.FK 'subscription'
tenantId: Subscription.tenantId

@db.rel.FK 'subscription'
planId: Subscription.planId
```

The set of chain ref target fields must match either the `@meta.id` fields or a `@db.index.unique` field group on the target type.

## `@db.rel.to` — Forward Navigation

**"The FK is on MY interface."** Declares a navigational property where the FK exists on this same interface.

```atscript
@db.rel.to
author?: User              // finds authorId's @db.rel.FK → User
```

### Resolution

The compiler scans `@db.rel.FK` fields on **this** interface:

1. **Aliased** — find `.FK` with matching alias
2. **Unaliased** — find the single `.FK` whose chain ref resolves to the target type
3. Multiple matches without alias → error
4. No match → error

Navigational field names are freeform — resolution works by target type (or alias), not by naming convention.

```atscript
// With alias — matches @db.rel.FK 'author'
@db.rel.to 'author'
author?: User

// Without alias — auto-resolve the one .FK pointing to User
@db.rel.to
author?: User
```

## `@db.rel.from` — Inverse Navigation

**"The FK is ONLY on the other interface."** Declares a navigational property where the FK exists on the target type, pointing back to this interface.

```atscript
@db.rel.from
posts: Post[]              // finds Post's @db.rel.FK → User
```

### Resolution

The compiler scans `@db.rel.FK` fields on the **target** type:

1. **Aliased** — find `.FK` with matching alias on the target type
2. **Unaliased** — find the single `.FK` on the target whose chain ref resolves to this type
3. Multiple matches without alias → error
4. No match → error

### When to Use `.from` vs `.to`

| Situation | Annotation | Reason |
|-----------|------------|--------|
| Your interface has the FK | `.to` | FK is local |
| The other interface has the FK | `.from` | FK is remote |
| Both interfaces have FKs to each other | `.to` on both | Each side navigates via its own FK |

## `@db.rel.onDelete` / `@db.rel.onUpdate`

Referential actions on FK fields. Only valid on `@db.rel.FK` fields.

```atscript
@db.rel.FK
@db.rel.onDelete "cascade"
@db.rel.onUpdate "noAction"
authorId: User.id
```

| Action | Description |
|--------|-------------|
| `"cascade"` | Delete/update referencing records |
| `"restrict"` | Prevent if references exist |
| `"noAction"` | Like restrict, deferred check |
| `"setNull"` | Set FK to NULL (field must be `?`) |
| `"setDefault"` | Set FK to default value |

When omitted, the adapter defers to the database engine's default (`NO ACTION` for all major relational databases).

### Composite FK Rule

For composite FKs (multiple fields sharing the same alias), `@db.rel.onDelete`/`.onUpdate` must appear on exactly **one** field in the group.

## Cardinality

The `?` and `[]` modifiers on the navigational field encode cardinality — no separate syntax needed:

| Annotation | Field Type | Cardinality |
|------------|-----------|-------------|
| `.to` | `author: User` | Required many-to-one (or 1:1) |
| `.to` | `author?: User` | Optional many-to-one (or 0..1) |
| `.from` | `comments: Comment[]` | One-to-many |
| `.from` | `profile?: UserProfile` | Inverse 1:1 (unique FK on target) |

One-to-one is distinguished from many-to-one by `@db.index.unique` on the FK field:

```atscript
@db.table "user_profiles"
interface UserProfile {
    @db.rel.FK
    @db.index.unique               // unique FK → 1:1 with User
    @db.rel.onDelete "cascade"
    userId: User.id
}
```

## Relation Patterns

### One-to-Many

```atscript
@db.table "users"
export interface User extends Identifiable, Timestamped {
    @db.index.unique
    email: string.email
    name: string

    @db.rel.from                    // inverse — FK is on Post (authorId)
    posts: Post[]
}

@db.table "posts"
export interface Post extends Identifiable, Timestamped {
    @db.rel.FK
    @db.rel.onDelete "cascade"
    authorId: User.id

    title: string
    content: string

    @db.rel.to                      // forward — FK (authorId) is here
    author?: User
}
```

### One-to-One

```atscript
@db.table "users"
export interface User extends Identifiable {
    name: string

    @db.rel.from                    // inverse — unique FK on UserProfile
    profile?: UserProfile
}

@db.table "user_profiles"
export interface UserProfile extends Identifiable {
    @db.rel.FK
    @db.index.unique                // unique FK → 1:1
    @db.rel.onDelete "cascade"
    userId: User.id

    @db.rel.to
    user?: User

    bio: string?
    avatarUrl: string?
}
```

### Self-Referential

```atscript
@db.table "employees"
export interface Employee extends Identifiable {
    name: string

    @db.rel.FK 'manager'
    @db.rel.onDelete "setNull"
    managerId: Employee.id?

    @db.rel.to 'manager'           // forward — my managerId → my manager
    manager?: Employee

    @db.rel.from 'manager'         // inverse — other employees' managerId → me
    reports: Employee[]
}
```

The alias `'manager'` links all three fields. `.to` and `.from` make the FK direction unambiguous even in self-referential cases.

### FK-Only (No Navigation)

```atscript
@db.table "audit_events"
export interface AuditEvent extends Identifiable {
    @db.rel.FK
    @db.rel.onDelete "setNull"
    actorId: User.id?               // FK constraint, no navigation needed

    action: string
    payload: string
    createdAt: number.timestamp.created
}
```

FK constraint is generated. No `.to` field exists — no navigational property exposed.

### Multiple FKs to Same Type

```atscript
@db.table "posts"
export interface Post extends Identifiable {
    @db.rel.FK 'author'
    @db.rel.onDelete "cascade"
    authorId: User.id

    @db.rel.FK 'editor'
    editorId: User.id?

    title: string

    @db.rel.to 'author'
    author?: User

    @db.rel.to 'editor'
    editor?: User
}
```

Aliases are **required** when multiple FKs resolve to the same target type.

## Loading Relations at Runtime

Navigational properties are **not loaded by default**. Use the `$with` control to load them on demand.

### Basic Usage

```typescript
// Load author for each post
const posts = await postTable.findMany({
  filter: {},
  controls: {
    $with: [{ name: 'author' }],
  },
})
// posts[0].author → { id: 1, name: 'Alice', ... }
```

### Multiple Relations

```typescript
const posts = await postTable.findMany({
  filter: {},
  controls: {
    $with: [{ name: 'author' }, { name: 'comments' }],
  },
})
```

### Nested Relations

Each `$with` entry is a full query — it can have its own filter, controls, and nested `$with`:

```typescript
// Load posts with their comments
const users = await userTable.findMany({
  filter: {},
  controls: {
    $with: [{
      name: 'posts',
      controls: {
        $with: [{ name: 'comments' }],
      },
    }],
  },
})
// users[0].posts[0].comments → [{ body: 'Great!', ... }]
```

### Per-Relation Filters

```typescript
// Only load published posts
const users = await userTable.findMany({
  filter: {},
  controls: {
    $with: [{
      name: 'posts',
      filter: { status: 'published' },
    }],
  },
})
```

### Per-Relation Controls

```typescript
// Load latest 5 posts, sorted by creation date
const users = await userTable.findMany({
  filter: {},
  controls: {
    $with: [{
      name: 'posts',
      controls: {
        $sort: { createdAt: -1 },
        $limit: 5,
        $select: ['title', 'createdAt'],
      },
    }],
  },
})
```

### Combined (Multi-Level)

```typescript
// Load published posts with their recent comments
const users = await userTable.findMany({
  filter: { id: 1 },
  controls: {
    $with: [{
      name: 'posts',
      filter: { status: 'published' },
      controls: {
        $sort: { createdAt: -1 },
        $with: [{
          name: 'comments',
          filter: { body: { $regex: 'Great' } },
          controls: { $limit: 10 },
        }],
      },
    }],
  },
})
```

::: tip FK Fields in `$select`
When using `$select` on a relation, the FK fields needed for joining are automatically included — you don't need to add them manually.
:::

### Via HTTP

Relations can be loaded via URL query syntax. See [URL Query Syntax — `$with`](./crud-http-query-syntax#with-relation-loading) for the full syntax.

```
GET /posts/query?$with=author,comments
GET /users/query?$with=posts($sort=-createdAt&$limit=5)
GET /users/query?$with=posts(status=published&$with=comments(body~=Great))
```

## Query-Time Type Transformation

Navigational properties are always optional in the generated TypeScript type. They are not present in query results unless explicitly loaded via `$with`:

```typescript
// Base type — navigational properties are optional
type Post = {
    id: number
    authorId: number
    author?: User            // not loaded by default
    comments?: Comment[]     // not loaded by default
}

// With $with: [{ name: 'author' }, { name: 'comments' }]
// Both author and comments are present in the result
```

## See Also

- [Core Annotations](./annotations) — `@db.table`, `@db.index.*`, and other annotations
- [Queries & Filters](./queries) — Programmatic query syntax including `$with`
- [URL Query Syntax](./crud-http-query-syntax) — `$with` in HTTP URLs
- [Tables API](./tables) — `AtscriptDbTable` CRUD operations

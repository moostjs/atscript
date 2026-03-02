# Future Features

::: warning Experimental
DB Integrations are experimental. APIs may change at any moment.
:::

Atscript's database support grows in phases. Phase 1 (current) covers single-table definitions — table names, indexes, column mappings, and defaults. Phase 2 adds relations and foreign keys. Phase 3 adds many-to-many relations, views, and a portable query expression language.

## Phase 2: Relations & Foreign Keys

Phase 2 introduces the `@db.rel.*` annotation namespace for declaring foreign keys, navigational properties, and referential actions.

### Design Principles

1. **Explicit FK declaration** — a chain reference (`User.id`) is type-only by default. `@db.rel.FK` explicitly opts a field into being a foreign key with a DB constraint.
2. **Direction is declared** — `.to` means "the FK is on my interface." `.from` means "the FK is only on the other interface."
3. **FK-only is valid** — not every FK needs a navigational property. Audit fields like `deletedById: User.id` can declare a FK constraint without a corresponding `.to` navigation.
4. **Chain ref required** — FK fields must use chain reference types (e.g., `User.id`). Plain scalar types are rejected.

### Core Improvement: Chain Reference Metadata

When a field type is a chain reference like `authorId: User.id`, the resolved type is `number` — but the reference path (`User.id`) is currently discarded during codegen. Phase 2 preserves this in runtime metadata:

```typescript
// Current output:
authorId: { type: Number }

// Phase 2 output:
authorId: { type: Number, ref: { type: () => User, field: 'id' } }
```

This is additive — existing consumers that don't read `ref` continue to work.

### The `@db.rel.*` Namespace

| Annotation | Level | Purpose |
|---|---|---|
| `@db.rel.FK` | FK scalar field | Declares a foreign key constraint |
| `@db.rel.to` | Navigational field | Forward navigation — FK is on **this** interface |
| `@db.rel.from` | Navigational field | Inverse navigation — FK is **only** on the target interface |
| `@db.rel.onDelete` | FK field | Referential action on target row deletion |
| `@db.rel.onUpdate` | FK field | Referential action on target key update |

### Declaring a Foreign Key

`@db.rel.FK` marks a field as a foreign key. The field **must** use a chain reference type — the chain ref fully determines the FK target:

```atscript
@db.table "posts"
export interface Post extends Identifiable, Timestamped {
    // Chain ref User.id → type is number, FK → users.id
    @db.rel.FK
    @db.rel.onDelete "cascade"
    authorId: User.id

    title: string
    content: string

    @db.rel.to                        // forward — FK (authorId) is here
    author?: User

    @db.rel.from                      // inverse — FK is on Comment (postId)
    comments: Comment[]
}
```

Without `@db.rel.FK`, a chain reference is type-only — it borrows the resolved type but creates no DB constraint.

### Navigational Properties

**`@db.rel.to`** — "The FK is on MY interface." The compiler finds the local `@db.rel.FK` field that points to the target type:

```atscript
@db.rel.to
author?: User              // finds authorId's @db.rel.FK → User
```

**`@db.rel.from`** — "The FK is ONLY on the other interface." The compiler finds a `@db.rel.FK` on the target type that points back:

```atscript
@db.rel.from
posts: Post[]              // finds Post's @db.rel.FK → User
```

Navigational fields have no DB column. They represent loadable relationships, optional at query time.

### Disambiguating with Aliases

When multiple FKs point to the same type, aliases link FK fields with their navigational properties:

```atscript
@db.rel.FK 'author'
authorId: User.id

@db.rel.FK 'editor'
editorId: User.id?

@db.rel.to 'author'
author?: User

@db.rel.to 'editor'
editor?: User
```

### Referential Actions

`@db.rel.onDelete` and `@db.rel.onUpdate` set referential actions on FK fields:

```atscript
@db.rel.FK
@db.rel.onDelete "cascade"
@db.rel.onUpdate "noAction"
authorId: User.id
```

Actions: `cascade`, `restrict`, `noAction`, `setNull`, `setDefault`.

### Cardinality

Cardinality comes from the type system — no separate syntax:

| Annotation | Field type | Cardinality |
|---|---|---|
| `.to` | `author?: User` | Many-to-one (or 1:1 with unique FK) |
| `.from` | `comments: Comment[]` | One-to-many |
| `.from` | `profile?: UserProfile` | Inverse one-to-one (unique FK on target) |

One-to-one is distinguished from many-to-one by `@db.index.unique` on the FK field.

### Relation Patterns

| Pattern | Approach |
|---|---|
| One-to-many | `@db.rel.FK` + `@db.rel.to` on child, `@db.rel.from` on parent |
| One-to-one | Same as above + `@db.index.unique` on FK field |
| Self-referential | Alias links `.FK`, `.to`, and `.from` on the same type |
| FK-only | `@db.rel.FK` without any `.to`/`.from` — constraint only |
| Multiple FKs to same type | Aliases required on all `.FK`, `.to`, `.from` |
| Composite FK | Multiple `.FK` fields sharing the same alias |

### Query-Time Type Transformation

Navigational properties are always optional in the generated TypeScript type. Loading is opt-in via the adapter's `with` parameter:

```typescript
// Base type — navigational properties are optional
type Post = {
    id: number
    authorId: number
    author?: User            // not loaded by default
    comments?: Comment[]     // not loaded by default
}

// With { with: ['author', 'comments'] }
// Return type narrows: author and comments become required
```

---

## Phase 3: Many-to-Many, Views & Query Expressions

Phase 3 adds many-to-many relations through explicit junction tables, a `@db.view.*` namespace for database views, and a portable query expression language. It requires two core improvements: `ref` and `query` annotation argument types.

### Core Improvements

**`ref` argument type** — accepts type identifiers and chain references (`Type.field`) as annotation arguments. Enables `@db.rel.via PostTag`, `@db.view.for User`. Full IDE support: go-to-definition, hover, rename, diagnostics.

**`query` argument type** — backtick-delimited expressions parsed at compile time with full ref validation. Enables view filters and join conditions.

### `@db.rel.via` — Many-to-Many

Declares a many-to-many navigational property through an explicit junction table. Self-sufficient — no `@db.rel.from` needed because both sides of a M:N are inverse:

```atscript
@db.table "posts"
export interface Post extends Identifiable {
    title: string

    @db.rel.via PostTag              // M:N through PostTag junction
    tags: Tag[]
}

@db.table "tags"
export interface Tag extends Identifiable {
    @db.index.unique
    name: string

    @db.rel.via PostTag
    posts: Post[]
}

@db.table "post_tags"
export interface PostTag {
    @meta.id
    @db.rel.FK
    @db.rel.onDelete "cascade"
    postId: Post.id

    @meta.id
    @db.rel.FK
    @db.rel.onDelete "cascade"
    tagId: Tag.id

    assignedAt: number.timestamp.created   // extra junction fields are fine
}
```

Atscript requires explicit junction tables — no implicit/auto-managed junction tables. This keeps junction schemas visible, version-controlled, and supports extra fields.

### `@db.rel.filter` — Association-Level Filtering

Applies a filter to a navigational property, restricting which related records are loaded:

```atscript
@db.rel.from
@db.rel.filter `Post.published eq true`
publishedPosts: Post[]

@db.rel.from
posts: Post[]                    // all posts — no filter
```

### Views (`@db.view.*`)

All view concerns are scoped under the `@db.view.*` namespace:

| Annotation | Level | Purpose |
|---|---|---|
| `@db.view.name` | interface | View name (optional — derived from interface name if omitted) |
| `@db.view.for` | interface | Entry/primary table (required for computed views) |
| `@db.view.joins` | interface | Explicit join — escape hatch for non-relationship joins |
| `@db.view.filter` | interface | WHERE clause for the view |
| `@db.view.materialized` | interface | Marks view as materialized |

#### Joins via Chain Refs Through Navigational Properties

The primary mechanism for joining tables in a view. When a view field follows a navigational path defined via `@db.rel.*`, the compiler auto-resolves the join from FK metadata:

```atscript
@db.view.for Order
@db.view.filter `Order.status eq 'active'`
export interface ActiveOrderDetails {
    orderId: Order.id
    orderTotal: Order.total
    customerName: Order.customer.name      // follows @db.rel.to → auto-joins User
    customerEmail: Order.customer.email    // same join, different field
}
```

`Order.customer` resolves through the `@db.rel.to` navigational property on Order. The compiler reads the FK metadata (`Order.customerId → User.id`) and generates the appropriate JOIN. Multi-hop chains are supported — `Order.customer.department.name` generates two joins.

#### Explicit Joins (Escape Hatch)

`@db.view.joins` is for cases where no `@db.rel.*` path exists — custom conditions, unrelated tables, or aliased same-table joins:

```atscript
// No @db.rel.* relationship between these tables
@db.view.for Order
@db.view.joins Warehouse, `Warehouse.regionId eq Order.regionId`
export interface OrderWarehouse {
    orderId: Order.id
    warehouseName: Warehouse.name
}

// Aliased joins — same table joined twice
type Creator = User
type Reviewer = User

@db.view.for Post
@db.view.joins Creator, `Creator.id eq Post.creatorId`
@db.view.joins Reviewer, `Reviewer.id eq Post.reviewerId`
export interface ReviewDetail {
    title: Post.title
    creatorName: Creator.name
    reviewerName: Reviewer.name
}
```

#### Engine-Specific Views

For complex queries (aggregations, CTEs, window functions) that can't be expressed portably:

```atscript
@db.view.name "monthly_stats"
@db.postgres.sql "SELECT date_trunc('month', created_at) AS month, count(*) AS total FROM posts GROUP BY 1"
export interface MonthlyStats {
    month: string.isoDate
    total: number
}
```

#### Materialized Views

```atscript
@db.view.name "user_stats"
@db.view.materialized
@db.postgres.sql "SELECT user_id, count(*) as post_count FROM posts GROUP BY user_id"
export interface UserStats {
    userId: number
    postCount: number
}
```

Supported by PostgreSQL, CockroachDB, Oracle, SQL Server (indexed views), and Snowflake.

### Query Expression Language

A generic, database-agnostic filter language — first-class in Atscript. Parsed at compile time with full ref validation:

```atscript
@db.view.filter `User.status eq 'active'
                 and (User.plan eq 'premium'
                      or User.role eq 'admin')`
```

Supports comparison operators (`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `in`, `isNull`, `isNotNull`), logical operators (`and`, `or`, `not`), parentheses for grouping, and ref-to-ref comparisons for join conditions.

Expressions compile to a JSON tree that database adapters translate to their native format (SQL `WHERE`, MongoDB `$match`, etc.).

---

## Implementation Roadmap

### Phase 2

| Step | Feature | Unlocks |
|---|---|---|
| 1 | Chain ref metadata preservation | FK detection from types at runtime |
| 2 | `@db.rel.FK` annotation spec + validation | FK constraint generation |
| 3 | `@db.rel.to` / `.from` annotation specs + resolution | Navigational properties |
| 4 | `@db.rel.onDelete` / `.onUpdate` annotation specs | Referential actions |
| 5 | Adapter integration | Runtime FK metadata, `with` query API |

### Phase 3

| Step | Feature | Unlocks |
|---|---|---|
| 1 | `ref` argument type | `@db.rel.via`, `@db.view.for`, `@db.view.joins` |
| 2 | `@db.rel.via` annotation spec | M:N relation declaration |
| 3 | `query` argument type + parser | View filters, join conditions, `@db.rel.filter` |
| 4 | `@db.view.*` annotation specs | View declarations |
| 5 | View chain ref resolution through `@db.rel.*` paths | Auto-join from navigational properties |
| 6 | Adapter view generation | DDL output for views across DB engines |

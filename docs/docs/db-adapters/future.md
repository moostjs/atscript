# Future Features

::: warning Experimental
DB Adapters are experimental. APIs may change at any moment.
:::

Atscript's database support grows in phases. Phase 1 covers single-table definitions — table names, indexes, column mappings, and defaults. Phase 2 adds [relations and foreign keys](./relations). Phase 3 (below) adds many-to-many relations, views, and a portable query expression language.

::: tip Phase 2 is Available
Relations and foreign keys (`@db.rel.*`) are now implemented. See [Relations & Foreign Keys](./relations) for full documentation.
:::

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
| `@db.view` | interface | View name (optional — derived from interface name if omitted) |
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
@db.view "monthly_stats"
@db.postgres.sql "SELECT date_trunc('month', created_at) AS month, count(*) AS total FROM posts GROUP BY 1"
export interface MonthlyStats {
    month: string.isoDate
    total: number
}
```

#### Materialized Views

```atscript
@db.view "user_stats"
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

| Step | Feature | Unlocks |
|---|---|---|
| 1 | `ref` argument type | `@db.rel.via`, `@db.view.for`, `@db.view.joins` |
| 2 | `@db.rel.via` annotation spec | M:N relation declaration |
| 3 | `query` argument type + parser | View filters, join conditions, `@db.rel.filter` |
| 4 | `@db.view.*` annotation specs | View declarations |
| 5 | View chain ref resolution through `@db.rel.*` paths | Auto-join from navigational properties |
| 6 | Adapter view generation | DDL output for views across DB engines |

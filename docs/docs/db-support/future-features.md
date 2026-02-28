# Future Features

::: warning Experimental
DB Integrations are experimental. APIs may change at any moment.
:::

Atscript's database support is designed to grow in phases. Phase 1 (current) covers single-table definitions — table names, indexes, column mappings, and defaults. Phase 2 will add cross-table features: relations, views, and a portable query expression language.

## Core Improvements

Phase 2 requires four focused changes to the Atscript core.

### Type References in Annotations (`ref`)

A new annotation argument type that accepts type identifiers and chain references (`Type.field`). This enables type-safe annotations like `@db.references User` with full IDE support — go-to-definition, hover, rename refactoring, and diagnostics for unknown types.

### Query Expression Language (`query`)

A generic, database-agnostic filter language — first-class in Atscript. Query expressions are backtick-delimited and parsed at compile time with full ref validation:

```atscript
@db.filter `User.status eq 'active'
           and (User.plan eq 'premium'
                or User.role eq 'admin')`
```

The language supports comparison operators (`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `in`) and logical operators (`and`, `or`, `not`) with parentheses for grouping. Ref-to-ref comparisons (`Order.userId eq User.id`) enable join conditions.

Expressions compile to a JSON tree that database adapters translate to their native format:

| Adapter | Output |
|---------|--------|
| SQL | `WHERE status = 'active' AND (plan = 'premium' OR role = 'admin')` |
| MongoDB | `{ $and: [{ status: 'active' }, { $or: [{ plan: 'premium' }, { role: 'admin' }] }] }` |

### Chain Reference Metadata Preservation

When a field type is a chain reference like `authorId: User.id`, the resolved type is `number` — but the reference path (`User.id`) is currently discarded. Phase 2 preserves this in runtime metadata, enabling automatic foreign key detection from types alone.

### Interface `extends`

Adds `extends` to the interface grammar for DRY model composition:

```atscript
interface Timestamped {
    createdAt: number.timestamp.created
    updatedAt: number.timestamp.updated
}

@db.table "users"
interface User extends Timestamped {
    @db.id
    id: number
    name: string
}
```

Interface-level annotations (`@db.table`, `@db.schema`) are **not** inherited — only field-level annotations flow down. This prevents base types from making all children into tables.

## Relations & Foreign Keys

### Chain Reference FKs

The most natural way to express relationships — the field type IS the foreign key declaration:

```atscript
@db.table "posts"
export interface Post {
    @db.id
    id: number

    authorId: User.id         // chain ref → type is number, FK → users.id
    title: string
}
```

No `@db.references` annotation needed. Cardinality is inferred from the type: singular = many-to-one, with `@db.index.unique` = one-to-one, array type = one-to-many (inverse).

### Explicit Foreign Keys

For cases where chain refs don't suffice (composite FKs, explicit control):

```atscript
@db.references User
authorId: number

@db.references User.email     // FK to non-PK field
authorEmail: string
```

### Referential Actions

```atscript
@db.onDelete "cascade"
@db.onUpdate "cascade"
authorId: User.id
```

Actions: `cascade`, `restrict`, `noAction`, `setNull`, `setDefault`.

### Relation Naming

Disambiguates multiple relations between the same entities:

```atscript
@db.relation "author"
authorId: User.id

@db.relation "reviewer"
reviewerId: User.id?
```

## Views

Database views are defined as interfaces with `@db.view`, supporting three patterns:

### Chain Reference Views

The primary pattern — each field is a chain ref that specifies both the type and source column:

```atscript
@db.view "active_users", User
@db.filter `User.status eq 'active'`
export interface ActiveUser {
    id: User.id
    email: User.email
    name: User.name
}
```

Multi-table views use `@db.joins`:

```atscript
@db.view "order_details", Order
@db.joins User
export interface OrderDetails {
    orderId: Order.id
    orderTotal: Order.total
    customerName: User.name
}
```

Type aliases enable self-joins and multi-joins to the same table:

```atscript
type Creator = User
type Reviewer = User

@db.view "review_details", Post
@db.joins Creator, `Creator.id eq Post.creatorId`
@db.joins Reviewer, `Reviewer.id eq Post.reviewerId`
export interface ReviewDetail {
    title: Post.title
    creatorName: Creator.name
    reviewerName: Reviewer.name
}
```

### Engine-Specific Views

For complex queries (aggregations, CTEs, window functions) that can't be expressed portably:

```atscript
@db.view "monthly_stats"
@db.postgres.sql "SELECT date_trunc('month', created_at) AS month, count(*) AS total FROM posts GROUP BY 1"
export interface MonthlyStats {
    month: string.isoDate
    total: number
}
```

### Materialized Views

```atscript
@db.view "user_stats"
@db.materialized
export interface UserStats {
    userId: number
    postCount: number
}
```

Supported by PostgreSQL, CockroachDB, Oracle, SQL Server, and Snowflake.

## Relation Patterns

Phase 2 supports all standard relationship patterns:

| Pattern | Example |
|---------|---------|
| One-to-one | `userId: User.id` + `@db.index.unique` |
| One-to-many | `authorId: User.id` (no unique constraint) |
| Many-to-many | Junction table with two FKs |
| Self-referential | `managerId: Employee.id?` |

## Implementation Roadmap

| Step | Feature | Unlocks |
|------|---------|---------|
| 1 | Chain ref metadata preservation | FK detection from types, view column sources |
| 2 | `ref` argument type | Type-safe `@db.references User`, `@db.view "name", User` |
| 3 | Query expression language | `@db.filter`, `@db.joins` conditions |
| 4 | Interface `extends` | DRY model composition |
| 5 | Phase 2 annotations | Full relational model: FKs, views, joins, filters |

Steps 1-4 are independent core changes that can be implemented in parallel. Step 5 requires steps 1-3.

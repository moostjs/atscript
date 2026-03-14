---
outline: deep
---

# Annotations Reference

<!--@include: ./_experimental-warning.md-->

Complete reference for all database annotations available in `.as` files. The generic `@db.*` annotations are provided by `@atscript/db-utils/plugin` via `dbPlugin()`. MongoDB-specific annotations require the `@atscript/db-mongo` plugin.

## Tables & Columns

| Annotation | Applies To | Arguments | Description |
|------------|------------|-----------|-------------|
| `@db.table` | Interface | `name?` (string) | Mark as database table (defaults to interface name) |
| `@db.table.renamed` | Interface | `oldName` (string) | Previous table name for [schema sync](./schema-sync) migration |
| `@db.schema` | Interface | `name` (string) | Assign to a database schema/namespace |
| `@db.column` | Field | `name` (string) | Override the physical column name |
| `@db.column.renamed` | Field | `oldName` (string) | Previous column name for [schema sync](./schema-sync) migration |
| `@db.column.collate` | Field | `collation` (string) | Portable collation: `'binary'`, `'nocase'`, or `'unicode'` |
| `@db.column.precision` | Field | `precision` (number), `scale` (number) | Decimal precision/scale for DB storage (e.g., `DECIMAL(10,2)`) |
| `@db.json` | Field | — | Store as a single JSON column instead of flattening |
| `@db.ignore` | Field | — | Exclude field from the database schema entirely |

```atscript
@db.table 'users'
@db.schema 'auth'
interface User {
  @db.column 'full_name'
  name: string

  @db.json
  preferences: Preferences

  @db.ignore
  computedField: string

  @db.column.collate 'nocase'
  username: string

  @db.column.precision 10, 2
  price: number
}
```

## Defaults

| Annotation | Applies To | Arguments | Description |
|------------|------------|-----------|-------------|
| `@db.default` | Field | `value` (string) | Static default value |
| `@db.default.increment` | Field | `start?` (number) | Auto-incrementing integer (requires number type) |
| `@db.default.uuid` | Field | — | Random UUID string (requires string type) |
| `@db.default.now` | Field | — | Current timestamp (requires number or string type) |

```atscript
@db.table
interface Product {
  @meta.id
  @db.default.uuid
  id: string

  @db.default 'untitled'
  name: string

  @db.default.now
  createdAt: number
}
```

## Indexes

| Annotation | Applies To | Arguments | Description |
|------------|------------|-----------|-------------|
| `@db.index.plain` | Field | `name?` (string), `sort?` (string) | Standard index, optional name and sort direction (`'asc'`/`'desc'`) |
| `@db.index.unique` | Field | `name?` (string) | Unique constraint index |
| `@db.index.fulltext` | Field | `name?` (string), `weight?` (number) | Full-text search index with optional weight |

Use the same index name on multiple fields to create a composite index.

```atscript
@db.table
interface Article {
  @db.index.unique
  slug: string

  @db.index.plain 'date_idx', 'desc'
  publishedAt: number

  // Composite index across two fields
  @db.index.plain 'author_cat'
  authorId: string

  @db.index.plain 'author_cat'
  category: string

  @db.index.fulltext 'search', 3
  title: string

  @db.index.fulltext 'search', 1
  body: string
}
```

## Relations

| Annotation | Applies To | Arguments | Description |
|------------|------------|-----------|-------------|
| `@db.rel.FK` | Field | `alias?` (string) | [Foreign key](./relations) (field must use chain ref) |
| `@db.rel.to` | Field | `alias?` (string) | Forward [navigation](./relations) (N:1, FK on this table) |
| `@db.rel.from` | Field | `alias?` (string) | Reverse [navigation](./relations) (1:N, FK on other table) |
| `@db.rel.via` | Field | `junction` (ref) | Many-to-many [navigation](./relations) through a junction table |
| `@db.rel.onDelete` | Field | `action` (string) | Referential action on parent delete |
| `@db.rel.onUpdate` | Field | `action` (string) | Referential action on parent update |
| `` @db.rel.filter `` | Field | `condition` (expr) | Static filter condition on navigation property |

```atscript
@db.table
interface Task {
  @db.rel.FK
  @db.rel.onDelete 'cascade'
  projectId: Project.id

  @db.rel.to
  project: Project

  @db.rel.from
  comments: Comment[]

  @db.rel.via TaskTag
  tags: Tag[]

  @db.rel.from
  @db.rel.filter `status = 'open'`
  openSubtasks: Task[]
}
```

### Referential Action Values

For `@db.rel.onDelete` and `@db.rel.onUpdate`:

| Action | Description |
|--------|-------------|
| `'cascade'` | Propagate delete/update to related rows |
| `'restrict'` | Prevent operation if related rows exist |
| `'noAction'` | Database default behavior (no action) |
| `'setNull'` | Set FK to null (field must be optional) |
| `'setDefault'` | Set FK to default value (needs `@db.default`) |

## Views

| Annotation | Applies To | Arguments | Description |
|------------|------------|-----------|-------------|
| `@db.view` | Interface | `name?` (string) | Mark as database [view](./views) (defaults to interface name) |
| `@db.view.for` | Interface | `entry` (ref) | Entry/primary table for a managed view |
| `` @db.view.joins `` | Interface | `target` (ref), `condition` (expr) | Explicit join clause (repeatable) |
| `` @db.view.filter `` | Interface | `condition` (expr) | View WHERE clause |
| `@db.view.materialized` | Interface | — | Mark the view as materialized |
| `@db.view.renamed` | Interface | `oldName` (string) | Previous view name for [schema sync](./schema-sync) migration |

```atscript
@db.view
@db.view.for Task
@db.view.joins Project, `Project.id = Task.projectId`
@db.view.filter `Task.status = 'active'`
interface ActiveTaskView {
  taskName: Task.name
  projectName: Project.name
  dueDate: Task.dueDate
}
```

## Schema Sync

| Annotation | Applies To | Arguments | Description |
|------------|------------|-----------|-------------|
| `@db.sync.method` | Interface | `method` (string) | Sync strategy: `'drop'` or `'recreate'` |

- **`'drop'`** — Drop and recreate the table on structural changes (lossy, data is deleted).
- **`'recreate'`** — Recreate with data preservation on structural changes.

## Patch Behavior

| Annotation | Applies To | Arguments | Description |
|------------|------------|-----------|-------------|
| `@db.patch.strategy` | Field | `strategy` (string) | `'replace'` (default) or `'merge'` |

Controls how nested objects are handled during PATCH/update operations. With `'replace'`, the entire nested object is overwritten. With `'merge'`, individual sub-fields are deep-merged.

## MongoDB-Specific {#mongodb}

These annotations require the `@atscript/db-mongo` plugin.

| Annotation | Applies To | Arguments | Description |
|------------|------------|-----------|-------------|
| `@db.mongo.collection` | Interface | — | Mark as MongoDB collection (auto-injects `_id`) |
| `@db.mongo.capped` | Interface | `size` (number), `max?` (number) | Capped collection with max byte size and optional doc limit |
| `@db.mongo.search.dynamic` | Interface | `analyzer` (string), `fuzzy` (boolean) | Dynamic Atlas Search index |
| `@db.mongo.search.static` | Interface | `analyzer` (string), `fuzzy` (boolean), `indexName` (string) | Named static Atlas Search index |
| `@db.mongo.search.text` | Field | `analyzer` (string), `indexName` (string) | Include field in a search index |
| `@db.mongo.search.vector` | Field | `dims` (number), `similarity` (string), `indexName` (string) | Vector search field |
| `@db.mongo.search.filter` | Field | `indexName` (string) | Pre-filter field for vector search |

```atscript
use '@atscript/db-mongo'

@db.mongo.collection
@db.mongo.search.static 'standard', true, 'main_search'
interface Product {
  @meta.id
  _id: ObjectId

  @db.mongo.search.text 'standard', 'main_search'
  name: string

  @db.mongo.search.vector 1536, 'cosine', 'vec_idx'
  embedding: number[]

  @db.mongo.search.filter 'vec_idx'
  category: string
}
```

## Related Annotations {#related}

These are not `@db.*` annotations but are commonly used alongside the database layer.

| Annotation | Applies To | Arguments | Description |
|------------|------------|-----------|-------------|
| `@meta.id` | Field | — | Mark as primary key field (multiple fields form a composite key) |
| `@expect.array.key` | Field | — | Array element key field for patch matching |
| `@expect.array.uniqueItems` | Field | — | Enforce unique items in an array |

```atscript
@db.table
interface OrderLine {
  // Composite primary key
  @meta.id
  orderId: Order.id

  @meta.id
  productId: Product.id

  quantity: number
}
```

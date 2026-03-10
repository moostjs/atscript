---
outline: deep
---

# Database Views

<!--@include: ./_experimental-warning.md-->

Views let you define read-only projections across multiple tables — joins, filters, and computed columns declared in your `.as` schema. Like tables, views are defined in `.as` files using the `@db.view` annotation, but they produce read-only query interfaces instead of full CRUD tables.

## View Types

Atscript supports three kinds of database views:

| Type | Created by sync? | Stored? | Use case |
|------|-----------------|---------|----------|
| **Managed** (virtual) | Yes | No — query-based | Joins, filters, projections you define in `.as` |
| **Materialized** | Yes | Yes — precomputed | Performance-critical aggregations and summaries |
| **External** | No | Already exists | Pre-existing views not managed by Atscript |

## Declaring a Managed View

A managed view combines `@db.view`, `@db.view.for`, and field chain references to define a projection over one or more tables:

```atscript
import { Task } from './task'
import { User } from './user'
import { Project } from './project'

@db.view 'active_tasks'
@db.view.for Task
@db.view.joins User, `User.id = Task.assigneeId`
@db.view.joins Project, `Project.id = Task.projectId`
@db.view.filter `Task.status != 'done'`
export interface ActiveTask {
    id: Task.id
    title: Task.title
    status: Task.status
    assigneeName: User.name
    projectTitle: Project.title
}
```

Each field maps to a column on one of the joined tables via chain references (`Task.id`, `User.name`, etc.). Schema sync translates this into a `CREATE VIEW` statement with the appropriate `SELECT`, `JOIN`, and `WHERE` clauses.

## Entry Table

The `@db.view.for` annotation specifies the primary (entry) table for the view. This is the table that drives the query — all joins are relative to it.

```atscript
@db.view.for Task
```

Every managed view requires `@db.view.for`. Without it, the view is treated as [external](#external-views).

## Joins

Use `@db.view.joins` to bring in columns from related tables. Each join takes a target type and a condition written as a [query expression](./queries):

```atscript
@db.view.joins User, `User.id = Task.assigneeId`
@db.view.joins Project, `Project.id = Task.projectId`
```

The annotation is repeatable — add as many joins as you need. Each generates a `JOIN` in the resulting SQL (MongoDB uses `$lookup` with left-join semantics). Fields from joined tables can be marked optional (`?`) since the join may not match every row:

```atscript
assigneeName?: User.name   // optional — task may have no assignee
projectTitle: Project.title // required — every task has a project
```

## View Filters

The `@db.view.filter` annotation adds a `WHERE` clause using backtick query expression syntax:

```atscript
@db.view.filter `Task.status != 'done'`
```

You can reference any table in the view — both the entry table and all joined tables:

```atscript
@db.view.filter `Task.status != 'done' && Task.priority = 'high'`
```

For the full query expression syntax, see [Queries & Filters](./queries).

### Simple Views (No Joins)

A view can filter a single table without any joins:

```atscript
@db.view 'active_users'
@db.view.for User
@db.view.filter `User.status = 'active'`
export interface ActiveUser {
    id: User.id
    name: User.name
    email: User.email
}
```

## Querying Views

Use `db.getView()` to get a read-only `AtscriptDbView` instance. All read operations are available — `findOne`, `findMany`, `findById`, `count`, `findManyWithCount` — but no write operations:

```typescript
import { DbSpace } from '@atscript/utils-db'
import { ActiveTask } from './schema/active-task.as'

const db = new DbSpace(adapterFactory)
const view = db.getView(ActiveTask)

// Query with filter and sort
const tasks = await view.findMany({
  filter: { projectTitle: 'Website' },
  controls: { $sort: { title: 1 }, $limit: 20 },
})

// Count matching records
const count = await view.count({
  filter: { status: 'in_progress' },
})

// Find a single record
const task = await view.findOne({
  filter: { assigneeName: 'Alice' },
})
```

## Materialized Views

Add `@db.view.materialized` to store the view's results in the database. Materialized views are precomputed and can be faster to query than virtual views, especially for aggregations:

```atscript
@db.view 'task_stats'
@db.view.for Task
@db.view.materialized
@db.view.filter `Task.status = 'done'`
export interface TaskStats {
    id: Task.id
    title: Task.title
    status: Task.status
    createdAt: Task.createdAt
}
```

::: warning Adapter Support
The `@db.view.materialized` annotation is recognized by schema sync, but actual materialized view support depends on the adapter. Currently, SQLite emits a standard `CREATE VIEW` (no materialized support), and MongoDB creates a standard view via `viewOn`. Future adapters (e.g. PostgreSQL) may support native `CREATE MATERIALIZED VIEW`.
:::

## External Views

When you have a pre-existing view in your database that Atscript should not manage, declare it with `@db.view` alone — without `@db.view.for`:

```atscript
@db.view 'legacy_report'
export interface LegacyReport {
    @meta.id reportId: number
    title: string
    total: number
}
```

External views:
- Are **not** created, modified, or dropped by [schema sync](./schema-sync)
- Can be queried with the same `getView()` API as managed views
- Need field types declared directly (no chain references to source tables)

## Schema Sync Behavior

Schema sync manages the lifecycle of managed and materialized views:

- **Creation**: Managed views are created as `CREATE VIEW` statements during sync
- **Updates**: Views are dropped and recreated when their definition changes (there is no `ALTER VIEW`)
- **Renames**: Track view renames with `@db.view.renamed` so sync can rename rather than drop and recreate:

```atscript
@db.view 'premium_users'
@db.view.renamed 'vip_users'
@db.view.for User
@db.view.filter `User.status = 'active'`
export interface PremiumUsers {
    id: User.id
    name: User.name
}
```

External views are ignored by sync entirely.

## Complete Example

Here is a full view definition with an entry table, two joins, a filter, and its TypeScript usage:

```atscript
import { Task } from './task'
import { User } from './user'
import { Project } from './project'

@db.view 'high_priority_tasks'
@db.view.for Task
@db.view.joins User, `User.id = Task.assigneeId`
@db.view.joins Project, `Project.id = Task.projectId`
@db.view.filter `Task.priority = 'high' && Task.status != 'done'`
export interface HighPriorityTask {
    id: Task.id
    title: Task.title
    status: Task.status
    priority: Task.priority
    createdAt: Task.createdAt
    assigneeName?: User.name
    projectTitle: Project.title
}
```

```typescript
import { DbSpace } from '@atscript/utils-db'
import { HighPriorityTask } from './schema/high-priority-task.as'

const db = new DbSpace(adapterFactory)
const view = db.getView(HighPriorityTask)

// Fetch high-priority tasks for a specific project, sorted by creation date
const urgent = await view.findMany({
  filter: { projectTitle: 'Website Redesign' },
  controls: {
    $sort: { createdAt: -1 },
    $limit: 50,
  },
})

// Count unassigned high-priority tasks
const unassigned = await view.count({
  filter: { assigneeName: undefined },
})
```

## Next Steps

- [Schema Sync](./schema-sync) — how views are created and updated automatically
- [Queries & Filters](./queries) — full syntax for query expressions used in joins and filters
- [Relations](./relations) — defining relationships between tables

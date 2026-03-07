---
outline: deep
---

# Views

Database views provide read-only access to joined and filtered data. In Atscript, you define views in `.as` files just like tables — but use `@db.view` instead of `@db.table`.

## Managed Views

A managed view has an entry table and optional joins/filters. Atscript creates and manages it in your database automatically.

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
    priority: Task.priority
    createdAt: Task.createdAt
    assigneeName?: User.name
    projectTitle: Project.title
}
```

Let's break this down:

| Annotation | Purpose |
|-----------|---------|
| `@db.view 'active_tasks'` | Names the view in the database |
| `@db.view.for Task` | The entry (primary) table |
| `@db.view.joins User, \`...\`` | Joins the `User` table with a condition |
| `@db.view.joins Project, \`...\`` | Joins the `Project` table with a condition |
| `@db.view.filter \`...\`` | WHERE clause — only non-done tasks |

### View Fields

Each field in a view maps to a field on one of the joined tables using chain references:

```atscript
id: Task.id              // Task table → id column
assigneeName?: User.name // User table → name column
projectTitle: Project.title  // Project table → title column
```

Fields from joined tables can be optional (`?`) since the join may not match every row.

### Join Conditions

Join conditions use [query expressions](./query-expressions) — a SQL-like syntax in backticks:

```atscript
@db.view.joins User, `User.id = Task.assigneeId`
```

This generates a `JOIN users ON users.id = tasks.assignee_id` in the database.

### Filter Conditions

The `@db.view.filter` annotation adds a WHERE clause:

```atscript
@db.view.filter `Task.status != 'done'`
```

You can reference any table in the view — the entry table and all joined tables:

```atscript
@db.view.filter `Task.status != 'done' and Project.status = 'active'`
```

### Simple Views (No Joins)

A view can be a simple filter over a single table:

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

## External Views

Reference a pre-existing database view (one you created manually or from another tool):

```atscript
@db.view 'legacy_report'
export interface LegacyReport {
    id: number
    total: number
}
```

External views:
- Have `@db.view` but **no** `@db.view.for`
- Are not created or dropped by [schema sync](./schema-sync)
- Schema sync validates they exist in the database

## Materialized Views

Mark a view as materialized for pre-computed data:

```atscript
@db.view 'monthly_stats'
@db.view.for Task
@db.view.materialized
@db.view.filter `Task.status = 'done'`
export interface MonthlyStats {
    id: Task.id
    title: Task.title
    createdAt: Task.createdAt
}
```

::: info
Materialized view support depends on your database. SQLite does not support materialized views natively. PostgreSQL and MongoDB do.
:::

## Querying Views

Views are read-only. Use the same query API as tables, but through `DbSpace`:

```typescript
import { DbSpace } from '@atscript/utils-db'
import { ActiveTask } from './schema/active-task.as'

const db = new DbSpace(adapterFactory)
const activeTasks = db.getReadable(ActiveTask)

// Query the view
const tasks = await activeTasks.findMany({
  filter: { priority: 'high' },
  controls: { $sort: { createdAt: -1 }, $limit: 10 },
})

// Count
const count = await activeTasks.count({
  filter: { priority: 'high' },
})
```

## Renaming Views

Track view renames for schema sync:

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

## Next Steps

- [Query Expressions](./query-expressions) — Full syntax for conditions used in joins and filters
- [CRUD Operations](./crud) — Working with data at runtime
- [Schema Sync](./schema-sync) — Automatic view creation and management

---
outline: deep
---

# Query Expressions

Query expressions are a SQL-like syntax used in `.as` files for view filters, join conditions, and relation filters. They're written inside backticks.

## Where They're Used

| Annotation | Purpose | Example |
|-----------|---------|---------|
| `@db.view.filter` | WHERE clause for views | `` `Task.status != 'done'` `` |
| `@db.view.joins` | JOIN condition | `` `User.id = Task.assigneeId` `` |
| `@db.rel.filter` | Navigation filter | `` `Comment.approved = true` `` |

## Syntax

### Field References

Fields are referenced as `Type.field`:

```
Task.status
User.name
Project.id
```

You can also chain through nested fields:

```
User.contact.email
```

When the context is unambiguous (single table), you can omit the type name:

```
status != 'done'
```

### Comparison Operators

```
Task.status = 'active'       // equals
Task.status != 'done'        // not equals
Task.priority > 3            // greater than
Task.priority >= 3           // greater than or equal
Task.priority < 10           // less than
Task.priority <= 10          // less than or equal
```

### Existence

```
Task.assigneeId exists       // field is not null
Task.deletedAt not exists    // field is null
```

### Pattern Matching

```
User.name matches /^Al/      // regex match
```

### Set Membership

```
Task.status in ('todo', 'in-progress', 'review')
Task.priority not in (1, 2)
```

### Logical Operators

Combine conditions with `and`, `or`, and `not`:

```
Task.status != 'done' and Task.priority > 3
Task.status = 'done' or Task.status = 'cancelled'
not Task.status = 'archived'
```

### Parentheses

Group expressions for correct precedence:

```
(Task.status = 'active' or Task.status = 'review') and Task.priority > 3
```

## Examples

### View Filter

Filter a view to only active tasks:

```atscript
@db.view 'active_tasks'
@db.view.for Task
@db.view.filter `Task.status != 'done'`
export interface ActiveTask {
    id: Task.id
    title: Task.title
    status: Task.status
}
```

### Join Condition

Join users to tasks by matching IDs:

```atscript
@db.view 'task_details'
@db.view.for Task
@db.view.joins User, `User.id = Task.assigneeId`
@db.view.joins Project, `Project.id = Task.projectId`
export interface TaskDetail {
    id: Task.id
    title: Task.title
    assigneeName?: User.name
    projectTitle: Project.title
}
```

### Combined Filter and Joins

```atscript
@db.view 'urgent_tasks'
@db.view.for Task
@db.view.joins User, `User.id = Task.assigneeId`
@db.view.joins Project, `Project.id = Task.projectId`
@db.view.filter `Task.status != 'done' and Task.priority = 'critical' and Project.status = 'active'`
export interface UrgentTask {
    id: Task.id
    title: Task.title
    assigneeName?: User.name
    projectTitle: Project.title
}
```

### Relation Filter

Only load approved comments:

```atscript
@db.rel.from
@db.rel.filter `Comment.approved = true`
approvedComments?: Comment[]
```

## Validation

Query expressions are validated at compile time:

- **Type references** must point to known types with `@db.table` or `@db.view`
- **Field references** must exist on the referenced type
- **Scope** is enforced — `@db.view.filter` can only reference the entry table and joined tables
- **Join conditions** must reference exactly two tables

The VSCode extension provides real-time diagnostics for query expression errors.

## Next Steps

- [Views](./views) — Using query expressions in view definitions
- [Navigation Properties](./navigation) — Using `@db.rel.filter` for filtered relations

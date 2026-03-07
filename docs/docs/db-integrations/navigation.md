---
outline: deep
---

# Navigation Properties

Navigation properties let you load related data alongside your records. They don't create database columns — instead, they define relationships that can be resolved at query time using `$with`.

## Forward Navigation (`@db.rel.to`)

Use `@db.rel.to` when the foreign key is **on this table** — you're navigating "to" the parent:

```atscript
import { User } from './user'

@db.table 'projects'
export interface Project {
    @meta.id
    @db.default.fn 'increment'
    id: number

    title: string

    // Foreign key
    @db.rel.FK
    @db.rel.onDelete 'cascade'
    ownerId: User.id

    // Navigation property
    @db.rel.to
    owner?: User
}
```

The `owner` field:
- Is **not stored** in the database — it's a virtual property
- Is typed as `User` (a single related object)
- Is only populated when you request it with `$with`

## Reverse Navigation (`@db.rel.from`)

Use `@db.rel.from` when the foreign key is **on the other table** — related records point back to you:

```atscript
@db.table 'users'
export interface User {
    @meta.id
    @db.default.fn 'increment'
    id: number

    name: string

    // Navigation: projects where ownerId points to this user
    @db.rel.from
    projects?: Project[]
}
```

The `projects` field:
- Returns an **array** of related records
- Atscript automatically finds the FK on `Project` that points to `User`

## Many-to-Many (`@db.rel.via`)

Use `@db.rel.via` for many-to-many relationships through a junction table:

```atscript
import { Tag } from './tag'
import { TaskTag } from './task-tag'

@db.table 'tasks'
export interface Task {
    @meta.id
    @db.default.fn 'increment'
    id: number

    title: string

    @db.rel.via TaskTag
    tags?: Tag[]
}
```

And on the other side:

```atscript
import { Task } from './task'
import { TaskTag } from './task-tag'

@db.table 'tags'
export interface Tag {
    @meta.id
    @db.default.fn 'increment'
    id: number

    name: string

    @db.rel.via TaskTag
    tasks?: Task[]
}
```

The junction table (`TaskTag`) must have FKs to both sides. See [Foreign Keys — Junction Tables](./foreign-keys#junction-tables).

## Loading Relations with `$with`

Relations are only loaded when you explicitly request them:

```typescript
// Without $with — no relations loaded
const tasks = await taskTable.findMany({
  filter: { status: 'active' },
})
// [{ id: 1, title: '...', projectId: 3 }]

// With $with — relations included
const tasks = await taskTable.findMany({
  filter: { status: 'active' },
  controls: {
    $with: [
      { name: 'project' },
      { name: 'assignee' },
      { name: 'tags' },
    ],
  },
})
// [{ id: 1, title: '...', projectId: 3, project: { id: 3, ... }, assignee: { ... }, tags: [...] }]
```

### Filtering Related Data

You can filter and control the related data:

```typescript
const tasks = await taskTable.findMany({
  filter: { status: 'active' },
  controls: {
    $with: [
      {
        name: 'comments',
        filter: { /* filter for comments */ },
        controls: { $limit: 5, $sort: { createdAt: -1 } },
      },
    ],
  },
})
```

### Static Relation Filters

Use `@db.rel.filter` to apply a permanent filter to a navigation property:

```atscript
@db.rel.from
@db.rel.filter `Comment.approved = true`
approvedComments?: Comment[]
```

This filter is always applied when loading `approvedComments`, on top of any runtime filter you pass in `$with`.

## Aliases for Multiple Relations

When a table has multiple FKs to the same target, use aliases to match navigation properties to their FKs:

```atscript
@db.table 'transfers'
export interface Transfer {
    @meta.id
    id: number

    @db.rel.FK 'sender'
    senderId: User.id

    @db.rel.FK 'receiver'
    receiverId: User.id

    @db.rel.to 'sender'
    sender?: User

    @db.rel.to 'receiver'
    receiver?: User
}
```

The alias on `@db.rel.to 'sender'` matches the alias on `@db.rel.FK 'sender'`.

## Complete Example

Here's a project management schema showing all three relation types:

```atscript
// user.as
@db.table 'users'
export interface User {
    @meta.id
    @db.default.fn 'increment'
    id: number

    name: string

    @db.rel.from
    projects?: Project[]
}

// project.as
@db.table 'projects'
export interface Project {
    @meta.id
    @db.default.fn 'increment'
    id: number

    title: string

    @db.rel.FK
    @db.rel.onDelete 'cascade'
    ownerId: User.id

    @db.rel.to
    owner?: User

    @db.rel.from
    tasks?: Task[]
}

// task.as
@db.table 'tasks'
export interface Task {
    @meta.id
    @db.default.fn 'increment'
    id: number

    title: string

    @db.rel.FK
    @db.rel.onDelete 'cascade'
    projectId: Project.id

    @db.rel.FK
    @db.rel.onDelete 'setNull'
    assigneeId?: User.id

    @db.rel.to
    project?: Project

    @db.rel.to
    assignee?: User

    @db.rel.from
    comments?: Comment[]

    @db.rel.via TaskTag
    tags?: Tag[]
}
```

## Next Steps

- [Deep Operations](./deep-operations) — Insert and update across relations
- [Views](./views) — Create read-only views that join tables
- [Queries & Filters](./queries) — Advanced filtering and pagination

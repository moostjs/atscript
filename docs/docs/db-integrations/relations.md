---
outline: deep
---

# Foreign Keys & Navigation

<!--@include: ./_experimental-warning.md-->

Relational data rarely lives in a single table. Atscript lets you define foreign keys and navigation properties directly in your `.as` schema so that relationships between tables are explicit, type-safe, and portable across database adapters.

This page covers how to connect tables with foreign keys and how to navigate between related records at query time.

## Foreign Keys

A foreign key links a field in one table to the primary key (or unique field) of another table. Use `@db.rel.FK` and a chain reference to declare it:

```atscript
@db.table 'tasks'
export interface Task {
    @meta.id
    id: number

    title: string

    @db.rel.FK
    ownerId: User.id
}
```

The chain reference `User.id` tells Atscript that `ownerId` points to the `id` field on the `User` table. The referenced field must be marked with `@meta.id` or `@db.index.unique`.

## Optional Foreign Keys

Not every relationship is mandatory. Use `?` to make a foreign key nullable — the field can hold a valid reference or `null`:

```atscript
@db.rel.FK
assigneeId?: User.id
```

This is common for fields like "assignee" or "reviewer" where a record may not have a related parent yet.

## FK Aliases

When a table has multiple foreign keys pointing to the same target type, aliases distinguish them:

```atscript
@db.table 'articles'
export interface Article {
    @meta.id
    id: number

    title: string

    @db.rel.FK 'author'
    authorId: User.id

    @db.rel.FK 'reviewer'
    reviewerId?: User.id
}
```

The alias string (`'author'`, `'reviewer'`) becomes important when you define navigation properties — it tells Atscript which FK to follow.

## Referential Actions

Control what happens to child records when a parent is deleted or its key is updated. Use `@db.rel.onDelete` and `@db.rel.onUpdate` alongside `@db.rel.FK`:

| Action         | Behavior                                          |
| -------------- | ------------------------------------------------- |
| `'cascade'`    | Delete/update children when parent changes        |
| `'restrict'`   | Prevent parent change if children exist            |
| `'setNull'`    | Set FK to null (field must be optional)            |
| `'setDefault'` | Set FK to default value (needs `@db.default`)      |
| `'noAction'`   | Database default behavior                          |

```atscript
@db.table 'comments'
export interface Comment {
    @meta.id
    id: number

    body: string

    // Delete comments when the task is deleted
    @db.rel.FK
    @db.rel.onDelete 'cascade'
    taskId: Task.id

    // Keep comment but clear author if user is deleted
    @db.rel.FK
    @db.rel.onDelete 'setNull'
    authorId?: User.id
}
```

When using `'setNull'`, the FK field must be optional (`?`) — otherwise there is no valid null state to fall back to.

### Restrict

Use `'restrict'` when child records should prevent parent deletion. This is useful for protecting important data from accidental cascading deletes:

```atscript
@db.table 'departments'
export interface Department {
    @meta.id
    id: number

    name: string

    @db.rel.from
    employees: Employee[]
}

@db.table 'employees'
export interface Employee {
    @meta.id
    id: number

    name: string

    // Cannot delete department while employees exist
    @db.rel.FK
    @db.rel.onDelete 'restrict'
    departmentId: Department.id
}
```

Attempting to delete a department that still has employees returns a `CONFLICT` error (HTTP 409 via the controller). You must delete or reassign all employees first:

```typescript
await departments.deleteOne(1)
// Throws DbError { code: 'CONFLICT', errors: [...] }
// because employees with departmentId=1 still exist
```

## Composite Foreign Keys

When a target table has a composite primary key (multiple `@meta.id` fields), declare one FK per key field. They automatically combine into a single composite foreign key:

```atscript
@db.table 'order_items'
export interface OrderItem {
    @meta.id
    id: number

    @db.rel.FK
    orderId: Order.id

    @db.rel.FK
    productId: Order.productId

    quantity: number
}
```

## Navigation Properties — TO (N:1)

Foreign keys define the physical link between tables. Navigation properties define how you traverse that link. A `@db.rel.to` property loads the single parent record that the FK points to:

```atscript
@db.table 'tasks'
export interface Task {
    @meta.id
    id: number

    title: string

    @db.rel.FK
    ownerId: User.id

    @db.rel.to
    owner: User
}
```

Atscript matches the navigation property to its FK by looking at the target type. When you query tasks and load the `owner` relation, each task gets its parent `User` object.

### Alias Matching

When multiple FKs point to the same type, use the alias to tell `@db.rel.to` which FK to follow:

```atscript
@db.rel.FK 'author'
authorId: User.id

@db.rel.FK 'reviewer'
reviewerId?: User.id

@db.rel.to 'author'
author: User

@db.rel.to 'reviewer'
reviewer?: User
```

The alias on `@db.rel.to` must match the alias on the corresponding `@db.rel.FK`.

## Navigation Properties — FROM (1:N)

A `@db.rel.from` property navigates in the reverse direction — from a parent to its children. It returns an array of records:

```atscript
@db.table 'projects'
export interface Project {
    @meta.id
    id: number

    name: string

    @db.rel.from
    tasks: Task[]
}
```

The FK lives on the remote table (`Task` has an FK pointing to `Project`). Atscript resolves the relationship by finding the FK on `Task` that references the `Project` table.

## Navigation Properties — VIA (M:N)

Many-to-many relationships use a junction table. The `@db.rel.via` annotation takes the junction type as its argument:

```atscript
@db.table 'task_tags'
export interface TaskTag {
    @meta.id
    id: number

    @db.rel.FK
    taskId: Task.id

    @db.rel.FK
    tagId: Tag.id
}

@db.table 'tasks'
export interface Task {
    @meta.id
    id: number

    title: string

    @db.rel.via TaskTag
    tags: Tag[]
}

@db.table 'tags'
export interface Tag {
    @meta.id
    id: number

    label: string

    @db.rel.via TaskTag
    tasks: Task[]
}
```

The junction table (`TaskTag`) must have foreign keys to both sides of the relationship.

## Loading Relations

Navigation properties are **not** populated by default — they are only loaded when you explicitly request them with `$with` in your query controls:

```typescript
const tasks = await taskTable.findMany({
  controls: {
    $with: [{ name: 'owner' }, { name: 'tags' }]
  }
})
```

Each entry in `$with` names a navigation property. You can nest them to load deeper relationships:

```typescript
const tasks = await taskTable.findMany({
  controls: {
    $with: [
      {
        name: 'project',
        controls: {
          $with: [{ name: 'owner' }]
        }
      }
    ]
  }
})
// tasks[0].project.owner → User object
```

## Filtering Related Data

Use `@db.rel.filter` with a query expression to limit which related records are loaded. This is useful for navigation properties that should only return a subset of the related data:

```atscript
@db.table 'posts'
export interface Post {
    @meta.id
    id: number

    title: string

    @db.rel.from
    comments: Comment[]

    @db.rel.from
    @db.rel.filter `Comment.visible = true`
    visibleComments: Comment[]
}
```

When you load `visibleComments`, only comments where `visible` is `true` are returned. The unfiltered `comments` property still loads all of them.

## Complete Example

Here is a four-table schema that uses all the relation types together:

```atscript
@db.table 'users'
export interface User {
    @meta.id
    @db.default.increment
    id: number

    name: string
    email: string

    @db.rel.from
    projects: Project[]
}

@db.table 'projects'
export interface Project {
    @meta.id
    @db.default.increment
    id: number

    name: string

    @db.rel.FK
    ownerId: User.id

    @db.rel.to
    owner: User

    @db.rel.from
    tasks: Task[]
}

@db.table 'tasks'
export interface Task {
    @meta.id
    @db.default.increment
    id: number

    title: string
    done: boolean

    @db.rel.FK
    @db.rel.onDelete 'cascade'
    projectId: Project.id

    @db.rel.FK
    @db.rel.onDelete 'setNull'
    assigneeId?: User.id

    @db.rel.to
    project: Project

    @db.rel.to
    assignee?: User

    @db.rel.via TaskTag
    tags: Tag[]
}

@db.table 'tags'
export interface Tag {
    @meta.id
    @db.default.increment
    id: number

    label: string

    @db.rel.via TaskTag
    tasks: Task[]
}

@db.table 'task_tags'
export interface TaskTag {
    @meta.id
    @db.default.increment
    id: number

    @db.rel.FK
    @db.rel.onDelete 'cascade'
    taskId: Task.id

    @db.rel.FK
    @db.rel.onDelete 'cascade'
    tagId: Tag.id
}
```

This schema supports queries like "load all tasks for a project, with their assignee and tags" in a single call:

```typescript
const projects = await projectTable.findMany({
  controls: {
    $with: [
      { name: 'owner' },
      {
        name: 'tasks',
        controls: {
          $with: [{ name: 'assignee' }, { name: 'tags' }]
        }
      }
    ]
  }
})
```

## Behavior Notes

- **Null FK** — When a nullable FK is `null`, the corresponding `@db.rel.to` navigation property returns `null` (it is not omitted from the result).
- **Empty collections** — When a `@db.rel.from` or `@db.rel.via` navigation has no matching records, it returns an empty array `[]`, not `null`.
- **Explicit loading only** — Navigation properties are only populated when loaded via `$with`. Without it, they are `undefined` on the returned objects.

## Nullable FK Lifecycle

Optional foreign keys (`?`) support a full lifecycle of null ↔ value transitions:

```typescript
// Insert with null FK
await tasks.insertOne({ title: 'Unassigned task', assigneeId: null })

// Query for null FKs
const unassigned = await tasks.findMany({ filter: { assigneeId: null } })

// Load relation on null FK — returns null, not an error
const task = await tasks.findOne({
  filter: { assigneeId: null },
  controls: { $with: [{ name: 'assignee' }] },
})
// task.assignee === null

// Patch: assign a user
await tasks.updateOne({ id: task.id, assigneeId: 5 })

// Patch: unassign (set back to null)
await tasks.updateOne({ id: task.id, assigneeId: null })
```

Setting an FK to a non-existent ID returns a `400` error (FK violation). Setting it to `null` always succeeds as long as the field is optional.

## Nullable FK Lifecycle

Optional foreign keys support a full lifecycle of null → value → null transitions:

```typescript
// Insert with null FK
await tasks.insertOne({ title: 'Unassigned task', assigneeId: null })

// Query for null FKs
const unassigned = await tasks.findMany({ filter: { assigneeId: null } })

// Load relation on null FK — returns null (not omitted)
const task = await tasks.findOne({
  filter: { assigneeId: null },
  controls: { $with: [{ name: 'assignee' }] },
})
// task.assignee === null

// Patch null → valid value
await tasks.updateOne({ id: task.id, assigneeId: 1 })

// Patch valid → null
await tasks.updateOne({ id: task.id, assigneeId: null })
```

Setting an FK to a non-existent ID throws a `FK_VIOLATION` error (HTTP 400 via the controller):

```typescript
await tasks.updateOne({ id: 1, assigneeId: 99999 })
// Throws DbError { code: 'FK_VIOLATION' }
```

## Next Steps

- [Deep Operations](./deep-operations) — Insert, replace, and update across related tables in one call
- [Patch Operations](./patch-operations) — Array and relation patch operators
- [Views](./views) — Define read-only projections across tables

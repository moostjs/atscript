<div class="file-sep">schema.as</div>

```atscript
@db.table 'tasks'
export interface Task {
  @meta.id
  @db.default.increment
  id: number

  @expect.maxLength 200
  title: string

  status: 'todo' | 'in-progress' | 'done'

  @db.rel.FK
  @db.rel.onDelete 'cascade'
  projectId: Project.id

  // resolved through the projectId FK above
  @db.rel.to
  project: Project

  // resolved through the FK on Comment that points back to Task
  @db.rel.from
  comments: Comment[]

  createdAt: number.timestamp.created
}
```

<div class="file-sep">controller.ts</div>

```ts
@TableController(tasksTable)
export class TaskController extends AsDbController<typeof Task> {}
// 8 REST endpoints — ready.
```

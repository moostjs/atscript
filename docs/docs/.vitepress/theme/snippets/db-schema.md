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

  @db.rel.to Project 'projectId'
  project: Project

  @db.rel.from Comment.taskId
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

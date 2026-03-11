```atscript
@meta.label 'Task'
@meta.description 'A trackable unit of work'
@db.table 'tasks'
export interface Task {
  @meta.id
  @db.default.increment
  id: number

  @meta.label 'Title'
  @ui.placeholder 'Enter task title...'
  @ui.component 'text-input'
  @expect.minLength 3
  @expect.maxLength 200
  @db.index.plain 'idx_title'
  title: string

  @meta.label 'Description'
  @ui.type 'textarea'
  @ui.hint 'Supports markdown formatting'
  @expect.maxLength 5000
  description?: string

  @meta.label 'Status'
  @ui.component 'select'
  @ui.icon 'circle-dot'
  @db.default 'todo'
  @db.index.plain 'idx_status'
  status: 'todo' | 'in_progress' | 'done'

  @meta.label 'Priority'
  @ui.component 'select'
  @ui.order 3
  @db.default 'medium'
  @db.index.plain 'idx_priority'
  priority: 'low' | 'medium' | 'high' | 'urgent'

  @meta.label 'Estimate (hours)'
  @ui.width 'half'
  @expect.min 0.5
  @expect.max 200
  estimate?: number

  @meta.label 'Due Date'
  @ui.component 'date-picker'
  @ui.width 'half'
  dueDate?: number.timestamp

  @meta.sensitive
  @ui.hidden
  internalNotes?: string

  @meta.readonly
  @db.default.now
  createdAt?: number.timestamp.created

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

  @db.json
  metadata?: {
    labels: string[]
    color?: string
    weight?: number
  }
}
```

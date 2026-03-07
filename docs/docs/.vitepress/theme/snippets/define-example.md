```atscript
@db.table 'users'
export interface User {
  @meta.id
  id: number

  @meta.label 'Full Name'
  name: string.nonempty

  email: string.email

  age: number.int.positive

  @expect.maxLength 500
  bio?: string

  role: 'admin' | 'user'

  @db.rel.FK
  @db.rel.onDelete 'cascade'
  teamId: Team.id

  createdAt: number.timestamp.created
}
```

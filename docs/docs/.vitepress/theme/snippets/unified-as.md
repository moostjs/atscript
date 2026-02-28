<div class="file-sep">user.as</div>

```atscript
@db.table 'users'
export interface User {
  @db.id
  id: number

  @meta.label "Email Address"
  @ui.placeholder "alice@company.com"
  @db.index.unique 'email_idx'
  email: string.email

  @meta.label "Full Name"
  @ui.placeholder "Alice Smith"
  @expect.minLength 2
  @expect.maxLength 100
  @db.index.fulltext 'search_idx'
  name: string

  @meta.label "Age"
  age: number.int.positive

  @meta.label "Role"
  @ui.component "select"
  role?: 'admin' | 'user'
}
```

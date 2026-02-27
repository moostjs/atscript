<div class="file-sep">user.as</div>

```atscript
@db.table 'Users'
export interface User {
  @meta.id
  id: number

  @meta.label "Email Address"
  @meta.placeholder "alice@company.com"
  @db.unique
  email: string.email

  @meta.label "Full Name"
  @meta.placeholder "Alice Smith"
  @expect.minLength 2
  @expect.maxLength 100
  name: string

  @meta.label "Age"
  age: number.int.positive

  @meta.label "Role"
  @ui.component "select"
  role?: 'admin' | 'user'
}
```

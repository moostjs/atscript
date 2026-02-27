<div class="file-sep">user.as</div>

```atscript
export interface User {
  @meta.label "Email"
  @meta.example "alice@company.com"
  email: string.email

  @meta.label "Full Name"
  @expect.minLength 2
  @expect.maxLength 100
  name: string

  @meta.sensitive
  @expect.minLength 8
  password: string

  role?: 'admin' | 'user'

  address: {
    street: string
    city: string
    @expect.pattern /^\d{5}$/
    zip: string
  }
}
// Types + validation + metadata + docs
// all in one place, all runtime-accessible
```

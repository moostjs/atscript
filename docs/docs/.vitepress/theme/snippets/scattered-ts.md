<div class="file-sep">db/schema.ts</div>

```ts
import { pgTable, serial, varchar, integer, uniqueIndex } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  age: integer('age').notNull(),
  role: varchar('role', { enum: ['admin', 'user'] }),
}, (t) => [uniqueIndex().on(t.email)])
```

<div class="file-sep">validation/user.schema.ts</div>

```ts
import { createInsertSchema } from 'drizzle-zod'
import { users } from '../db/schema'

export const insertUserSchema = createInsertSchema(users, {
  email: (s) => s.email.email(),
  name: (s) => s.name.min(2).max(100),
  age: (s) => s.age.positive(),
})
```

<div class="file-sep">components/UserForm.tsx</div>

```tsx
const fieldConfig = {
  email: { label: 'Email Address', placeholder: 'alice@company.com' },
  name:  { label: 'Full Name', placeholder: 'Alice Smith' },
  age:   { label: 'Age', type: 'number' },
  role:  { label: 'Role', component: 'select' },
}
```

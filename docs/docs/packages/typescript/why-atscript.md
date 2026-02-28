# Why Atscript?

<!--@include: ../../_fragments/why-atscript.md-->

## Example: Before and After

### Before Atscript (Scattered)

```typescript
// types/user.ts
interface User {
  email: string
  name: string
  age: number
  isActive: boolean
}

// validation/user-schema.ts
const userSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  age: z.number().int().min(13).max(150),
  isActive: z.boolean(),
})

// database/user.model.ts
@Entity()
class UserEntity {
  @Column({ unique: true })
  @Index()
  email: string

  @Column()
  @Index({ fulltext: true })
  name: string

  @Column('integer')
  age: number

  @Column()
  @Index()
  isActive: boolean
}

// ui/user-form-config.ts
const userFormFields = {
  email: { label: 'User Email', type: 'email' },
  name: { label: 'Full Name', minLength: 2, maxLength: 100 },
  age: { label: 'Age', type: 'number', min: 13, max: 150 },
  isActive: { label: 'Account Status', type: 'checkbox' },
}
```

### After Atscript (Unified)

```atscript
// user.as - Everything in one place!
@db.table 'users'
@db.mongo.collection
export interface User {
    @meta.label 'User Email'
    @db.index.unique 'email_idx'
    email: string.email

    @meta.label 'Full Name'
    @expect.minLength 2
    @expect.maxLength 100
    @db.mongo.index.text 5
    name: string

    @meta.label 'Age'
    @expect.min 13
    @expect.max 150
    @expect.int
    age: number

    @meta.label 'Account Status'
    @db.index.plain 'status_idx'
    isActive: boolean
}
```

Then use it in TypeScript:

```typescript
import { User } from './user.as'

// Type checking
const user: User = {
  /* ... */
}

// Validation
const validator = User.validator()
validator.validate(userData)

// Access metadata for UI
User.metadata.get('meta.label') // For form labels

// Database schema is auto-generated
// Indexes are auto-created
// Documentation is auto-extracted
```

## Next Steps

- [Quick Start](/packages/typescript/quick-start) — create your first .as file

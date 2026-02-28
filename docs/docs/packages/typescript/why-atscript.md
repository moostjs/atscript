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
export interface User {
    @meta.label 'User Email'
    @db.index.unique 'email_idx'
    email: string.email

    @meta.label 'Full Name'
    @expect.minLength 2
    @expect.maxLength 100
    @db.index.fulltext 'search_idx'
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
import { AtscriptDbTable } from '@atscript/utils-db'
import { SqliteAdapter, BetterSqlite3Driver } from '@atscript/db-sqlite'
import UserMeta from './user.as.js'

// Type checking
const user: User = { /* ... */ }

// Validation
const validator = User.validator()
validator.validate(userData)

// Access metadata for UI
User.metadata.get('meta.label') // For form labels

// Database — tables and indexes from annotations
const adapter = new SqliteAdapter(new BetterSqlite3Driver('app.db'))
const users = new AtscriptDbTable(UserMeta, adapter)
await users.ensureTable()   // Creates table
await users.syncIndexes()   // Creates indexes
await users.insertOne(user) // Validates and inserts
```

## Next Steps

- [Quick Start](/packages/typescript/quick-start) — create your first .as file
- [DB Integrations](/db-support/) — use annotations to drive database operations

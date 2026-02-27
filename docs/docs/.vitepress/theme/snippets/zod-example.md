<div class="file-sep">user.schema.ts</div>

```ts
import { z } from 'zod'

const Address = z.object({
  street: z.string(),
  city: z.string(),
  zip: z.string().regex(/^\d{5}$/),
})

const User = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  password: z.string().min(8),
  role: z.enum(['admin', 'user']).optional(),
  address: Address,
})

// Types are derived, not defined
type User = z.infer<typeof User>

// No metadata — labels, examples,
// sensitivity, DB indexes live elsewhere
```

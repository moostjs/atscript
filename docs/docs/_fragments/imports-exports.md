## Key Limitations

1. **No default imports/exports** - Only named exports and imports are supported
2. **No namespace or rename syntax** - No `import * as`, `export * as`, or `import { a as b }`
3. **`.as` files can only import `.as` files** - Cannot import files from the target language

## Named Exports

```atscript
// user.as - Named exports only
export interface User {
    id: string
    name: string
}

export type UserID = string
export type Status = 'active' | 'inactive'

// Private (not exported)
interface InternalConfig {
    debug: boolean
}
```

## Importing in .as Files

In `.as` files, omit the file extension:

```atscript
// app.as
import { User, UserID, Status } from './user'
import { Product } from '../models/product'

export interface Order {
    user: User
    items: Product[]
}
```

## Valid Import/Export Examples

### Basic Named Import/Export

```atscript
// types.as
export interface Person {
    name: string
}

export type ID = string
```

```atscript
// main.as
import { Person, ID } from './types'

export interface Employee extends Person {
    employeeId: ID
}
```

### Multiple Imports from Same File

```atscript
// models.as
export interface User { }
export interface Product { }
export interface Order { }
export type Status = string
```

```atscript
// app.as
import { User, Product, Order, Status } from './models'
```

### Nested Directory Imports

```atscript
// domain/user.as
import { BaseEntity } from '../shared/base'
import { Address } from './types/address'
```

## Invalid Syntax (Not Supported)

```atscript
// ❌ Default exports
export default interface User { }

// ❌ Default imports
import User from './user'

// ❌ Namespace imports
import * as models from './models'

// ❌ Export namespace
export * as utils from './utils'

// ❌ Import with rename
import { User as UserModel } from './user'

// ❌ Re-exports
export { User } from './user'

// ❌ Importing non-.as files
import { helper } from './helper.ts'
```

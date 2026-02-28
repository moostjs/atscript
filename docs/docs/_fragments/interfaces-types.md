## Interfaces

Basic object structure definition:

```atscript
export interface User {
    id: string
    name: string
    age: number
    isActive: boolean
}
```

### Nested & Annotations

```atscript
@db.table 'users'
@db.mongo.collection
export interface User {
    id: string
    profile: {
        name: string
        avatar?: string  // Optional
    }
    settings: {
        theme: 'light' | 'dark'
    }
}
```

## Type Aliases

Type aliases carry metadata and work as runtime objects:

```atscript
@expect.minLength 3
@expect.maxLength 20
export type Username = string

export type Status = 'pending' | 'success' | 'error'
export type ID = string | number
```

## Properties

### Optional & Dynamic

```atscript
export interface Config {
    name: string
    bio?: string                    // Optional
    [*]: string                     // Wildcard - any string props
    [/^x-.*/]: string              // Pattern - props starting with x-
}
```

Common patterns:

- `[/^REACT_APP_.*/]` - Environment variables
- `[/.*_URL$/]` - URL configs
- `[/^social_.*/]` - Social links

## Type References

```atscript
import { Address } from './address'

export interface User {
    address: Address
    friends: User[]          // Self-reference
    manager?: User          // Optional reference
}
```

## Arrays & Complex Types

```atscript
export interface Data {
    tags: string[]                      // Array
    matrix: number[][]                  // 2D array
    tuple: [string, number]             // Tuple
    coords: [number, number, number]    // 3-tuple
}
```

## Intersection Types

```atscript
interface Timestamped {
    createdAt: string
}

interface Post {
    title: string
} & Timestamped  // Has both title and createdAt
```

## Comments

```atscript
// Single-line comment
/* Multi-line
   comment */
```

## Complete Example

```atscript
import { Address } from './address'

@db.table 'users'
@db.mongo.collection
export interface User {
    @meta.id
    _id: mongo.objectId

    username: string
    email: string.email

    profile: {
        bio?: string
        [/^social_.*/]: string  // social_twitter, social_github, etc.
    }

    addresses: Address[]
    status: 'active' | 'inactive'
    createdAt: string.isoDate
}

export type UserStatus = User['status']  // Derived type
```

## Start With Interfaces

Most `.as` files are just interfaces with a few annotations and semantic types:

```atscript
export interface User {
    id: string
    name: string
    age: number
    isActive: boolean
}
```

Use an interface when you want a named object shape that can later be imported, validated, and inspected at runtime.

## Nest Objects Naturally

Inline nested objects work well when the nested shape is local to one model:

```atscript
export interface User {
    id: string
    profile: {
        name: string
        avatar?: string
    }
    settings: {
        theme: 'light' | 'dark'
    }
}
```

If you want to reuse a nested shape across files, give it its own interface or type alias and import it.

## Use Type Aliases For Reusable Values

Type aliases are useful for named primitives, unions, and reusable constraints:

```atscript
@expect.minLength 3
@expect.maxLength 20
export type Username = string

export type Status = 'pending' | 'success' | 'error'
export type ID = string | number
```

Like interfaces, exported type aliases also exist at runtime and can be validated.

## Common Property Patterns

### Optional Properties

```atscript
export interface Config {
    name: string
    bio?: string
}
```

### Arrays, Tuples, And Literals

```atscript
export interface Data {
    tags: string[]
    coords: [number, number]
    status: 'pending' | 'done'
}
```

### Dynamic Keys

If a model needs open-ended keys, use wildcard or pattern properties:

```atscript
export interface EnvConfig {
    NODE_ENV: 'development' | 'production'
    [/^PUBLIC_.*/]: string
}
```

That is useful for configuration objects, custom metadata maps, or other flexible records.

## Reuse Types By Reference

```atscript
import { Address } from './address'

export interface User {
    address: Address
    friends: User[]
    manager?: User
}
```

You can reference other types, self-reference, and use arrays of references naturally.

## Advanced Composition

### Interface Extends

```atscript
interface BaseEntity {
    id: string
    createdAt: string.isoDate
}

interface Timestamped {
    updatedAt: string
}

export interface Post extends BaseEntity, Timestamped {
    title: string
    body: string
}
```

Rules:

- Own properties are added to the inherited ones
- Prop-level annotations are inherited from parents
- Interface-level annotations are not inherited
- Overriding a parent property in a child is not allowed
- Self-extends and circular extends are detected as errors

### Intersection Types

```atscript
interface Timestamped {
    createdAt: string
}

interface Post {
    title: string
} & Timestamped
```

Intersections are useful when you want to combine types inline instead of declaring a new parent interface.

## Practical Example

```atscript
import { Address } from './address'

export interface User {
    id: string.uuid
    username: string.required
    email: string.email

    profile: {
        displayName: string
        bio?: string
        [/^social_.*/]: string
    }

    addresses: Address[]
    status: 'active' | 'inactive' | 'pending'
    createdAt: string.isoDate
}
```

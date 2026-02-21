# `.as` File Syntax — @atscript/typescript

> Writing Atscript files — interfaces, types, annotations, imports, exports, and property syntax.

## Overview

`.as` files look similar to TypeScript but add annotations (metadata) directly on types and properties. They compile to both `.d.ts` (type declarations) and `.js` (runtime metadata).

## Interfaces

Interfaces define object shapes with typed properties:

```as
interface User {
  name: string
  age: number
  email?: string          // optional property
  active: boolean
}
```

### Exported Interfaces

```as
export interface User {
  name: string
  age: number
}
```

### Nested Objects

```as
interface User {
  name: string
  address: {
    street: string
    city: string
    zip: number
  }
}
```

## Types

Type aliases for unions, intersections, tuples, and primitives:

```as
type Status = "active" | "inactive" | "pending"

type StringOrNumber = string | number

type Pair = [string, number]

type ID = string
```

## Annotations

Annotations attach metadata to interfaces, types, or properties using `@` syntax:

```as
@meta.label "User Profile"
@meta.description "A registered user in the system"
interface User {
  @meta.label "Full Name"
  @meta.required
  @expect.minLength 2
  @expect.maxLength 100
  name: string

  @meta.label "Age"
  @expect.min 0
  @expect.max 150
  @expect.int
  age: number

  @meta.label "Email Address"
  @expect.pattern "^[^\s@]+@[^\s@]+\.[^\s@]+$"
  email?: string

  @meta.sensitive
  password: string
}
```

### Annotation Syntax Rules

- Annotations go **above** the property or interface they annotate
- String arguments: `@meta.label "some text"`
- Number arguments: `@expect.min 0`
- No arguments (boolean flag): `@meta.sensitive`
- Multiple arguments: `@expect.pattern "^\\d+$" "i" "Must be digits"`
- Multiple annotations stack on the same target

### Annotate Blocks (Ad-hoc Annotations)

Add annotations to an existing interface without modifying it:

```as
// Non-mutating: creates a new alias with extra annotations
export annotate UserForm = User {
  name {
    @meta.placeholder "Enter your name"
  }
  email {
    @meta.required
  }
}

// Mutating: modifies the original interface's metadata
annotate User {
  name {
    @meta.placeholder "Enter your name"
  }
}
```

## Primitive Types

### Built-in Primitives

| Primitive | Description |
|-----------|-------------|
| `string` | Text data |
| `number` | Numeric data |
| `boolean` | True/false |
| `null` | Null value |
| `void` / `undefined` | No value |
| `never` | Impossible type |
| `phantom` | Metadata-only type (no runtime/schema impact) |

### Primitive Extensions (Subtypes)

Use dot notation for specialized variants:

```as
interface User {
  email: string.email          // email pattern validation
  phone: string.phone          // phone number pattern
  created: string.isoDate      // ISO 8601 date
  id: string.uuid              // UUID v4 format
  username: string.required    // non-empty string

  age: number.int              // integer only
  score: number.positive       // >= 0
  balance: number.negative     // <= 0
  timestamp: number.timestamp  // integer timestamp

  agreed: boolean.required     // must be true (checkbox)
}
```

#### String Extensions

| Extension | Validation |
|-----------|-----------|
| `string.email` | Email format (`^[^\s@]+@[^\s@]+\.[^\s@]+$`) |
| `string.phone` | Phone format (`^\+?[0-9\s-]{10,15}$`) |
| `string.date` | Date string (YYYY-MM-DD, MM/DD/YYYY, etc.) |
| `string.isoDate` | ISO 8601 date/time |
| `string.uuid` | UUID v4 format |
| `string.required` | Non-empty (trimmed length >= 1) |

#### Number Extensions

| Extension | Validation |
|-----------|-----------|
| `number.int` | Integer (no decimals) |
| `number.positive` | >= 0 |
| `number.negative` | <= 0 |
| `number.single` | Single-precision float |
| `number.double` | Double-precision float |
| `number.timestamp` | Integer timestamp |
| `number.int.positive` | Integer >= 0 |
| `number.int.negative` | Integer <= 0 |

#### Boolean Extensions

| Extension | Validation |
|-----------|-----------|
| `boolean.required` | Must be `true` |
| `boolean.true` | Literal true |
| `boolean.false` | Literal false |

## Imports and Exports

```as
// Import from another .as file (no extension needed)
import { User, Address } from "./models/user"

// Export interfaces/types
export interface PublicUser {
  name: string
  email: string
}

export type UserStatus = "active" | "inactive"
```

## Arrays

```as
interface Team {
  members: User[]              // array of User
  scores: number[]             // array of numbers
  matrix: number[][]           // nested array
  tags: (string | number)[]    // array of union
}
```

## Pattern Properties (Dynamic Keys)

```as
interface Config {
  // Regular properties
  name: string

  // Pattern property — any key matching the regex
  /^data_/: string            // keys starting with "data_"
  /^meta_/: number            // keys starting with "meta_"
}
```

## Unions, Intersections, Tuples

```as
// Union types
type Result = Success | Error

// Intersection types
type Admin = User & Permissions

// Tuple types
type Coordinate = [number, number]
type Entry = [string, number, boolean]

// Literal unions
type Direction = "north" | "south" | "east" | "west"
type HttpCode = 200 | 400 | 404 | 500
```

## Phantom Types

Phantom properties are metadata-only — they appear in the type system for traversal but don't affect data shape, validation, or JSON Schema:

```as
interface User {
  name: string
  collectionName: phantom     // discoverable via type traversal, not validated
}
```

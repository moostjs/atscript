Primitives are the basic types that map to fundamental types in virtually any programming language. While different languages may map some primitives to the same base type, each language plugin is responsible for determining how to map the set of primitives provided by Atscript core.

## Basic Primitive Types

Atscript supports the following primitive types:

- **`string`** - Text values
- **`number`** - Numeric values (integers and floats)
- **`boolean`** - True/false values
- **`null`** - Null value
- **`undefined`** - Undefined value (maps to void)
- **`void`** - No value

```atscript
export interface BasicTypes {
    text: string
    count: number
    isEnabled: boolean
    empty: null
    nothing: void
}
```

## Semantic Types (Primitive Extensions)

Primitives can be extended using dot notation to create semantic types. These extensions serve two purposes:

1. **Type refinement** - Extensions help map to the most appropriate type in target languages. For example, `number.double` maps to `number` in TypeScript, but in languages with distinct int, single, and double types, it maps to the appropriate double-precision type.

2. **Implicit validation** - Extensions may automatically add annotations like `@expect.*` for validation constraints.

### String Extensions

String types can be extended to represent specific formats:

```atscript
export interface User {
    id: string.uuid           // UUID format
    email: string.email        // Email address
    phone: string.phone        // Phone number
    birthDate: string.date     // Date string
    createdAt: string.isoDate  // ISO 8601 date
}
```

#### Available String Extensions

**`string.email`**

- Validates email format
- Pattern: `^[^\s@]+@[^\s@]+\.[^\s@]+$`
- Example: `user@example.com`

**`string.phone`**

- Validates phone number format
- Pattern: `^\+?[0-9\s-]{10,15}$`
- Example: `+1 555-123-4567`

**`string.date`**

- Validates common date formats
- Supports: `YYYY-MM-DD`, `MM/DD/YYYY`, `DD-MM-YYYY`, `D Month YYYY`
- Examples: `2024-01-15`, `01/15/2024`, `15-01-2024`, `15 January 2024`

**`string.isoDate`**

- Validates ISO 8601 date format with time
- Supports UTC and timezone offsets
- Examples: `2024-01-15T10:30:00Z`, `2024-01-15T10:30:00+05:00`

**`string.uuid`**

- Validates UUID format
- Pattern: `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`
- Example: `123e4567-e89b-12d3-a456-426614174000`

### Number Extensions

Number types can be extended to represent specific numeric constraints:

```atscript
export interface Product {
    quantity: number.int          // Integer only
    price: number.positive        // >= 0
    discount: number.negative     // <= 0
    weight: number.double         // Double precision
    createdAt: number.timestamp   // Unix timestamp
}
```

#### Available Number Extensions

**`number.int`**

- Must be an integer (no decimals)
- Implicitly adds `@expect.int`
- Can be combined: `number.int.positive`, `number.int.negative`

**`number.positive`**

- Must be greater than or equal to 0
- Implicitly adds `@expect.min 0`
- Can be combined: `number.positive.int`, `number.positive.double`

**`number.negative`**

- Must be less than or equal to 0
- Implicitly adds `@expect.max 0`
- Can be combined: `number.negative.int`, `number.negative.single`

**`number.single`**

- Single-precision floating-point

**`number.double`**

- Double-precision floating-point

**`number.timestamp`**

- Unix timestamp (integer)
- Typically seconds since epoch

### Boolean Extensions

Boolean types can be extended for specific use cases:

```atscript
export interface Settings {
    alwaysOn: boolean.true      // Must be true
    disabled: boolean.false      // Must be false
    toggle: boolean              // Can be true or false
}
```

## Best Practices

1. **Use semantic types** instead of plain primitives when the data has a specific format
2. **Let semantic types handle validation** — don't duplicate with `@expect` annotations
3. **Choose the right extension** — `string.date` vs `string.isoDate` based on your needs
4. **Combine extensions when needed** — `number.int.positive` for counting values, `number.double.negative` for losses

::: tip Combining Extensions
Some extensions can be combined to create more specific types. For example:
- `number.int.positive` — Positive integers only
- `number.double.negative` — Negative double-precision numbers
- `number.single.positive` — Positive single-precision numbers
:::

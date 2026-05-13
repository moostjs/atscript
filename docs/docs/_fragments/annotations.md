Annotations are metadata declarations that provide additional information about types, interfaces, and properties.

## Purpose

Annotations serve multiple purposes:

- **UI metadata** - Labels, placeholders, descriptions for schema-driven UI tools
- **Validation constraints** - Min/max values, patterns, length restrictions
- **Database metadata** - Collection names, indexes, field strategies
- **Documentation** - Descriptions and multi-line documentation
- **Custom metadata** - Any domain-specific information

## Where to Apply

Annotations can be applied anywhere:

```atscript
@meta.description 'User entity'    // Interface annotation
export interface User {
    @meta.id                     // Property annotation
    id: string
}

@expect.minLength 3                // Type annotation
export type Username = string
```

## Annotation Inheritance

### Type to Property

When a property uses a type with annotations, annotations merge with property having priority:

```atscript
@expect.minLength 3
@expect.maxLength 20
export type Username = string

export interface User {
    @expect.maxLength 15    // Overrides type's maxLength
    username: Username       // Inherits minLength: 3, gets maxLength: 15
}
```

### Property References

When a property references another property, annotations merge in order:

1. Final type annotations
2. Referenced property annotations
3. Current property annotations (highest priority)

### Merge Strategies

When annotations are merged (from type inheritance, property references, or ad-hoc annotations), the **merge strategy** determines how same-named annotations combine:

**Replace** (default) — Higher-priority annotations replace lower-priority ones entirely:

```atscript
@expect.min 3
export type PositiveInt = number

export interface Config {
    @expect.min 10          // Replaces type's @expect.min 3
    threshold: PositiveInt   // Result: @expect.min is 10
}
```

**Append** — Both values are kept, accumulating into an array:

```atscript
@expect.pattern '^[a-z]+$'
export type SafeString = string

export interface Form {
    @expect.pattern '^\S+$', 'i', 'No spaces'
    code: SafeString
    // Result: both patterns are validated
}
```

The strategy is configured per annotation via `AnnotationSpec`. Most annotations use replace. The built-in `@expect.pattern` uses append.

### Repeatable Annotations

Annotations marked with `multiple: true` can appear more than once on the same node. Their values are stored as arrays:

```atscript
export interface User {
    @expect.pattern '^[A-Z]'
    @expect.pattern '.{3,}'
    name: string
}
```

When merged, how repeated annotations combine depends on the merge strategy:

- **`multiple: true` + replace** (default) — The higher-priority set replaces the entire array
- **`multiple: true` + append** — Values from both sides are concatenated into a single array

## Annotation Syntax

```atscript
@meta.label 'User Name'           // With argument
@meta.sensitive                   // Flag (no argument)
@expect.pattern "^[A-Z]", "i"     // Multiple arguments
@meta.documentation 'Line 1'      // Can be repeated
@meta.documentation 'Line 2'
```

Arguments can be optional. Annotations without arguments are flag annotations.

## Core Annotations

Atscript provides common-purpose annotations:

### Meta Annotations (@meta.\*)

- `@meta.label 'text'` - Human-readable label
- `@meta.id` - Marks identifier field (multiple fields form composite PK)
- `@meta.description 'text'` - Field description
- `@meta.documentation 'text'` - Multi-line docs (repeatable)
- `@meta.sensitive` - Marks sensitive data
- `@meta.readonly` - Read-only field
- `@meta.default 'value'` - Default value (string as-is, other types parsed as JSON)
- `@meta.example 'value'` - Example value (string as-is, other types parsed as JSON)

### UI Annotations (@ui.\*)

`@ui.*` annotations (placeholders, form layout hints, component overrides) are provided by a separate UI plugin, not by `@atscript/typescript` itself. See the UI plugin docs for the full reference. The annotation _shape_ shown in this guide (`@ui.placeholder 'text'`, `@ui.component 'name'`, etc.) follows the same syntax rules as the other namespaces above.

### Validation Annotations (@expect.\*)

- `@expect.minLength 5, "Custom error message"` - Minimum string/array length (optional message)
- `@expect.maxLength 100, "Custom error message"` - Maximum string/array length (optional message)
- `@expect.min 0, "Custom error message"` - Minimum number value (optional message)
- `@expect.max 100, "Custom error message"` - Maximum number value (optional message)
- `@expect.int "Custom error message"` - Must be integer (optional message)
- `@expect.pattern "regex", "flags", "message"` - Pattern validation (repeatable, optional message)
- `@expect.array.uniqueItems "Custom error message"` - Enforce unique items in an array (by key fields if defined, otherwise by deep equality; optional message)
- `@expect.array.key "Custom error message"` - Mark a field as a key inside an array of objects (used for uniqueness checks, lookups, and patch operations; does not enforce uniqueness by itself; optional message)

`@expect.array.key` has compile-time constraints: the field must be `string` or `number`, cannot be optional, and multiple key fields form a **composite key**.

All validation annotations accept an optional custom error message as the last argument. When validation fails, the custom message is used instead of the default error message.

#### Array Annotations Example

`@expect.array.uniqueItems` and `@expect.array.key` work together to enforce unique array elements by identity fields:

```atscript
interface Order {
    @meta.id
    id: number

    @expect.array.uniqueItems "Duplicate line items"
    items: OrderItem[]
}

interface OrderItem {
    @expect.array.key
    productId: number

    quantity: number
    price: number
}
```

For primitive arrays, `@expect.array.uniqueItems` checks by deep equality — no `@expect.array.key` needed:

```atscript
interface Product {
    @expect.array.uniqueItems "Tags must be unique"
    tags: string[]
}
```

### Form Validation (@meta.required)

- `@meta.required` or `@meta.required "Custom error message"` - For strings: must contain at least one non-whitespace character. For booleans: must be `true` (optional message)

::: tip Form Validation
Use `string.required` or `@meta.required` to ensure required string fields are not empty or whitespace-only. A plain `string` type accepts `''` as valid — `@meta.required` catches this common form validation gap. For checkboxes, `@meta.required` on a `boolean` field ensures the value is `true` (e.g., "accept terms").
:::

### Emit Annotations (@emit.\*)

- `@emit.jsonSchema` — Pre-compute and embed the JSON Schema for an interface at build time, regardless of the global `jsonSchema` plugin setting

### Database Annotations (@db.\*)

Database annotations (tables, columns, indexes, relations, views, schema sync) are provided by a separate package, `@atscript/db/plugin`, and are documented at [https://db.atscript.dev](https://db.atscript.dev). Install the DB plugin from that ecosystem to register `@db.*` annotations in your project.

### Special Annotation Argument Types

Some annotations accept special argument types beyond strings and numbers:

- **Ref arguments** — Type references using dot-notation chains (e.g., `User.id`). Custom annotations can declare `type: 'ref'` arguments.
- **Query arguments** — SQL-like expressions in backticks (e.g., `` `Task.status != 'done'` ``). Custom annotations can declare `type: 'query'` arguments.

Annotations are metadata declarations that provide additional information about types, interfaces, and properties.

## Purpose

Annotations serve multiple purposes:

- **UI metadata** - Labels, placeholders, descriptions for form generation
- **Validation constraints** - Min/max values, patterns, length restrictions
- **Database metadata** - Collection names, indexes, field strategies
- **Documentation** - Descriptions and multi-line documentation
- **Custom metadata** - Any domain-specific information

## Where to Apply

Annotations can be applied anywhere:

```atscript
@meta.description 'User entity'    // Interface annotation
export interface User {
    @meta.id                       // Property annotation
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
@expect.pattern '^[a-z]+$', '', 'Must be lowercase'
export type SafeString = string

export interface Form {
    @expect.pattern '^\S+$', '', 'No spaces'
    code: SafeString
    // Result: both patterns are validated
}
```

The strategy is configured per annotation via `AnnotationSpec`. Most annotations use replace. The built-in `@expect.pattern` uses append.

### Repeatable Annotations

Annotations marked with `multiple: true` can appear more than once on the same node. Their values are stored as arrays:

```atscript
export interface User {
    @expect.pattern '^[A-Z]', '', 'Must start with uppercase'
    @expect.pattern '.{3,}', '', 'Must be at least 3 characters'
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
- `@meta.id` or `@meta.id 'name'` - Marks identifier field
- `@meta.description 'text'` - Field description
- `@meta.documentation 'text'` - Multi-line docs (repeatable)
- `@meta.placeholder 'text'` - UI placeholder text
- `@meta.sensitive` - Marks sensitive data
- `@meta.readonly` - Read-only field
- `@meta.isKey` - Key field in arrays for lookups

### Validation Annotations (@expect.\*)

- `@expect.minLength 5, "Custom error message"` - Minimum string/array length (optional message)
- `@expect.maxLength 100, "Custom error message"` - Maximum string/array length (optional message)
- `@expect.min 0, "Custom error message"` - Minimum number value (optional message)
- `@expect.max 100, "Custom error message"` - Maximum number value (optional message)
- `@expect.int` - Must be integer
- `@expect.pattern "regex", "flags", "message"` - Pattern validation (repeatable, optional message)

All validation annotations (except `@expect.int`) accept an optional custom error message as the last argument. When validation fails, the custom message is used instead of the default error message.

### Form Validation (@meta.required)

- `@meta.required` or `@meta.required "Custom error message"` - For strings: must contain at least one non-whitespace character. For booleans: must be `true` (optional message)

::: tip Form Validation
Use `string.required` or `@meta.required` to ensure required string fields are not empty or whitespace-only. A plain `string` type accepts `''` as valid — `@meta.required` catches this common form validation gap. For checkboxes, `@meta.required` on a `boolean` field ensures the value is `true` (e.g., "accept terms").
:::

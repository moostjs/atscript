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
- `@meta.id` - Marks identifier field (multiple fields form composite PK)
- `@meta.description 'text'` - Field description
- `@meta.documentation 'text'` - Multi-line docs (repeatable)
- `@meta.sensitive` - Marks sensitive data
- `@meta.readonly` - Read-only field
- `@meta.default 'value'` - Default value (string as-is, other types parsed as JSON)
- `@meta.example 'value'` - Example value (string as-is, other types parsed as JSON)

### UI Annotations (@ui.\*)

- `@ui.placeholder 'text'` - Input placeholder text
- `@ui.component 'name'` - UI component hint (e.g., `"select"`, `"datepicker"`)
- `@ui.hidden` - Hide field from UI forms and tables
- `@ui.group 'name'` - Group fields into form sections
- `@ui.order 1` - Display order in auto-generated forms
- `@ui.width 'half'` - Layout width hint (e.g., `"half"`, `"full"`, `"third"`)
- `@ui.icon 'name'` - Icon hint for the field or entity
- `@ui.hint 'text'` - Help text or tooltip
- `@ui.disabled` - Mark field as non-interactive
- `@ui.type 'textarea'` - Input type (maps to HTML input types: `"text"`, `"textarea"`, `"password"`, etc.)
- `@ui.attr 'key', 'value'` - Pass arbitrary HTML/component attributes (repeatable)
- `@ui.class 'names'` - CSS class names (repeatable)
- `@ui.style 'css'` - Inline CSS styles (repeatable)

### Validation Annotations (@expect.\*)

- `@expect.minLength 5, "Custom error message"` - Minimum string/array length (optional message)
- `@expect.maxLength 100, "Custom error message"` - Maximum string/array length (optional message)
- `@expect.min 0, "Custom error message"` - Minimum number value (optional message)
- `@expect.max 100, "Custom error message"` - Maximum number value (optional message)
- `@expect.int "Custom error message"` - Must be integer (optional message)
- `@expect.pattern "regex", "flags", "message"` - Pattern validation (repeatable, optional message)
- `@expect.array.uniqueItems "Custom error message"` - Enforce unique items in an array (by key fields if defined, otherwise by deep equality; optional message)
- `@expect.array.key` - Mark a field as a key inside an array of objects (used for uniqueness checks, lookups, and patch operations; does not enforce uniqueness by itself)

`@expect.array.key` has compile-time constraints: the field must be `string` or `number`, cannot be optional, and multiple key fields form a **composite key**.

All validation annotations accept an optional custom error message as the last argument (except `@expect.array.key`). When validation fails, the custom message is used instead of the default error message.

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

### Database Annotations (@db.\*)

Atscript ships a comprehensive set of database annotations for defining tables, relations, views, indexes, and more. These are covered in detail in the [DB Integrations](/db-integrations/) documentation:

- `@db.table`, `@db.schema` — Table definitions
- `@db.column`, `@db.json`, `@db.ignore` — Column configuration
- `@db.default`, `@db.default.fn` — Default values
- `@db.index.plain`, `@db.index.unique`, `@db.index.fulltext` — Indexes
- `@db.rel.FK`, `@db.rel.to`, `@db.rel.from`, `@db.rel.via`, `@db.rel.onDelete`, `@db.rel.onUpdate`, `@db.rel.filter` — Relations
- `@db.view`, `@db.view.for`, `@db.view.joins`, `@db.view.filter`, `@db.view.materialized`, `@db.view.renamed` — Views
- `@db.patch.strategy` — Patch behavior for nested objects
- `@db.sync.method`, `@db.table.renamed`, `@db.column.renamed` — Schema sync
- `@emit.jsonSchema` — Pre-compute and embed JSON Schema at build time

See the [Annotations Reference](/db-integrations/annotations) for the complete list.

### Special Annotation Argument Types

Some annotations accept special argument types beyond strings and numbers:

- **Ref arguments** — Type references using dot-notation chains (e.g., `User.id`). Used by `@db.rel.FK` and `@db.view.for` to reference fields on other types.
- **Query arguments** — SQL-like expressions in backticks (e.g., `` `Task.status != 'done'` ``). Used by `@db.view.filter`, `@db.view.joins`, and `@db.rel.filter` for conditions.

See [Query Expressions](/db-integrations/query-expressions) for the full query syntax.

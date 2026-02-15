Ad-hoc annotations let you attach metadata to an existing interface or type without modifying its original definition. This works with both `interface` and `type` definitions, including primitive-based types and union types. This is useful when the original type is defined in another file, shared across modules, or when you need context-specific metadata variations.

## Syntax

There are two forms: **mutating** and **non-mutating**.

### Mutating

Injects annotations directly into the target definition at runtime:

```atscript
import { User } from './user'

annotate User {
    @meta.label 'Full Name'
    name
    @meta.label 'Email Address'
    email
}
```

The `User` type's metadata is modified in-place when this module is loaded. No new type is created.

### Non-mutating (Alias)

Creates a new named type that inherits the target's structure with overridden annotations:

```atscript
import { User } from './user'

export annotate User as UserForm {
    @meta.label 'Full Name'
    name
    @meta.label 'Email Address'
    email
}
```

`UserForm` is a standalone type with its own class, type definition, and metadata. `User` remains unchanged.

## Entry Syntax

Each entry inside the annotate block references a property of the target type by name. Annotations placed before the entry are applied to that property.

```atscript
annotate User {
    @meta.label 'Name'        // annotation for the property
    name                       // property reference

    @meta.placeholder 'you@example.com'
    @expect.maxLength 100
    email                      // multiple annotations on one property
}
```

### Deep Property Chains

For nested object properties, use dot notation:

```atscript
annotate User {
    @meta.label 'Street Address'
    address.street

    @meta.label 'City'
    address.city
}
```

This navigates into the nested `address` structure and annotates its `city` and `street` properties.

## Top-level Annotations

Annotations placed before the `annotate` keyword apply to the type itself (not to individual properties):

```atscript
@meta.description 'User registration form'
annotate User as RegistrationForm {
    @meta.label 'Username'
    name
}
```

For mutating annotate, top-level annotations modify the target's own metadata:

```atscript
@meta.description 'Admin user'
annotate User {
    @meta.label 'Admin Name'
    name
}
```

This sets `User.metadata.get("meta.description")` to `"Admin user"` at runtime.

For non-mutating annotate, top-level annotations on the alias replace the original's. Annotations from the original that are not overridden are carried over to the alias.

## Annotation Merging

When ad-hoc annotations target properties that already have annotations, the merge strategy determines how values combine.

### Replace Strategy (default)

For annotations with the default replace strategy, the ad-hoc annotation **replaces** the original:

```atscript
export interface User {
    @meta.label 'Original Name'
    name: string
}

annotate User {
    @meta.label 'Admin Name'    // Replaces 'Original Name'
    name
}
// Result: name's label is 'Admin Name'
```

For repeatable annotations (`multiple: true`) with replace strategy, the **entire set** is replaced:

```atscript
export interface Config {
    @tag 'alpha'
    @tag 'beta'
    feature: string
}

annotate Config {
    @tag 'production'           // Replaces both 'alpha' and 'beta'
    feature
}
// Result: feature's tags are ['production'], not ['alpha', 'beta', 'production']
```

### Append Strategy

For annotations configured with `mergeStrategy: 'append'`, ad-hoc values are **added** to the existing ones:

```atscript
export interface User {
    @expect.pattern '^[A-Z]', '', 'Must start uppercase'
    name: string
}

annotate User {
    @expect.pattern '.{3,}', '', 'Min 3 chars'   // Added, not replaced
    name
}
// Result: both patterns are validated
```

### Non-mutating Aliases

Non-mutating annotate creates a new type with annotations merged from the original. The original is not affected:

```atscript
@meta.description 'Base user'
export interface User {
    @meta.label 'Name'
    @tag 'core'
    name: string
}

export annotate User as AdminUser {
    @meta.label 'Admin Name'   // Replaces 'Name'
    @tag 'admin'               // Appends to ['core'] → ['admin', 'core']
    name
}
// User is unchanged. AdminUser has merged annotations.
```

## Annotating Types

The examples above use `interface` targets, but ad-hoc annotations work equally well with `type` definitions.

### Primitive-based Types

For types based on primitives or primitive unions, use top-level annotations with an empty block:

```atscript
export type Username = string | number

// Mutating: adds a label to Username itself
@meta.label 'User Name'
annotate Username {}

// Non-mutating: creates a labeled alias
@meta.label 'Form Name'
export annotate Username as FormName {}
```

Since primitive types have no properties, the block body is empty — only top-level annotations apply.

### Union Types with Properties

For types that are unions of object structures, you can annotate properties by name. The compiler resolves each property across all union branches:

```atscript
type Response = {
    status: string
    data: string
} | {
    status: string
    error: string
}

annotate Response {
    @meta.label 'Status'
    status
}
```

When a property like `status` appears in multiple union branches, the annotation is applied to every matching branch at runtime.

Properties that don't exist in any branch are reported as errors:

```atscript
annotate Response {
    @meta.label 'Color'
    color              // Error: unknown property "color" in "Response"
}
```

## Cross-file Usage

Ad-hoc annotations work with imported types. Import the target type, then annotate it:

```atscript
import { User } from './user'

// Mutating: modifies the imported User
annotate User {
    @meta.label 'Name'
    name
}

// Non-mutating: creates a local alias
export annotate User as AdminUser {
    @meta.label 'Admin Name'
    name
}
```

## Export Rules

Non-mutating annotate can be exported:

```atscript
export annotate User as UserForm { ... }
```

Mutating annotate **cannot** be exported (it modifies an existing type, not defines a new one):

```atscript
// Error: Cannot export mutating ad-hoc annotations block
export annotate User { ... }
```

## Tree-shaking

When using a bundler (Vite, Rollup, etc.) with `unplugin-atscript`, tree-shaking works automatically:

- **Mutating annotate** produces side effects (runtime metadata mutations), so the module is included when the target type is used
- **Non-mutating annotate** produces a standalone class. If `UserForm` is never imported by consuming code, the bundler removes it

The unplugin sets `moduleSideEffects: false` to enable this behavior.

## Generated Output

### Non-mutating

A non-mutating annotate generates a standalone class identical in structure to the target, with annotations merged:

```atscript
// user-form.as
import { User } from './user'

export annotate User as UserForm {
    @meta.label 'Form Name'
    name
}
```

The generated JS creates `UserForm` as its own class with the full type definition inlined, applying `"Form Name"` as the label for `name` while preserving all other annotations from `User`.

### Mutating

A mutating annotate generates runtime mutation code that modifies the target's metadata directly:

```atscript
// admin.as
import { User } from './user'

annotate User {
    @meta.label 'Admin Name'
    name
    @meta.label 'Admin City'
    address.city
}
```

The generated code imports `User` and mutates metadata on its `name` and `address.city` properties at runtime, applying the annotation merge strategy (replace or append) for each annotation.

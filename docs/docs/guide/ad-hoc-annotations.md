# Ad-hoc Annotations

Ad-hoc annotations let you attach metadata to an existing interface or type without modifying its original definition. This is useful when the original type is defined in another file, shared across modules, or when you need context-specific metadata variations.

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

The generated JS imports `User` and sets metadata on its properties:

```javascript
User.type.props.get("name")?.metadata.set("meta.label", "Admin Name")
User.type.props.get("address")?.type.props.get("city")?.metadata.set("meta.label", "Admin City")
```

## Next Steps

- [Annotations](/guide/annotations) - Core annotation system
- [Interfaces & Types](/guide/interfaces-types) - Type definitions
- [Build Setup](/guide/build-setup) - Bundler integration

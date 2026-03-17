# Annotations Guide

Annotations attach metadata to a type, interface, or property.

In practice, most application code uses annotations for three things:

- labels and app-facing metadata
- validation rules
- UI-facing hints that stay close to the model

## Start With One Small Example

```atscript
export interface User {
    @meta.label 'Full Name'
    @expect.minLength 2
    name: string

    @meta.label 'Email Address'
    email: string.email

    @ui.placeholder 'Optional biography'
    bio?: string
}
```

That model now carries:

- the TypeScript data shape
- runtime validation rules
- metadata that application code can read later

## `@meta.*`: Labels And App Metadata

Use `@meta.*` annotations for information your app or tooling may want to read at runtime.

Common examples:

- `@meta.label` — a human-friendly field name
- `@meta.description` — longer help text
- `@meta.readonly` — read-only fields
- `@meta.sensitive` — fields that deserve extra care
- `@meta.example` — example data for docs or tooling

```atscript
export interface Product {
    @meta.label 'Product Name'
    @meta.description 'Shown in the catalog and checkout'
    name: string
}
```

## `@expect.*`: Validation Rules

Use `@expect.*` when the validation rule is specific to this field and is not already covered by a semantic type.

```atscript
export interface SignupForm {
    @expect.minLength 3
    @expect.maxLength 20
    username: string

    @expect.min 18
    age: number.int
}
```

Common validation annotations:

- `@expect.minLength`
- `@expect.maxLength`
- `@expect.min`
- `@expect.max`
- `@expect.int`
- `@expect.pattern`

If the field already reads naturally as `string.email` or `number.int.positive`, prefer the semantic type instead of repeating the same rule with annotations.

## `@ui.*`: UI-Facing Hints

Use `@ui.*` when the model should carry hints that UI tooling can read later.

```atscript
export interface ProfileForm {
    @meta.label 'Biography'
    @ui.placeholder 'Tell us about yourself'
    @ui.type 'textarea'
    bio?: string
}
```

Common examples:

- `@ui.placeholder`
- `@ui.type`
- `@ui.hint`
- `@ui.group`
- `@ui.order`
- `@ui.hidden`

These annotations do not generate UI by themselves. They keep the UI-relevant metadata on the model so tools can read it later.

## Reuse Annotations Through Named Types

Annotations on a named type are reused when that type is referenced elsewhere.

```atscript
@meta.label 'Username'
@expect.minLength 3
export type Username = string

export interface User {
    username: Username
}
```

That is useful for rules and labels you want to repeat consistently across models.

## The One Merge Rule Most Users Need

If a property adds its own annotation, the property-level value wins over the reused one.

```atscript
@expect.minLength 3
export type Username = string

export interface User {
    @expect.minLength 5
    username: Username
}
```

In that case, `username` uses `5`, not `3`.

For deeper details like append-vs-replace behavior, repeatable annotations, and the full catalog, use the [Annotations Reference](/packages/typescript/annotations-reference).

## Keep Annotations Practical

- Use semantic types first, annotations second.
- Put labels and descriptions on the model, not in a separate UI config file.
- Keep validation rules close to the field they apply to.
- Use custom annotations only when your app or tooling will actually read them.
- For DB-specific annotations, use the [Database Layer](https://db.atscript.dev/guide/) docs.

## Next Steps

- [Annotations Reference](/packages/typescript/annotations-reference) — full syntax, inheritance, and built-in annotation catalog
- [Validation Guide](/packages/typescript/validation) — how annotations become runtime validation
- [Ad-hoc Annotations](/packages/typescript/ad-hoc-annotations) — annotate existing types without modifying their definition
- [Custom Annotations](/packages/typescript/custom-annotations) — define your own annotation types
- [Metadata](/packages/typescript/metadata-export) — access annotations at runtime

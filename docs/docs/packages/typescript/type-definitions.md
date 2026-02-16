# Type Definitions

Every Atscript type compiles to a runtime `TAtscriptAnnotatedType` object that carries the type structure, metadata, and a validator factory. This page covers the runtime type system, automatic DataType inferring, and type traversal.

All runtime utilities are imported from `@atscript/typescript/utils`.

## The Annotated Type

`TAtscriptAnnotatedType` is the core runtime representation of any Atscript type:

```typescript
interface TAtscriptAnnotatedType<T = TAtscriptTypeDef, DataType = InferDataType<T>> {
  __is_atscript_annotated_type: true
  type: T              // the type definition (object, array, union, etc.)
  metadata: TMetadataMap<AtscriptMetadata>  // annotation values
  validator: (opts?) => Validator            // creates a validator instance
  optional?: boolean
}
```

Generated interfaces expose this as static members:

```typescript
import { Product } from './product.as'

Product.type          // TAtscriptTypeObject — the type structure
Product.metadata      // TMetadataMap — top-level annotations
Product.validator()   // Validator<typeof Product> — with type guard support
```

## Type Kinds

The `type` field is one of these shapes, distinguished by `kind`:

| Kind | Interface | Description |
|------|-----------|-------------|
| `''` | `TAtscriptTypeFinal` | Primitives and literals — `designType`, optional `value` |
| `'object'` | `TAtscriptTypeObject` | Named `props` (Map) and `propsPatterns` (regex-matched keys) |
| `'array'` | `TAtscriptTypeArray` | Element type in `of` |
| `'union'` | `TAtscriptTypeComplex` | Alternatives in `items` |
| `'intersection'` | `TAtscriptTypeComplex` | Combined types in `items` |
| `'tuple'` | `TAtscriptTypeComplex` | Positional types in `items` |

Each shape also has a `tags` set — semantic type tags like `'email'`, `'uuid'`, `'positive'` that come from primitives like `string.email`.

## DataType Inferring

Each type definition interface carries a phantom `DataType` generic:

```typescript
interface TAtscriptTypeObject<K extends string, DataType = Record<K, unknown>> {
  // ...
  __dataType?: DataType  // phantom — never set at runtime
}
```

This allows TypeScript to automatically infer the data shape. When you call `.validator()` on a generated type, the `Validator` extracts `DataType` from the type definition — so `validate()` acts as a **type guard** without any manual generic parameters:

```typescript
import { Product } from './product.as'

function processData(data: unknown) {
  const validator = Product.validator()

  if (validator.validate(data, true)) {
    // TypeScript knows data is Product here
    console.log(data.name, data.price)
  }
}
```

Use `InferDataType<T>` to extract the DataType from any type definition:

```typescript
import type { InferDataType, TAtscriptTypeObject } from '@atscript/typescript/utils'

type MyData = InferDataType<TAtscriptTypeObject<'name' | 'age', { name: string; age: number }>>
// MyData = { name: string; age: number }
```

## Type Traversal

Atscript types form a tree — objects contain props, arrays wrap an element type, unions hold alternatives. The `forAnnotatedType()` helper provides type-safe dispatch over this tree, replacing manual `switch (def.type.kind)` patterns.

### `forAnnotatedType()`

Supply a handler for each type kind. Each handler receives the correctly narrowed type:

```typescript
import { forAnnotatedType } from '@atscript/typescript/utils'

const description = forAnnotatedType(someType, {
  final:        (d) => `primitive: ${d.type.designType}`,
  object:       (d) => `object with ${d.type.props.size} props`,
  array:        (d) => `array`,
  union:        (d) => `union of ${d.type.items.length}`,
  intersection: (d) => `intersection of ${d.type.items.length}`,
  tuple:        (d) => `tuple of ${d.type.items.length}`,
  phantom:      (d) => `phantom element`,  // optional
})
```

| Handler | Receives | Key fields |
|---------|----------|------------|
| `final` | `TAtscriptAnnotatedType<TAtscriptTypeFinal>` | `designType`, `value`, `tags` |
| `object` | `TAtscriptAnnotatedType<TAtscriptTypeObject>` | `props` (Map), `propsPatterns` |
| `array` | `TAtscriptAnnotatedType<TAtscriptTypeArray>` | `of` (element type) |
| `union` | `TAtscriptAnnotatedType<TAtscriptTypeComplex>` | `items` (alternatives) |
| `intersection` | `TAtscriptAnnotatedType<TAtscriptTypeComplex>` | `items` (combined types) |
| `tuple` | `TAtscriptAnnotatedType<TAtscriptTypeComplex>` | `items` (positional types) |
| `phantom` _(optional)_ | `TAtscriptAnnotatedType<TAtscriptTypeFinal>` | Same as `final`, `designType === 'phantom'` |

The optional `phantom` handler intercepts [phantom](/packages/typescript/primitives#phantom-type) types before they reach `final`. If omitted, phantom types fall through to `final`.

### Recursive Walking

`forAnnotatedType` dispatches a single node — recursion is up to you. This gives full control over how deep to walk and what to collect. Here's a general pattern:

```typescript
import { forAnnotatedType, isPhantomType } from '@atscript/typescript/utils'
import type { TAtscriptAnnotatedType } from '@atscript/typescript/utils'

function walkType(def: TAtscriptAnnotatedType, path: string, visit: (path: string, def: TAtscriptAnnotatedType) => void) {
  visit(path, def)

  forAnnotatedType(def, {
    final() {},       // leaf node — nothing to recurse into
    phantom() {},     // non-data leaf — skip or handle separately

    object(d) {
      for (const [key, prop] of d.type.props.entries()) {
        walkType(prop, path ? `${path}.${key}` : key, visit)
      }
    },

    array(d) {
      walkType(d.type.of, `${path}[]`, visit)
    },

    union(d) {
      d.type.items.forEach((item, i) => walkType(item, `${path}|${i}`, visit))
    },

    intersection(d) {
      d.type.items.forEach((item, i) => walkType(item, `${path}&${i}`, visit))
    },

    tuple(d) {
      d.type.items.forEach((item, i) => walkType(item, `${path}[${i}]`, visit))
    },
  })
}
```

### Example: Collecting Form Field Metadata

Given this `.as` file:

```atscript
export interface SignupForm {
    @label "Full Name"
    @placeholder "Enter your name"
    name: string

    @label "Email Address"
    email: string.email

    @label "Password"
    @sensitive
    password: string

    @label "Already have an account? Sign in"
    @component "link"
    @href "/login"
    signIn: phantom
}
```

Walk the type to build a form descriptor:

```typescript
import { SignupForm } from './signup-form.as'
import { forAnnotatedType, isPhantomType } from '@atscript/typescript/utils'
import type { TAtscriptAnnotatedType } from '@atscript/typescript/utils'

interface FormField {
  key: string
  label: string
  type: 'input' | 'phantom'
  tags: string[]
  metadata: Record<string, unknown>
}

function collectFields(def: TAtscriptAnnotatedType): FormField[] {
  if (def.type.kind !== 'object') return []

  const fields: FormField[] = []

  for (const [key, prop] of def.type.props.entries()) {
    const label = (prop.metadata.get('label') as string) || key

    if (isPhantomType(prop)) {
      // Non-data element — collect its annotations for the renderer
      fields.push({
        key,
        label,
        type: 'phantom',
        tags: [...prop.type.tags],
        metadata: Object.fromEntries(prop.metadata),
      })
      continue
    }

    fields.push({
      key,
      label,
      type: 'input',
      tags: [...prop.type.tags],
      metadata: Object.fromEntries(prop.metadata),
    })
  }

  return fields
}

const fields = collectFields(SignupForm)
// [
//   { key: 'name',     label: 'Full Name',  type: 'input',   tags: ['string'], ... },
//   { key: 'email',    label: 'Email Address', type: 'input', tags: ['email', 'string'], ... },
//   { key: 'password', label: 'Password',   type: 'input',   tags: ['string'], ... },
//   { key: 'signIn',   label: 'Already have an account? Sign in', type: 'phantom',
//     tags: ['phantom'], metadata: { label: '...', component: 'link', href: '/login' } },
// ]
```

### Example: Flattening Nested Types

Walk a deeply nested type to produce a flat map of all leaf paths and their `designType`:

```typescript
import { forAnnotatedType, isPhantomType } from '@atscript/typescript/utils'
import type { TAtscriptAnnotatedType } from '@atscript/typescript/utils'

function flattenType(def: TAtscriptAnnotatedType, prefix = ''): Record<string, string> {
  return forAnnotatedType(def, {
    final: (d) => ({ [prefix || '(root)']: d.type.designType }),
    phantom: () => ({}),  // skip phantom props

    object(d) {
      let result: Record<string, string> = {}
      for (const [key, prop] of d.type.props.entries()) {
        if (!isPhantomType(prop)) {
          Object.assign(result, flattenType(prop, prefix ? `${prefix}.${key}` : key))
        }
      }
      return result
    },

    array: (d) => flattenType(d.type.of, `${prefix}[]`),

    union(d) {
      let result: Record<string, string> = {}
      for (const item of d.type.items) {
        Object.assign(result, flattenType(item, prefix))
      }
      return result
    },

    intersection(d) {
      let result: Record<string, string> = {}
      for (const item of d.type.items) {
        Object.assign(result, flattenType(item, prefix))
      }
      return result
    },

    tuple(d) {
      let result: Record<string, string> = {}
      d.type.items.forEach((item, i) => {
        Object.assign(result, flattenType(item, `${prefix}[${i}]`))
      })
      return result
    },
  })
}

// flattenType(Product) → { 'name': 'string', 'price': 'number', 'tags[]': 'string', ... }
```

This is the same pattern used internally by the [Validator](/packages/typescript/validation), [JSON Schema builder](/packages/typescript/json-schema), [serializer](/packages/typescript/serialization), and [MongoDB collection](/packages/mongo/) flat-map builder.

## Building Types at Runtime

`defineAnnotatedType()` creates types programmatically using a fluent builder:

```typescript
import { defineAnnotatedType } from '@atscript/typescript/utils'

const userType = defineAnnotatedType('object')
  .prop('name', defineAnnotatedType().designType('string').$type)
  .prop('age', defineAnnotatedType().designType('number').$type)
  .annotate('meta.label', 'User')
  .$type

// userType is a fully functional TAtscriptAnnotatedType
userType.validator().validate({ name: 'Alice', age: 30 })
```

The handle provides methods like `.designType()`, `.value()`, `.tags()`, `.of()` (arrays), `.item()` (unions/tuples), `.prop()` / `.propPattern()` (objects), `.optional()`, `.annotate()`, and `.refTo()`.

## Type Guards

- `isAnnotatedType(value)` — returns `true` if the value is a `TAtscriptAnnotatedType`
- `isAnnotatedTypeOfPrimitive(type)` — returns `true` if the type resolves to a primitive shape (not object or array). Recursively checks union/intersection/tuple members.
- `isPhantomType(def)` — returns `true` if the type is a [phantom](/packages/typescript/primitives#phantom-type) type (`kind === ''` and `designType === 'phantom'`)

## Next Steps

- [Validation](/packages/typescript/validation) — validate data against annotated types
- [JSON Schema](/packages/typescript/json-schema) — generate JSON Schema from types
- [Serialization](/packages/typescript/serialization) — serialize types for transport

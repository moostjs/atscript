# Utility Functions — @atscript/typescript

> All publicly exported utility functions: serialization, flattening, JSON Schema, data creation, and type traversal.

## Exports Overview

All utilities are exported from `@atscript/typescript/utils`:

```ts
import {
  // Type construction
  defineAnnotatedType, annotate,
  // Type checking
  isAnnotatedType, isAnnotatedTypeOfPrimitive, isPhantomType,
  // Type traversal
  forAnnotatedType,
  // Validation
  Validator, ValidatorError,
  // JSON Schema
  buildJsonSchema, fromJsonSchema,
  // Serialization
  serializeAnnotatedType, deserializeAnnotatedType, SERIALIZE_VERSION,
  // Flattening
  flattenAnnotatedType,
  // Data creation
  createDataFromAnnotatedType,
  // Feature gating (used by generated code)
  throwFeatureDisabled,
} from '@atscript/typescript/utils'
```

### `throwFeatureDisabled(feature, option, annotation)`

Throws a runtime error indicating a feature is disabled. Used by generated `.js` files to avoid duplicating the error message string across all classes. Called as `$d("JSON Schema", "jsonSchema", "emit.jsonSchema")` in generated code when `jsonSchema: false`.

## `forAnnotatedType(def, handlers)` — Type-Safe Dispatch

Dispatches over `TAtscriptAnnotatedType` by its `type.kind`, providing type-narrowed handlers:

```ts
import { forAnnotatedType } from '@atscript/typescript/utils'

const description = forAnnotatedType(someType, {
  final(d)        { return `${d.type.designType}` },
  object(d)       { return `object(${d.type.props.size} props)` },
  array(d)        { return `array` },
  union(d)        { return `union(${d.type.items.length})` },
  intersection(d) { return `intersection(${d.type.items.length})` },
  tuple(d)        { return `[${d.type.items.length}]` },
  phantom(d)      { return `phantom` },  // optional — without it, phantoms go to final
})
```

All handlers except `phantom` are required. Each handler receives the type with its `type` field narrowed to the specific kind.

## `buildJsonSchema(type)` — Annotated Type → JSON Schema

Converts an annotated type into a standard JSON Schema object, translating validation metadata:

```ts
import { buildJsonSchema } from '@atscript/typescript/utils'
import { User } from './models/user.as'

const schema = buildJsonSchema(User)
// {
//   type: 'object',
//   properties: {
//     name: { type: 'string', minLength: 2, maxLength: 100 },
//     age: { type: 'integer', minimum: 0, maximum: 150 },
//     email: { type: 'string', pattern: '...' },
//   },
//   required: ['name', 'age']
// }
```

### Metadata → JSON Schema Mapping

| Annotation | JSON Schema |
|-----------|-------------|
| `@expect.minLength` on string | `minLength` |
| `@expect.maxLength` on string | `maxLength` |
| `@expect.minLength` on array | `minItems` |
| `@expect.maxLength` on array | `maxItems` |
| `@expect.min` | `minimum` |
| `@expect.max` | `maximum` |
| `@expect.int` | `type: 'integer'` (instead of `'number'`) |
| `@expect.pattern` (single) | `pattern` |
| `@expect.pattern` (multiple) | `allOf: [{ pattern }, ...]` |
| `@meta.required` on string | `minLength: 1` |
| optional property | not in `required` array |
| union | `anyOf` (or `oneOf` + `discriminator` for discriminated unions) |
| intersection | `allOf` |
| tuple | `items` as array |
| phantom | empty object `{}` (excluded) |

### Discriminated Unions

When all union items are objects sharing exactly one property with distinct const/literal values, `buildJsonSchema` auto-detects it and emits `oneOf` with a `discriminator` object (including `propertyName` and `mapping`) instead of `anyOf`. No annotations needed — detection is automatic.

## `fromJsonSchema(schema)` — JSON Schema → Annotated Type

The inverse of `buildJsonSchema`. Creates a fully functional annotated type from a JSON Schema:

```ts
import { fromJsonSchema } from '@atscript/typescript/utils'

const type = fromJsonSchema({
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1 },
    age: { type: 'integer', minimum: 0 },
  },
  required: ['name', 'age']
})

// The resulting type has a working validator
type.validator().validate({ name: 'Alice', age: 30 })  // passes
```

Supports: `type`, `properties`, `required`, `items`, `anyOf`, `oneOf`, `allOf`, `enum`, `const`, `minLength`, `maxLength`, `minimum`, `maximum`, `pattern`, `minItems`, `maxItems`.

Does **not** support `$ref` — dereference schemas first.

## `serializeAnnotatedType(type, options?)` — Serialize to JSON

Converts a runtime annotated type into a plain JSON-safe object for storage or transmission:

```ts
import { serializeAnnotatedType } from '@atscript/typescript/utils'

const json = serializeAnnotatedType(User)
// json is a plain object safe for JSON.stringify()
const str = JSON.stringify(json)
```

### Serialization Options

```ts
serializeAnnotatedType(User, {
  // Strip specific annotation keys
  ignoreAnnotations: ['meta.sensitive', 'mongo.collection'],

  // Advanced per-annotation transform
  processAnnotation(ctx) {
    // ctx.key    — annotation key (e.g. 'meta.label')
    // ctx.value  — annotation value
    // ctx.path   — property path (e.g. ['address', 'city'])
    // ctx.kind   — type kind at this node

    // Return { key, value } to keep (possibly transformed)
    // Return undefined to strip
    if (ctx.key.startsWith('mongo.')) return undefined
    return { key: ctx.key, value: ctx.value }
  },
})
```

## `deserializeAnnotatedType(data)` — Restore from JSON

Restores a fully functional annotated type from its serialized form:

```ts
import { deserializeAnnotatedType } from '@atscript/typescript/utils'

const type = deserializeAnnotatedType(json)

// Fully functional — validator works
type.validator().validate(someData)

// Metadata accessible
type.metadata.get('meta.label')
```

Throws if the serialized version doesn't match `SERIALIZE_VERSION`.

### `SERIALIZE_VERSION`

Current serialization format version (currently `1`). Used for forward compatibility:

```ts
import { SERIALIZE_VERSION } from '@atscript/typescript/utils'
```

## `flattenAnnotatedType(type, options?)` — Flatten to Dot-Path Map

Flattens a nested object type into a `Map<string, TAtscriptAnnotatedType>` keyed by dot-separated paths:

```ts
import { flattenAnnotatedType } from '@atscript/typescript/utils'

const flat = flattenAnnotatedType(User)
// Map {
//   ''              → root object type
//   'name'          → string type (with metadata)
//   'age'           → number type
//   'address'       → nested object type
//   'address.street' → string type
//   'address.city'  → string type
// }

for (const [path, type] of flat) {
  const label = type.metadata.get('meta.label')
  console.log(path || '(root)', label)
}
```

### Flatten Options

```ts
flattenAnnotatedType(User, {
  // Callback for each field (non-root)
  onField(path, type, metadata) {
    console.log(`Field: ${path}`)
  },

  // Tag top-level array fields with a metadata key
  topLevelArrayTag: 'mongo.__topLevelArray',

  // Skip phantom types
  excludePhantomTypes: true,
})
```

### How Flattening Handles Complex Types

- **Objects**: recursed into — each property gets its own path
- **Arrays**: recursed into — element type's properties share the array's path prefix
- **Unions/Intersections/Tuples**: recursed into — if the same path appears in multiple branches, they're merged into a synthetic union
- **Primitives**: added directly at their path

## `createDataFromAnnotatedType(type, options?)` — Create Default Data

Creates a data object matching the type's shape, using structural defaults or annotation values:

```ts
import { createDataFromAnnotatedType } from '@atscript/typescript/utils'

// Empty structural defaults ('', 0, false, [], {})
const empty = createDataFromAnnotatedType(User)
// { name: '', age: 0, active: false, address: { street: '', city: '' } }

// Use @meta.default annotations
const defaults = createDataFromAnnotatedType(User, { mode: 'default' })

// Use @meta.example annotations
const example = createDataFromAnnotatedType(User, { mode: 'example' })

// Custom resolver function
const custom = createDataFromAnnotatedType(User, {
  mode: (prop, path) => {
    if (path === 'name') return 'John Doe'
    if (path === 'age') return 25
    return undefined  // fall through to structural default
  }
})
```

### Modes

| Mode | Behavior |
|------|----------|
| `'empty'` (default) | Structural defaults: `''`, `0`, `false`, `[]`, `{}`. Optional props omitted |
| `'default'` | Uses `@meta.default` annotations. Optional props only included if annotated |
| `'example'` | Uses `@meta.example` annotations. Optional props always included. Arrays get one sample item |
| `function` | Custom resolver per field. Return `undefined` to fall through |

### Behavior Notes

- **Optional properties** are omitted unless the mode provides a value for them (exception: `'example'` mode always includes all optional props)
- **Arrays** in `'example'` mode generate one sample item from the element type instead of an empty array
- **Complex types** (object, array): if a `@meta.default`/`@meta.example` annotation is set and passes validation, the entire subtree is replaced (no recursion into inner props)
- **Annotation values**: strings are used as-is for string types; everything else is parsed via `JSON.parse`
- **Unions/Intersections**: defaults to first item's value
- **Phantom types**: skipped

## `isAnnotatedType(value)` — Type Guard

```ts
import { isAnnotatedType } from '@atscript/typescript/utils'

if (isAnnotatedType(value)) {
  value.metadata  // safe
  value.type      // safe
}
```

## `isAnnotatedTypeOfPrimitive(type)` — Check if Primitive

Returns `true` for final types and for unions/intersections/tuples whose all members are primitives:

```ts
import { isAnnotatedTypeOfPrimitive } from '@atscript/typescript/utils'

isAnnotatedTypeOfPrimitive(stringType)                    // true
isAnnotatedTypeOfPrimitive(objectType)                    // false
isAnnotatedTypeOfPrimitive(unionOfStringAndNumber)        // true
isAnnotatedTypeOfPrimitive(unionOfStringAndObject)        // false
```

## `isPhantomType(def)` — Check if Phantom

```ts
import { isPhantomType } from '@atscript/typescript/utils'

isPhantomType(someProperty)  // true if designType === 'phantom'
```

## `TAtscriptDataType<T>` — Extract DataType from Annotated Type

Utility type that extracts the underlying data shape from a `TAtscriptAnnotatedType`. This is the primary way to obtain a TypeScript data type from an Atscript-generated class, especially useful in generic contexts.

```ts
import type { TAtscriptDataType } from '@atscript/typescript/utils'
import { Product } from './product.as'

type ProductData = TAtscriptDataType<typeof Product>
// ProductData = { name: string; price: number; tags: string[] }
```

### How It Resolves

1. Extracts the phantom `__dataType` from the type definition
2. If `__dataType` is `unknown` (unset), falls back to the constructor's instance type (`T extends new (...) => infer I`)
3. Otherwise returns `unknown`

### Use in Generics

`TAtscriptDataType` is designed for generic code that needs to derive data types from annotated type parameters:

```ts
import type { TAtscriptAnnotatedType, TAtscriptDataType } from '@atscript/typescript/utils'

// Generic repository that infers its entity type
class Repository<T extends TAtscriptAnnotatedType> {
  findOne(id: string): Promise<TAtscriptDataType<T>> { /* ... */ }
  insertOne(data: TAtscriptDataType<T>): Promise<void> { /* ... */ }
}

// Usage — DataType is automatically inferred
const repo = new Repository<typeof Product>()
const product = await repo.findOne('123') // typed as Product

// Generic function
function validate<T extends TAtscriptAnnotatedType>(
  schema: T,
  data: unknown
): data is TAtscriptDataType<T> {
  return schema.validator().validate(data, true)
}
```

### Difference from `InferDataType`

- `TAtscriptDataType<T>` — operates on `TAtscriptAnnotatedType` (the full annotated wrapper). Use this for generated classes and generic code.
- `InferDataType<T>` — operates on raw type definitions (`TAtscriptTypeDef`, `TAtscriptTypeObject`, etc.). Lower-level, extracts `__dataType` from the type def's phantom generic directly.

## Type Exports

Key types you may need to import:

```ts
import type {
  TAtscriptAnnotatedType,         // core annotated type
  TAtscriptAnnotatedTypeConstructor, // annotated type that's also a class
  TAtscriptTypeDef,                // union of all type def shapes
  TAtscriptTypeFinal,             // primitive/literal type def
  TAtscriptTypeObject,            // object type def
  TAtscriptTypeArray,             // array type def
  TAtscriptTypeComplex,           // union/intersection/tuple type def
  TMetadataMap,                   // typed metadata map
  TAnnotatedTypeHandle,           // fluent builder handle
  InferDataType,                  // extract DataType from a type def's phantom generic
  TAtscriptDataType,              // extract DataType from TAtscriptAnnotatedType
  TValidatorOptions,              // validator config
  TValidatorPlugin,               // plugin function type
  TValidatorPluginContext,         // plugin context
  TSerializedAnnotatedType,       // serialized type (top-level)
  TSerializeOptions,              // serialization options
  TFlattenOptions,                // flatten options
  TCreateDataOptions,             // createData options
  TValueResolver,                 // custom resolver for createData
  TJsonSchema,                    // JSON Schema object
} from '@atscript/typescript/utils'
```

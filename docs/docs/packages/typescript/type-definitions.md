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

`forAnnotatedType()` provides type-safe dispatch over annotated types by their `kind`. Instead of writing `switch (def.type.kind)` manually, supply a handler for each kind:

```typescript
import { forAnnotatedType } from '@atscript/typescript/utils'

const description = forAnnotatedType(someType, {
  final:        (d) => `primitive: ${d.type.designType}`,
  object:       (d) => `object with ${d.type.props.size} props`,
  array:        (d) => `array`,
  union:        (d) => `union of ${d.type.items.length}`,
  intersection: (d) => `intersection of ${d.type.items.length}`,
  tuple:        (d) => `tuple of ${d.type.items.length}`,
})
```

Each handler receives the correctly narrowed type — `final` gets `TAtscriptAnnotatedType<TAtscriptTypeFinal>`, `object` gets `TAtscriptAnnotatedType<TAtscriptTypeObject>`, etc.

This is used internally by the [Validator](/packages/typescript/validation), [JSON Schema builder](/packages/typescript/json-schema), and [serializer](/packages/typescript/serialization).

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

## Next Steps

- [Validation](/packages/typescript/validation) — validate data against annotated types
- [JSON Schema](/packages/typescript/json-schema) — generate JSON Schema from types
- [Serialization](/packages/typescript/serialization) — serialize types for transport

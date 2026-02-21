# Runtime Type System — @atscript/typescript

> Understanding `TAtscriptAnnotatedType`, reading/writing metadata, walking type definitions, and type structure.

## `TAtscriptAnnotatedType`

Every generated interface/type is a `TAtscriptAnnotatedType` — the core runtime representation:

```ts
interface TAtscriptAnnotatedType<T extends TAtscriptTypeDef = TAtscriptTypeDef> {
  __is_atscript_annotated_type: true    // brand for type checking
  type: T                                // the type definition (shape)
  metadata: TMetadataMap<AtscriptMetadata>  // annotation metadata
  optional?: boolean                     // whether this type is optional
  validator(opts?): Validator            // create a validator instance
}
```

### Checking if Something is an Annotated Type

```ts
import { isAnnotatedType } from '@atscript/typescript/utils'

if (isAnnotatedType(value)) {
  // value is TAtscriptAnnotatedType
  value.metadata.get('meta.label')
}
```

## Type Definitions (`type.kind`)

The `type` field describes the shape. There are 5 kinds:

### Final (Primitive) — `kind: ''`

```ts
interface TAtscriptTypeFinal {
  kind: ''
  designType: 'string' | 'number' | 'boolean' | 'undefined' | 'null' | 'any' | 'never' | 'phantom'
  value?: string | number | boolean   // for literal types
  tags: Set<AtscriptPrimitiveTags>
}
```

### Object — `kind: 'object'`

```ts
interface TAtscriptTypeObject<K extends string = string> {
  kind: 'object'
  props: Map<K, TAtscriptAnnotatedType>                    // named properties
  propsPatterns: Array<{ pattern: RegExp; def: TAtscriptAnnotatedType }>  // pattern properties
  tags: Set<AtscriptPrimitiveTags>
}
```

### Array — `kind: 'array'`

```ts
interface TAtscriptTypeArray {
  kind: 'array'
  of: TAtscriptAnnotatedType        // element type
  tags: Set<AtscriptPrimitiveTags>
}
```

### Complex (Union/Intersection/Tuple) — `kind: 'union' | 'intersection' | 'tuple'`

```ts
interface TAtscriptTypeComplex {
  kind: 'union' | 'intersection' | 'tuple'
  items: TAtscriptAnnotatedType[]
  tags: Set<AtscriptPrimitiveTags>
}
```

## Reading Metadata

The `metadata` field is a typed `Map<keyof AtscriptMetadata, value>`:

```ts
import { User } from './models/user.as'

// Read annotations
const label = User.metadata.get('meta.label')         // string | undefined
const required = User.metadata.get('meta.required')    // { message?: string } | true | undefined
const minLen = User.metadata.get('expect.minLength')   // { length: number; message?: string } | undefined

// Check if annotation exists
User.metadata.has('meta.sensitive')  // boolean

// Iterate all annotations
for (const [key, value] of User.metadata.entries()) {
  console.log(key, value)
}
```

### Reading Property Metadata

Navigate into object properties via `type.props`:

```ts
// Get a property's annotated type
const nameProp = User.type.props.get('name')!

// Read that property's metadata
nameProp.metadata.get('meta.label')        // "Full Name"
nameProp.metadata.get('meta.required')     // true or { message: "..." }

// Check if optional
nameProp.optional  // boolean | undefined
```

### Nested Properties

```ts
const addressProp = User.type.props.get('address')!
if (addressProp.type.kind === 'object') {
  const cityProp = addressProp.type.props.get('city')!
  cityProp.metadata.get('meta.label')
}
```

## Writing Metadata at Runtime

Use the `annotate()` function for safe metadata mutation:

```ts
import { annotate } from '@atscript/typescript/utils'

// Set a single annotation value
annotate(User.metadata, 'meta.label', 'Updated Label')

// Append to an array annotation (asArray = true)
annotate(User.metadata, 'expect.pattern', { pattern: '^[A-Z]' }, true)

// Direct Map operations also work
User.metadata.set('meta.label', 'Direct Set')
User.metadata.delete('meta.sensitive')
```

The `annotate()` function handles array annotations correctly — if `asArray` is `true`, it appends to existing arrays or creates a new array.

## Walking Type Definitions

### Manual `switch` on `type.kind`

```ts
function inspect(def: TAtscriptAnnotatedType) {
  switch (def.type.kind) {
    case '':        // final/primitive
      console.log('Primitive:', def.type.designType)
      break
    case 'object':  // object with props
      for (const [name, prop] of def.type.props) {
        console.log(`  ${name}:`, prop.type.kind || prop.type.designType)
      }
      break
    case 'array':   // array
      console.log('Array of:', def.type.of.type.kind)
      break
    case 'union':
    case 'intersection':
    case 'tuple':
      console.log(`${def.type.kind} with ${def.type.items.length} items`)
      break
  }
}
```

### Using `forAnnotatedType()` Helper

A type-safe dispatch helper that covers all `kind` values:

```ts
import { forAnnotatedType } from '@atscript/typescript/utils'

const result = forAnnotatedType(someType, {
  final(d)        { return `primitive: ${d.type.designType}` },
  object(d)       { return `object with ${d.type.props.size} props` },
  array(d)        { return `array` },
  union(d)        { return `union of ${d.type.items.length}` },
  intersection(d) { return `intersection of ${d.type.items.length}` },
  tuple(d)        { return `tuple of ${d.type.items.length}` },
  // Optional: handle phantom types separately from final
  phantom(d)      { return `phantom` },
})
```

If `phantom` handler is provided, phantom types (`designType === 'phantom'`) are dispatched there instead of `final`. This allows consumers to skip phantom props cleanly.

## Tags

Each type definition has a `tags` Set containing primitive tags (e.g. `"string"`, `"number"`):

```ts
const nameProp = User.type.props.get('name')!
nameProp.type.tags.has('string')  // true
```

Tags come from primitive definitions and their extensions. They're useful for categorizing types at runtime.

## Phantom Types

Phantom types carry metadata but don't affect validation or data shape:

```ts
import { isPhantomType } from '@atscript/typescript/utils'

for (const [name, prop] of User.type.props) {
  if (isPhantomType(prop)) {
    // Skip phantom props in data processing
    continue
  }
}
```

## Checking Primitive Types

```ts
import { isAnnotatedTypeOfPrimitive } from '@atscript/typescript/utils'

// Returns true for final types and unions/intersections/tuples of all primitives
isAnnotatedTypeOfPrimitive(someType)  // true if no objects or arrays
```

## Building Types at Runtime

Use `defineAnnotatedType()` to construct types programmatically:

```ts
import { defineAnnotatedType } from '@atscript/typescript/utils'

// Primitive
const strType = defineAnnotatedType().designType('string').tags('string').$type

// Object
const userType = defineAnnotatedType('object')
  .prop('name', defineAnnotatedType().designType('string').$type)
  .prop('age', defineAnnotatedType().designType('number').$type)
  .prop('email', defineAnnotatedType().optional().designType('string').$type)
  .$type

// Array
const listType = defineAnnotatedType('array')
  .of(defineAnnotatedType().designType('string').$type)
  .$type

// Union
const statusType = defineAnnotatedType('union')
  .item(defineAnnotatedType().designType('string').value('active').$type)
  .item(defineAnnotatedType().designType('string').value('inactive').$type)
  .$type

// With metadata
const labeledType = defineAnnotatedType().designType('string')
  .annotate('meta.label', 'My Label')
  .annotate('expect.minLength', { length: 3 })
  .$type
```

### `TAnnotatedTypeHandle` Fluent API

| Method | Description |
|--------|-------------|
| `.designType(dt)` | Set primitive design type |
| `.value(v)` | Set literal value |
| `.tags(...tags)` | Add primitive tags |
| `.prop(name, type)` | Add named property (object kind) |
| `.propPattern(regex, type)` | Add pattern property (object kind) |
| `.of(type)` | Set element type (array kind) |
| `.item(type)` | Add item (union/intersection/tuple kind) |
| `.optional(flag?)` | Mark as optional |
| `.annotate(key, value, asArray?)` | Set metadata annotation |
| `.copyMetadata(from, ignore?)` | Copy metadata from another type |
| `.refTo(type, chain?)` | Reference another annotated type's definition |
| `.$type` | Get the final `TAtscriptAnnotatedType` |

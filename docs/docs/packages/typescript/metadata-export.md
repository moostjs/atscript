# Metadata

All annotations from `.as` files are preserved as runtime metadata on generated types. This is what makes Atscript more than just a type system — annotations like labels, descriptions, and validation rules are accessible in your TypeScript code.

## Accessing Metadata

Every generated type has a `metadata` field — a typed `Map` keyed by annotation names:

```typescript
import { Product } from './product.as'

// Top-level annotations (on the interface itself)
Product.metadata.get('meta.description') // 'A product in the catalog'

// Property-level annotations
const nameProp = Product.type.props.get('name')
nameProp?.metadata.get('meta.label') // 'Product Name'
nameProp?.metadata.get('expect.minLength') // { length: 3, message?: string }
```

The metadata map is typed via the global `AtscriptMetadata` interface, so you get IntelliSense for annotation keys and their value types.

## Iterating Properties

Walk all properties and their metadata using the `props` map:

```typescript
import { Product } from './product.as'

for (const [key, prop] of Product.type.props.entries()) {
  const label = prop.metadata.get('meta.label') || key
  const required = !prop.optional
  console.log(`${label} (${key}): ${required ? 'required' : 'optional'}`)
}
```

## Tags

Semantic types like `string.email` or `number.positive` produce tags that are available at runtime:

```typescript
import { User } from './user.as'

const emailProp = User.type.props.get('email')
emailProp?.type.tags // Set { 'email', 'string' }
```

Tags let you make runtime decisions based on semantic types — for example, rendering an email input vs a plain text input.

## Nested Types

Every nested node — array element, union member, nested-object property — is itself a `TAtscriptAnnotatedType` with its own `.metadata.get(...)`. Reach into the right field on the parent (`type.of` for arrays, `type.items` for unions/intersections/tuples, `type.props.get(...)` for objects) and call `metadata.get` on what you find:

```typescript
import { User } from './models.as'

const addressProp = User.type.props.get('address')
if (addressProp?.type.kind === 'object') {
  const cityProp = addressProp.type.props.get('city')
  cityProp?.metadata.get('meta.label')
}
```

Use [`forAnnotatedType()`](/packages/typescript/type-definitions#forAnnotatedType) to traverse nested types generically — see [Type Traversal](/packages/typescript/type-definitions#type-traversal) for recursive walking patterns and practical examples.

## Practical Example: Build A Field List

```typescript
import { Product } from './product.as'

function buildFieldList() {
  if (Product.type.kind !== 'object') return []

  return Array.from(Product.type.props.entries()).map(([key, prop]) => ({
    name: key,
    label: prop.metadata.get('meta.label') || key,
    required: !prop.optional,
    placeholder: prop.metadata.get('ui.placeholder'),
    sensitive: prop.metadata.get('meta.sensitive') || false,
    readonly: prop.metadata.get('meta.readonly') || false,
  }))
}

const fields = buildFieldList()
// [{ name: 'name', label: 'Product Name', required: true, ... }, ...]
```

For more advanced traversal patterns — recursive walking, flattening nested types, collecting metadata across the type tree — see [Type Traversal](/packages/typescript/type-definitions#type-traversal).

## Next Steps

- [Validation](/packages/typescript/validation) — annotations drive validation rules automatically
- [Type Definitions](/packages/typescript/type-definitions) — the annotated type system in depth
- [Serialization](/packages/typescript/serialization) — serialize types with metadata for transport

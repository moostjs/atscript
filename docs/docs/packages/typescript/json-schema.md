# JSON Schema

Atscript types can be converted to [JSON Schema](https://json-schema.org/) for use with API documentation tools, form generators, or any system that consumes JSON Schema.

## Usage

Two ways to get a JSON Schema from an Atscript type:

```typescript
import { Product } from './product.as'
import { buildJsonSchema } from '@atscript/typescript/utils'

// Option 1: from the generated type directly
const schema = Product.toJsonSchema()

// Option 2: using the standalone function
const schema = buildJsonSchema(Product)
```

The `.toJsonSchema()` method on generated types is lazy-computed and cached on first call.

## Annotation Constraints

Annotations from `.as` files are translated into JSON Schema constraints:

| Annotation | JSON Schema | Notes |
|------------|------------|-------|
| `@expect.minLength` | `minLength` / `minItems` | `minLength` for strings, `minItems` for arrays |
| `@expect.maxLength` | `maxLength` / `maxItems` | `maxLength` for strings, `maxItems` for arrays |
| `@expect.min` | `minimum` | |
| `@expect.max` | `maximum` | |
| `@expect.int` | `type: 'integer'` | Changes `number` to `integer` |
| `@expect.pattern` | `pattern` / `allOf` | Single pattern uses `pattern`, multiple become `allOf` entries |

## Example

Given this `.as` file:

```atscript
export interface Product {
    @expect.minLength 3
    @expect.maxLength 100
    name: string

    @expect.min 0
    price: number

    tags: string[]
}
```

`buildJsonSchema(Product)` produces:

```json
{
  "type": "object",
  "properties": {
    "name": { "type": "string", "minLength": 3, "maxLength": 100 },
    "price": { "type": "number", "minimum": 0 },
    "tags": { "type": "array", "items": { "type": "string" } }
  },
  "required": ["name", "price", "tags"]
}
```

## Next Steps

- [Validation](/packages/typescript/validation) — runtime validation with type guards
- [Serialization](/packages/typescript/serialization) — serialize types for transport

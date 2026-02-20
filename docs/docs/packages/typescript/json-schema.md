# JSON Schema

Atscript types can be converted to [JSON Schema](https://json-schema.org/) for use with API documentation tools, form generators, or any system that consumes JSON Schema.

## Enabling JSON Schema

By default, JSON Schema support is disabled (`jsonSchema: false`) to keep generated output lightweight. To enable it, set the `jsonSchema` plugin option — see [Configuration — `jsonSchema`](/packages/typescript/configuration#jsonschema) for the available modes and examples.

## Usage

Two ways to get a JSON Schema from an Atscript type:

```typescript
import { Product } from './product.as'
import { buildJsonSchema } from '@atscript/typescript/utils'

// Option 1: from the generated type directly (requires jsonSchema: 'lazy' or 'bundle')
const schema = Product.toJsonSchema()

// Option 2: using the standalone function (always available)
const schema = buildJsonSchema(Product)
```

The `.toJsonSchema()` method on generated types requires the `jsonSchema` plugin option to be set to `'lazy'` or `'bundle'` — otherwise it throws a runtime error. Alternatively, add the [`@emit.jsonSchema`](#per-interface-override-emit-jsonschema) annotation to individual interfaces.

::: tip Manual use is always available
Even with `jsonSchema: false`, you can import `buildJsonSchema` from `@atscript/typescript/utils` and call it directly. The config option only affects the _generated_ `.toJsonSchema()` method — the standalone function always works.

```typescript
import { buildJsonSchema } from '@atscript/typescript/utils'
import { Product } from './product.as'

const schema = buildJsonSchema(Product) // works regardless of config
```

:::

## Per-Interface Override: `@emit.jsonSchema`

The `@emit.jsonSchema` annotation forces build-time JSON Schema embedding for a specific interface, regardless of the global `jsonSchema` setting. This is useful when you've disabled JSON Schema globally but need it for select types:

```atscript
@emit.jsonSchema
export interface ApiResponse {
    status: string
    @expect.minLength 1
    message: string
}
```

`ApiResponse.toJsonSchema()` will return the pre-computed schema even if `jsonSchema: false` is set in the plugin config. The annotation can only be applied to interfaces (top-level).

## Annotation Constraints

Annotations from `.as` files are translated into JSON Schema constraints:

| Annotation          | JSON Schema              | Notes                                                          |
| ------------------- | ------------------------ | -------------------------------------------------------------- |
| `@expect.minLength` | `minLength` / `minItems` | `minLength` for strings, `minItems` for arrays                 |
| `@expect.maxLength` | `maxLength` / `maxItems` | `maxLength` for strings, `maxItems` for arrays                 |
| `@expect.min`       | `minimum`                |                                                                |
| `@expect.max`       | `maximum`                |                                                                |
| `@expect.int`       | `type: 'integer'`        | Changes `number` to `integer`                                  |
| `@expect.pattern`   | `pattern` / `allOf`      | Single pattern uses `pattern`, multiple become `allOf` entries |

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

## Converting from JSON Schema

You can also convert a JSON Schema object back into an Atscript annotated type using `fromJsonSchema`:

```typescript
import { fromJsonSchema, buildJsonSchema } from '@atscript/typescript/utils'

const schema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 3 },
    age: { type: 'number', minimum: 0 },
  },
  required: ['name', 'age'],
}

const type = fromJsonSchema(schema)

// The result is a fully functional annotated type
type.validator().validate({ name: 'Alice', age: 30 }) // passes

// Round-trip: buildJsonSchema(fromJsonSchema(schema)) preserves the schema
const roundTripped = buildJsonSchema(type)
```

`fromJsonSchema` supports the full subset of JSON Schema produced by `buildJsonSchema`, including:

- Object types with `properties` and `required`
- Arrays with `items`, `minItems`, `maxItems`
- Tuples (array with `items` as an array and `additionalItems: false`)
- Unions (`anyOf`, `oneOf`)
- Intersections (`allOf`)
- Primitives (`string`, `number`, `integer`, `boolean`, `null`)
- Literals (`const`)
- Enums (`enum` — converted to union of literals)
- Constraints: `minLength`, `maxLength`, `minimum`, `maximum`, `pattern`

::: tip Use case: external schemas
`fromJsonSchema` is useful for importing type definitions from external JSON Schema sources (OpenAPI specs, form generators, etc.) and using them with Atscript's validator at runtime.
:::

::: warning Unsupported features
`$ref` is not supported — dereference your schema before passing it to `fromJsonSchema`. Features like `not`, `if/then/else`, `patternProperties`, and `additionalProperties` have no Atscript equivalent and are silently ignored.
:::

## Next Steps

- [Validation](/packages/typescript/validation) — runtime validation with type guards
- [Serialization](/packages/typescript/serialization) — serialize types for transport

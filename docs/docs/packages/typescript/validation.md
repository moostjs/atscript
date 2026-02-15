# Validation

Every generated Atscript type has a `.validator()` method that creates a `Validator` instance for runtime data validation. The validator enforces type structure and annotation-driven constraints (`@expect.*`), and acts as a TypeScript type guard.

```typescript
import { Product } from './product.as'

const validator = Product.validator()
```

## Basic Usage

**Throwing mode** — throws `ValidatorError` on failure:

```typescript
try {
  validator.validate(data)
  // data passed validation
} catch (error) {
  console.error(error.message) // first error message
  console.error(error.errors)  // all errors: { path, message }[]
}
```

**Safe mode** — returns `false` on failure and acts as a type guard:

```typescript
if (validator.validate(data, true)) {
  // TypeScript narrows data to Product
  console.log(data.name, data.price)
} else {
  console.log(validator.errors)
}
```

## Type Guard

The `validate()` method signature is:

```typescript
validate<TT = DataType>(value: any, safe?: boolean): value is TT
```

`DataType` is automatically inferred from the type definition's phantom generic — no manual type parameters needed. This works for generated interfaces, types, and even [deserialized](/packages/typescript/serialization) types:

```typescript
import { Product } from './product.as'

function handleRequest(body: unknown) {
  if (Product.validator().validate(body, true)) {
    // body is Product — fully typed
    saveProduct(body)
  }
}
```

## Options

Pass options to `.validator()` or `new Validator(type, opts)`:

```typescript
const validator = Product.validator({
  partial: true,
  unknwonProps: 'strip',
  errorLimit: 5,
})
```

### `partial`

Controls whether missing required properties are errors:

- `false` (default) — all required properties must be present
- `true` — missing properties are allowed at the top level only
- `'deep'` — missing properties allowed at all levels (useful for patch operations)
- `(type, path) => boolean` — custom function for fine-grained control

### `unknwonProps`

How to handle properties not defined in the type:

- `'error'` (default) — report as validation error
- `'ignore'` — silently skip
- `'strip'` — delete the property from the value

### `errorLimit`

Maximum number of errors to collect before stopping (default: `10`).

### `skipList`

A `Set<string>` of property paths to skip during validation:

```typescript
Product.validator({ skipList: new Set(['internalId', 'audit.createdBy']) })
```

### `replace`

A function to replace type definitions during validation. Useful for dynamic type overrides:

```typescript
Product.validator({
  replace: (type, path) => path === 'status' ? customStatusType : type
})
```

## Annotation-Driven Rules

Annotations from `.as` files are enforced automatically during validation. See the [Annotations guide](/guide/annotations) for the full list.

| Annotation | Applies to | Validates |
|------------|-----------|-----------|
| `@expect.minLength` | string, array | Minimum length |
| `@expect.maxLength` | string, array | Maximum length |
| `@expect.min` | number | Minimum value |
| `@expect.max` | number | Maximum value |
| `@expect.int` | number | Must be integer |
| `@expect.pattern` | string | Regex match (multiple patterns supported) |

Semantic types like `string.email` and `number.positive` automatically add validation rules through their annotation definitions.

## Error Handling

`ValidatorError` extends `Error` and includes structured details:

```typescript
import { ValidatorError } from '@atscript/typescript/utils'

try {
  validator.validate(data)
} catch (e) {
  if (e instanceof ValidatorError) {
    for (const err of e.errors) {
      console.log(err.path)     // e.g. "address.city"
      console.log(err.message)  // e.g. "Expected string, got number"
      console.log(err.details)  // nested errors for unions
    }
  }
}
```

After safe validation, errors are available on the validator instance:

```typescript
if (!validator.validate(data, true)) {
  validator.errors // same { path, message, details? }[] structure
}
```

## Plugins

Plugins intercept validation to add custom logic. A plugin is a function that returns `true` (accept), `false` (reject), or `undefined` (fall through to default validation):

```typescript
import type { TValidatorPlugin } from '@atscript/typescript/utils'

const requireNonEmpty: TValidatorPlugin = (ctx, def, value) => {
  if (def.type.kind === '' && def.type.designType === 'string') {
    if (typeof value === 'string' && value.trim() === '') {
      ctx.error('String must not be empty')
      return false
    }
  }
  // fall through to default validation
  return undefined
}

const validator = Product.validator({ plugins: [requireNonEmpty] })
```

The plugin context (`TValidatorPluginContext`) exposes `opts`, `validateAnnotatedType`, `error`, and `path`.

## Creating Validators Manually

When working with types that aren't generated (e.g., deserialized or programmatically built), create a `Validator` directly:

```typescript
import { Validator, deserializeAnnotatedType } from '@atscript/typescript/utils'

const type = deserializeAnnotatedType(jsonData)
const validator = new Validator(type)
validator.validate(someValue)
```

## Next Steps

- [Type Definitions](/packages/typescript/type-definitions) — understand the annotated type system
- [JSON Schema](/packages/typescript/json-schema) — generate JSON Schema from types
- [Serialization](/packages/typescript/serialization) — serialize types for transport

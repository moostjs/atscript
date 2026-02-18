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
validate<TT = DataType>(value: any, safe?: boolean, context?: unknown): value is TT
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

Annotations from `.as` files are enforced automatically during validation. See the [Annotations](/packages/typescript/annotations) page for the full list.

| Annotation | Applies to | Validates |
|------------|-----------|-----------|
| `@meta.required` | string, boolean | String: at least one non-whitespace character. Boolean: must be `true` |
| `@expect.minLength` | string, array | Minimum length |
| `@expect.maxLength` | string, array | Maximum length |
| `@expect.min` | number | Minimum value |
| `@expect.max` | number | Maximum value |
| `@expect.int` | number | Must be integer |
| `@expect.pattern` | string | Regex match (multiple patterns supported) |

All validation annotations (except `@expect.int`) support an optional custom error message as the last argument:

```atscript
interface User {
  @meta.required "Name is required"
  @expect.minLength 3, "Username must be at least 3 characters"
  @expect.maxLength 20, "Username cannot exceed 20 characters"
  username: string

  @expect.min 18, "You must be at least 18 years old"
  @expect.max 120, "Age cannot exceed 120"
  age: number

  @expect.pattern "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$", "u", "Invalid email format"
  email: string
}
```

When validation fails, the custom message (if provided) is used instead of the default error message.

Semantic types like `string.email`, `string.required`, and `number.positive` automatically add validation rules through their annotation definitions. The `string.required` primitive implicitly adds `@meta.required`.

[Phantom](/packages/typescript/primitives#phantom-type) props are automatically skipped during validation — they are non-data elements and any data with a phantom-named key is treated as an unexpected property.

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

const coerceNumbers: TValidatorPlugin = (ctx, def, value) => {
  if (def.type.kind === '' && def.type.designType === 'number') {
    if (typeof value === 'string' && !isNaN(Number(value))) {
      return undefined // allow default validation to handle coerced value
    }
  }
  return undefined // fall through to default validation
}

const validator = Product.validator({ plugins: [coerceNumbers] })
```

### External Context

Plugins can receive external context passed as the third argument to `validate()`. This is useful when validation rules depend on runtime state (e.g., user roles, request metadata, feature flags):

```typescript
const roleAware: TValidatorPlugin = (ctx, def, value) => {
  const { context } = ctx
  if (context && (context as { role: string }).role === 'admin') {
    return true // admins bypass validation
  }
  return undefined // fall through to default
}

const validator = Product.validator({ plugins: [roleAware] })
validator.validate(data, true, { role: 'admin' })
```

The context type is `unknown` — plugin developers are responsible for validating and casting it internally, since multiple plugins may expect different context formats.

The plugin context (`TValidatorPluginContext`) exposes `opts`, `validateAnnotatedType`, `error`, `path`, and `context`.

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

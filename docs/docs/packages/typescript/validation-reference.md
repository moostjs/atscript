# Validation Reference

Use this page when you need the full validator API, lower-level options, or plugin hooks.

## `validate()` Signature

```typescript
validate<TT = DataType>(value: any, safe?: boolean, context?: unknown): value is TT
```

`DataType` is inferred from the Atscript model, so the validator narrows data automatically.

## Validator Options

Pass options to `.validator()` or `new Validator(type, opts)`:

```typescript
const validator = Product.validator({
  partial: true,
  unknownProps: 'strip',
  errorLimit: 5,
})
```

### `partial`

Controls whether missing required properties are errors:

- `false` (default) — all required properties must be present
- `true` — missing properties are allowed at the top level only
- `'deep'` — missing properties are allowed at all levels
- `(type, path) => boolean` — custom logic per node

### `unknownProps`

How to handle properties not defined in the type:

- `'error'` (default)
- `'ignore'`
- `'strip'`

### `errorLimit`

Maximum number of errors to collect before stopping. Default: `10`.

### `skipList`

- **Type:** `Set<string>`

Skip specific property paths. The set matches dot-separated paths (relative to each object) — entries like `'internalId'` skip a top-level prop, `'audit.createdBy'` skips a nested prop:

```typescript
Product.validator({
  skipList: new Set(['internalId', 'audit.createdBy']),
})
```

### `replace`

- **Type:** `(type: TAtscriptAnnotatedType, path: string) => TAtscriptAnnotatedType`

Replace a type definition dynamically during validation. Useful when one field should validate against a different type per request — for example, swapping a generic `unknown`-shaped payload for a concrete schema chosen at runtime. The function is called once per encountered type (results are cached), receives the original `TAtscriptAnnotatedType` and the dot-separated path, and must return either the original type or a replacement annotated type:

```typescript
Product.validator({
  replace: (type, path) => (path === 'status' ? customStatusType : type),
})
```

## Built-In Validation Rules

Annotations from `.as` files are enforced automatically:

| Annotation                  | Applies to               | Validates                                                              |
| --------------------------- | ------------------------ | ---------------------------------------------------------------------- |
| `@meta.required`            | string, boolean          | String: at least one non-whitespace character. Boolean: must be `true` |
| `@expect.minLength`         | string, array            | Minimum length                                                         |
| `@expect.maxLength`         | string, array            | Maximum length                                                         |
| `@expect.min`               | number                   | Minimum value                                                          |
| `@expect.max`               | number                   | Maximum value                                                          |
| `@expect.int`               | number                   | Must be integer                                                        |
| `@expect.pattern`           | string                   | Regex match                                                            |
| `@expect.array.uniqueItems` | array                    | No duplicate items                                                     |
| `@expect.array.key`         | array element properties | Marks identity fields for uniqueness and patch operations              |

Semantic types like `string.email`, `string.required`, and `number.positive` add validation behavior through their built-in annotation definitions.

::: tip Decimal format
Values typed as `decimal` are stored as strings to preserve precision. The validator enforces the regex `/^[+-]?\d+(\.\d+)?$/` — anything else (NaN, scientific notation, leading/trailing whitespace) is rejected with `Invalid decimal format`.
:::

## Array Uniqueness

`@expect.array.uniqueItems` and `@expect.array.key` work together:

```atscript
interface Order {
    @expect.array.uniqueItems "Duplicate line items"
    items: OrderItem[]
}

interface OrderItem {
    @expect.array.key
    productId: number

    quantity: number
}
```

- `@expect.array.key` identifies the fields that make an item unique
- `@expect.array.uniqueItems` enforces uniqueness during validation
- multiple key fields form a composite key

For primitive arrays like `string[]`, uniqueness falls back to deep equality.

## Error Handling

`ValidatorError` extends `Error` and includes structured details:

```typescript
import { ValidatorError } from '@atscript/typescript/utils'

try {
  validator.validate(data)
} catch (e) {
  if (e instanceof ValidatorError) {
    for (const err of e.errors) {
      console.log(err.path)
      console.log(err.message)
      console.log(err.details)
    }
  }
}
```

After safe validation, errors are available on `validator.errors`.

## Plugins

Plugins can intercept validation and either accept, reject, or fall through:

```typescript
import type { TValidatorPlugin } from '@atscript/typescript/utils'

const skipSensitive: TValidatorPlugin = (ctx, def) => {
  if (def.metadata.get('meta.sensitive')) {
    return true
  }
  return undefined
}

const validator = Product.validator({ plugins: [skipSensitive] })
```

### External Context

Plugins can receive context through the third argument to `validate()`:

```typescript
const roleAware: TValidatorPlugin = ctx => {
  const { context } = ctx
  if (context && (context as { role: string }).role === 'admin') {
    return true
  }
  return undefined
}

Product.validator({ plugins: [roleAware] }).validate(data, true, { role: 'admin' })
```

The plugin context exposes `opts`, `validateAnnotatedType`, `error`, `path`, and `context`.

### Reporting Custom Errors from a Plugin

Plugins may push their own structured errors into the active validator via `ctx.error(message, path?, details?)`:

| Argument  | Type      | Notes                                                                                  |
| --------- | --------- | -------------------------------------------------------------------------------------- |
| `message` | `string`  | Required. Becomes the `message` of a `TError` entry.                                   |
| `path`    | `string?` | Optional. Defaults to the current dot-separated path being validated.                  |
| `details` | `TError[]?` | Optional. Nested error breakdown — useful when an alternative-tested branch fails. |

```typescript
const requirePositiveAmount: TValidatorPlugin = (ctx, def, value) => {
  if (def.metadata.get('meta.label') === 'Amount' && typeof value === 'number' && value <= 0) {
    ctx.error('Amount must be positive', ctx.path, [
      { path: ctx.path, message: `Got ${value}` },
    ])
    return false
  }
  return undefined
}
```

## Manual Validator Construction

For deserialized or programmatically built types:

```typescript
import { Validator, deserializeAnnotatedType } from '@atscript/typescript/utils'

const type = deserializeAnnotatedType(jsonData)
const validator = new Validator(type)

validator.validate(someValue)
```

## Input Coercion: `coerceForType()`

```typescript
import { coerceForType } from '@atscript/typescript/utils'

coerceForType(def: TAtscriptAnnotatedType, value: unknown): unknown
```

Converts string-transport input (route params, query strings) toward the scalar shapes an annotated type expects, so a numeric `.as` alias can accept `"42"` from a URL. Pure and non-throwing — when a value can't be coerced it is returned untouched for the validator to report:

```typescript
import { coerceForType } from '@atscript/typescript/utils'
import { KafkaOffset } from './types.as' // @expect.int @expect.min 0 → number

coerceForType(KafkaOffset, '42') // → 42
coerceForType(KafkaOffset, 'abc') // → 'abc' (validate afterwards for the proper error)
```

Coercion rules:

- **number** — trimmed, non-empty strings parsed with `Number()`; only finite results accepted
- **boolean** — `"true"`/`"1"` → `true`, `"false"`/`"0"` → `false`
- **unions** — branches tried in declared order, first successful parse wins; literal branches must match the literal exactly
- **objects** — recurses into props when the input is a plain object (returns a new object, never mutates the input)
- **arrays / tuples** — items coerced individually
- **string / decimal** — string input is never changed

Coercion converts representation only — constraint checks (`@expect.int`, `@expect.min`, patterns) remain the validator's job, so the intended flow is always `coerceForType` → `validate`. In Moost apps, prefer the ready-made [Coercion Pipe](/packages/moost-validator/coercion-pipe) over calling this directly.

## Next Steps

- [Validation Guide](/packages/typescript/validation) — the practical application flow
- [Type Definitions](/packages/typescript/type-definitions) — the runtime type system behind validation
- [Serialization](/packages/typescript/serialization) — validate deserialized types

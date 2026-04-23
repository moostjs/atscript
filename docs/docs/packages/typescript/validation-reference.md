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

Skip specific property paths:

```typescript
Product.validator({
  skipList: new Set(['internalId', 'audit.createdBy']),
})
```

### `replace`

Replace a type definition dynamically during validation:

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

## Manual Validator Construction

For deserialized or programmatically built types:

```typescript
import { Validator, deserializeAnnotatedType } from '@atscript/typescript/utils'

const type = deserializeAnnotatedType(jsonData)
const validator = new Validator(type)

validator.validate(someValue)
```

## Next Steps

- [Validation Guide](/packages/typescript/validation) — the practical application flow
- [Type Definitions](/packages/typescript/type-definitions) — the runtime type system behind validation
- [Serialization](/packages/typescript/serialization) — validate deserialized types

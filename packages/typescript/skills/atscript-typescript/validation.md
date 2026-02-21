# Validation — @atscript/typescript

> Runtime data validation, type guards, error handling, and custom validator plugins.

## Basic Usage

Every generated `.as` interface/type has a `.validator()` factory:

```ts
import { User } from './models/user.as'

// Create a validator
const validator = User.validator()

// Validate — throws ValidatorError on failure
validator.validate(data)

// Safe mode — returns boolean, no throw
if (validator.validate(data, true)) {
  // data is narrowed to User (type guard)
  data.name  // TypeScript knows this exists
}
```

## The `Validator` Class

```ts
import { Validator } from '@atscript/typescript/utils'

// Create from any annotated type
const validator = new Validator(someAnnotatedType, {
  // Options (all optional):
  partial: false,           // allow missing required props
  unknownProps: 'error',    // 'error' | 'strip' | 'ignore'
  errorLimit: 10,           // max errors before stopping
  plugins: [],              // custom validator plugins
  skipList: new Set(),      // property paths to skip
})
```

### `validate(value, safe?, context?)`

```ts
// Throwing mode (default) — throws ValidatorError on failure
validator.validate(data)

// Safe mode — returns false instead of throwing
const isValid = validator.validate(data, true)

// With external context — passed to plugins
validator.validate(data, true, { userId: '123' })
```

The `validate` method is a **TypeScript type guard** — when it returns `true`, the value is narrowed to the interface's data type.

## Validator Options

### `partial` — Allow Missing Properties

```ts
// Top-level properties only
User.validator({ partial: true }).validate(data, true)

// All levels (deep partial)
User.validator({ partial: 'deep' }).validate(data, true)

// Custom function — decide per object type
User.validator({
  partial: (objectType, path) => {
    return path === '' // only root object is partial
  }
}).validate(data, true)
```

### `unknownProps` — Handle Extra Properties

```ts
// Error on unknown properties (default)
User.validator({ unknownProps: 'error' }).validate(data, true)

// Silently remove unknown properties from the value
User.validator({ unknownProps: 'strip' }).validate(data, true)

// Ignore unknown properties
User.validator({ unknownProps: 'ignore' }).validate(data, true)
```

**Note**: `'strip'` mutates the input object — it deletes unknown keys.

### `skipList` — Skip Specific Paths

```ts
User.validator({
  skipList: new Set(['password', 'address.zip'])
}).validate(data, true)
```

### `replace` — Substitute Type at Runtime

```ts
User.validator({
  replace: (type, path) => {
    if (path === 'status') return customStatusType
    return type
  }
}).validate(data, true)
```

## Error Handling

### `ValidatorError`

When `validate()` throws (non-safe mode), it throws a `ValidatorError`:

```ts
import { ValidatorError } from '@atscript/typescript/utils'

try {
  validator.validate(data)
} catch (e) {
  if (e instanceof ValidatorError) {
    // e.message — first error message (with path prefix)
    // e.errors — full structured error array
    console.log(e.errors)
  }
}
```

### Error Structure

```ts
interface TError {
  path: string        // dot-separated path, e.g. "address.city"
  message: string     // human-readable error message
  details?: TError[]  // nested errors (for unions — shows why each branch failed)
}
```

### Reading Errors in Safe Mode

```ts
const validator = User.validator()
if (!validator.validate(data, true)) {
  // Errors are on the validator instance
  for (const error of validator.errors) {
    console.log(`${error.path}: ${error.message}`)
  }
}
```

### Error Examples

```ts
// Missing required property
{ path: 'name', message: 'Expected string, got undefined' }

// Wrong type
{ path: 'age', message: 'Expected number, got string' }

// Pattern validation
{ path: 'email', message: 'Value is expected to match pattern "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"' }

// Custom annotation message
{ path: 'name', message: 'Name is required' }  // from @meta.required "Name is required"

// Unknown property
{ path: 'foo', message: 'Unexpected property' }

// Union — shows why each branch failed
{
  path: 'data',
  message: 'Value does not match any of the allowed types: [string(0)], [number(1)]',
  details: [
    { path: 'data', message: 'Expected string, got boolean' },
    { path: 'data', message: 'Expected number, got boolean' },
  ]
}

// Array validation
{ path: '2.name', message: 'Expected string, got number' }  // 3rd element's name is wrong
```

### Error Limit

By default, the validator stops collecting errors after 10. Customize:

```ts
User.validator({ errorLimit: 50 }).validate(data, true)
```

## What Gets Validated

| Type Kind | Validation |
|-----------|-----------|
| `string` | Type check + `@meta.required` (non-empty) + `@expect.minLength/maxLength` + `@expect.pattern` |
| `number` | Type check + `@expect.int` + `@expect.min/max` |
| `boolean` | Type check + `@meta.required` (must be true) |
| `null` | Exact `null` check |
| `undefined` | Exact `undefined` check |
| `any` | Always passes |
| `never` | Always fails |
| `phantom` | Always passes (skipped) |
| `object` | Recursively validates all props, handles unknown props, pattern props |
| `array` | Type check + `@expect.minLength/maxLength` + recursively validates each element |
| `union` | At least one branch must pass |
| `intersection` | All branches must pass |
| `tuple` | Array length must match + each element validated against its position |
| `literal` | Exact value match |
| `optional` | `undefined` is accepted; if value is present, validated against inner type |

## Custom Validator Plugins

Plugins intercept validation at every node in the type tree. They can accept, reject, or defer to default validation.

### Plugin Signature

```ts
type TValidatorPlugin = (
  ctx: TValidatorPluginContext,
  def: TAtscriptAnnotatedType,
  value: any
) => boolean | undefined
//    ↑ true = accept, false = reject, undefined = fall through to default
```

### Plugin Context

```ts
interface TValidatorPluginContext {
  opts: TValidatorOptions                // current validator options
  validateAnnotatedType(def, value)      // call default validation for a specific type
  error(message, path?, details?)        // report an error
  path: string                           // current dot-separated path
  context: unknown                       // external context from validate(data, safe, context)
}
```

### Plugin Example — Custom Date Validation

```ts
const datePlugin: TValidatorPlugin = (ctx, def, value) => {
  // Only intercept string types tagged as dates
  if (def.type.kind === '' && def.type.tags.has('date')) {
    if (typeof value !== 'string') {
      ctx.error('Expected date string')
      return false
    }
    const parsed = Date.parse(value)
    if (isNaN(parsed)) {
      ctx.error(`Invalid date: "${value}"`)
      return false
    }
    return true
  }
  // Return undefined to fall through to default validation
  return undefined
}

User.validator({ plugins: [datePlugin] }).validate(data, true)
```

### Plugin Return Values

| Return | Meaning |
|--------|---------|
| `true` | Value is accepted — skip all further validation for this node |
| `false` | Value is rejected — error should be reported via `ctx.error()` before returning |
| `undefined` | Plugin doesn't handle this type — fall through to next plugin or default validation |

### Plugin Example — Coerce String to Number

```ts
const coercePlugin: TValidatorPlugin = (ctx, def, value) => {
  if (def.type.kind === '' && def.type.designType === 'number' && typeof value === 'string') {
    const num = Number(value)
    if (!isNaN(num)) {
      // Validate the coerced value against the full type (respects @expect.min etc.)
      return ctx.validateAnnotatedType(def, num)
    }
  }
  return undefined
}
```

### Multiple Plugins

Plugins run in order. The first plugin to return `true` or `false` wins — subsequent plugins and default validation are skipped for that node:

```ts
User.validator({
  plugins: [authPlugin, datePlugin, coercePlugin]
}).validate(data, true)
```

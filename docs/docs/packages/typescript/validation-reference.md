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
- `'strip'` — deletes the unknown keys from the value, only when `validate()` passes

With `'strip'`, validation reads the value as you passed it. The keys are deleted after the whole value has passed, so a failed validation leaves the value unchanged. A rejected union branch strips nothing: only the keys unknown to the branch that matched are deleted. The same holds for a [plugin](#plugins) that validates a sub-value with `ctx.validateAnnotatedType(...)`: a call that returns `false` strips nothing, so a plugin trying alternatives (`a || b`) strips what the union `a | b` would.

The compiler merges every intersection of object types in `.as` into one object type, which knows every member's keys. A node of kind `'intersection'` built at runtime (`defineAnnotatedType('intersection')`, `fromJsonSchema` with `allOf`) checks each member on its own, like JSON Schema `allOf`: a key only another member declares is unknown to a member (`'error'` reports it, `'strip'` removes it).

### `errorLimit`

Maximum number of errors to collect before stopping. Default: `10`. `validator.errors` never holds more.

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

| Annotation                  | Applies to               | Validates                                                                                     |
| --------------------------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| `@meta.required`            | string, boolean          | String: at least one non-whitespace character. Boolean: must be `true`                        |
| `@expect.minLength`         | string, array            | Minimum length                                                                                |
| `@expect.maxLength`         | string, array            | Maximum length                                                                                |
| `@expect.min`               | number                   | Minimum value                                                                                 |
| `@expect.max`               | number                   | Maximum value                                                                                 |
| `@expect.exclusiveMin`      | number                   | Strictly greater than the value (since 0.1.109)                                               |
| `@expect.exclusiveMax`      | number                   | Strictly less than the value (since 0.1.109)                                                  |
| `@expect.int`               | number                   | Must be integer                                                                               |
| `@expect.pattern`           | string                   | Regex match                                                                                   |
| `@expect.minKeys`           | object                   | At least this many keys (records, objects with optional props; see [Key counts](#key-counts)) |
| `@expect.maxKeys`           | object                   | At most this many keys                                                                        |
| `@expect.array.uniqueItems` | array                    | No duplicate items                                                                            |
| `@expect.array.key`         | array element properties | Marks identity fields for uniqueness and patch operations                                     |
| `@expect.message`           | prop, type               | Custom message for a value of the wrong type (see [below](#custom-message-for-a-wrong-type))  |

Semantic types like `string.email`, `string.required`, and `number.positive` add validation behavior through their built-in annotation definitions.

Default error messages and the order in which constraints are checked are listed in the [Validation Specification](/plugin-development/validation-spec#constraint-annotations).

Every rule above also applies to a **nullable** field — the target type in a union with `null` / `undefined` (`number | null`, `string[] | null`, or an alias of such a union): `null` passes and any other value is checked. Constraints on a literal member of a union (`'a' | 'b'`) are not checked — its value is fixed.

`unknown` accepts any value and checks nothing inside it. `undefined` is never a value, though: a required `unknown` field must be present (a missing one fails with `Expected unknown, got undefined`, code `TYPE`), and an `unknown[]` element can't be `undefined`. An optional `unknown` field may be omitted.

::: tip Decimal format
Values typed as `decimal` are stored as strings to preserve precision. The validator enforces the regex `/^[+-]?\d+(\.\d+)?$/` — anything else (NaN, scientific notation, leading/trailing whitespace) is rejected with `Invalid decimal format`.
:::

::: warning Non-finite numbers are rejected (since 0.1.100)
Every `number` (including `number.int`, `number.timestamp`, optional fields, union branches, array and tuple items) must be finite. `NaN`, `Infinity` and `-Infinity` fail with `Expected finite number, got NaN` (or `Infinity` / `-Infinity`), before `@expect.min` / `@expect.max` / `@expect.int` run. `0`, `-0` and fractions stay valid. The message is not overridable by annotation.

**Upgrading:** data that intentionally stored `Infinity` (for example an "unlimited" sentinel) now fails write validation — use `null`, an explicit bound, or a validator plugin that returns `true` for the value (plugins run before the type check). Validation of already-stored data is unaffected unless you validate it.
:::

::: warning Zero bounds are always enforced (since 0.1.102)
A bound of `0` is a real bound: `@expect.min 0` rejects `-1`, `@expect.max 0` rejects `1`, and `@expect.maxLength 0` rejects `'a'` and `['a']`. Earlier versions ignored a `0` bound when it was set as a bare number at runtime — `annotate('expect.min', 0)` and other `expect.minLength` / `maxLength` / `min` / `max` values — and `buildJsonSchema()` dropped it (no `minimum: 0`, `maxLength: 0`, …). Bounds written in `.as` files were already enforced.

**Upgrading:** types that set a bare-number `0` bound through `annotate()` now reject values outside it, and their JSON Schema now includes the bound.
:::

::: warning Nullable constraints and optional `@meta.required` (since 0.1.103)

- **Constraints on nullable fields are enforced.** `@expect.*` and `@meta.required` on `T | null` now compile, and `validate()` checks them on non-null values. Before, such a field failed to compile (`got "group"`), and a type built without that check — at runtime, via `fromJsonSchema()`, or with diagnostics ignored — silently skipped the constraint. `buildJsonSchema()` puts the constraint on the matching `anyOf` member.
- **`null` on an optional `@meta.required` field is rejected.** `@meta.required name?: string` accepts an omitted (or `undefined`) value but rejects `null` with the `@meta.required` message (`Must not be empty` / `Must be checked` by default). Partial validation keeps accepting an omitted field. Declare `name?: string | null` when `null` is a legal value.
- **Built-in primitive extensions keep their checks inside unions, arrays and tuples.** `number.int | null`, `string.email[]` and `[number.int, string]` now validate `expect.int` / the email pattern on the member, as a plain `number.int` field always did.

**Upgrading:** clients that send `null` for a cleared optional `@meta.required` field (for example a form that maps an empty input to `null`) must omit the field or send `undefined` — or declare the field `T | null`. Values on nullable fields, union members and array elements that broke a constraint and used to pass now fail.
:::

::: warning `string.required` and `boolean.required` are enforced on every field (since 0.1.104)
A field typed `string.required` or `boolean.required` — directly (`name: string.required`, `agreed?: boolean.required`) or through a type alias (`type Name = string.required`) — carries `@meta.required` again: `''` / whitespace-only strings fail with `Must not be empty`, `false` fails with `Must be checked`, and `buildJsonSchema()` emits `minLength: 1` (with `pattern: "\\S"`, matching the whitespace check; booleans `const: true`). Versions 0.1.79–0.1.103 dropped the annotation from such fields, so they accepted any string or boolean; union members and array elements (`string.required | null`, `string.required[]`) were already checked. A field that references another field (`ownerName: User.name`) still does not inherit it.

**Upgrading:** payloads with an empty string or `false` in these fields now fail validation — fill them, or type the field `string` / `boolean` if empty is legal.
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

## Key Counts

`@expect.minKeys` / `@expect.maxKeys` count the keys the validated object keeps, which depends on [`unknownProps`](#unknownprops):

| `unknownProps`        | Counted keys                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `'ignore'`            | every own key                                                                                                                     |
| `'strip'` / `'error'` | the declared props and the keys pattern props match (any other key is removed with `'strip'`, an error of its own with `'error'`) |

A failed count is reported (`MIN_KEYS` / `MAX_KEYS`) and the props are still checked, so their errors are reported too.

## Error Handling

`ValidatorError` extends `Error` and includes structured details:

```typescript
import { ValidatorError } from '@atscript/typescript/utils'

try {
  validator.validate(data)
} catch (e) {
  if (e instanceof ValidatorError) {
    for (const err of e.errors) {
      console.log(err.path) // 'address.city'
      console.log(err.code) // 'MIN_LENGTH'
      console.log(err.params) // { min: 3, actual: 1 }
      console.log(err.message) // 'Expected minimum length of 3 characters, got 1 characters'
    }
  }
}
```

After safe validation, errors are available on `validator.errors`. Each error (`TError`) has:

| Field     | Meaning                                                                                                                                   |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `path`    | Dot path of the value (`''` for the root)                                                                                                 |
| `message` | The default English message, or the app's own message from an annotation                                                                  |
| `code`    | Stable UPPER_SNAKE code (see [Error Codes](#error-codes)); `CUSTOM` for a plugin error reported without a code                            |
| `params`  | The values the message needs: limits, expected type, pattern, allowed values (JSON-safe; input copied into them is cut at 100 characters) |
| `custom`  | `true` when `message` is app text (an annotation's message argument, `@expect.message`, a plugin's own message)                           |
| `details` | The errors of each branch, for a union error                                                                                              |

## Error Codes

The validator is locale-agnostic: it reports codes and params, and its default messages are English. Translate errors after validation with `localizeErrors()`, or per validator with the `translate` option. The compiled checks are not affected (they only decide pass / fail; errors always come from the same walk).

Every default message is its code's template from `VALIDATOR_MESSAGES`, with `{name}` replaced by `params.name`:

| Code                                                                      | Default template                                                       | Params                                  |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------- |
| `REQUIRED`                                                                | `Must not be empty`                                                    |                                         |
| `REQUIRED_CHECKED`                                                        | `Must be checked`                                                      |                                         |
| `TYPE`                                                                    | `Expected {expected}, got {actual}`                                    | `expected`, `actual` (type names)       |
| `TYPE_ARRAY`                                                              | `Expected array`                                                       | `actual`                                |
| `TYPE_OBJECT`                                                             | `Expected object`                                                      | `actual`                                |
| `TYPE_DECIMAL`                                                            | `Expected string (decimal), got {actual}`                              | `actual`                                |
| `NOT_FINITE`                                                              | `Expected finite number, got {actual}`                                 | `actual` (`'NaN'`, `'Infinity'`, …)     |
| `DECIMAL_FORMAT`                                                          | `Invalid decimal format: "{value}"`                                    | `value`                                 |
| `NEVER`                                                                   | `This type is impossible, must be an internal problem`                 |                                         |
| `LITERAL`                                                                 | `Expected {expected}, got {actual}`                                    | `expected` (the literal), `actual`      |
| `UNION`                                                                   | `Value does not match any of the allowed types: {expected}`            | `expected`                              |
| `UNION_DISCRIMINATOR`                                                     | `Expected one of {allowed}, got {actual}`                              | `property`, `allowed` (array), `actual` |
| `UNEXPECTED_PROPERTY`                                                     | `Unexpected property`                                                  | `property`                              |
| `TUPLE_LENGTH`                                                            | `Expected array of length {length}`                                    | `length`                                |
| `MIN_LENGTH`                                                              | `Expected minimum length of {min} characters, got {actual} characters` | `min`, `actual`                         |
| `MAX_LENGTH`                                                              | `Expected maximum length of {max} characters, got {actual} characters` | `max`, `actual`                         |
| `MIN_ITEMS`                                                               | `Expected minimum length of {min} items, got {actual} items`           | `min`, `actual`                         |
| `MAX_ITEMS`                                                               | `Expected maximum length of {max} items, got {actual} items`           | `max`, `actual`                         |
| `UNIQUE_ITEMS`                                                            | `Duplicate items are not allowed`                                      | (path: the duplicate's index)           |
| `MIN_KEYS`                                                                | `Expected at least {min} properties, got {actual}`                     | `min`, `actual`                         |
| `MAX_KEYS`                                                                | `Expected at most {max} properties, got {actual}`                      | `max`, `actual`                         |
| `PATTERN`                                                                 | `Value is expected to match pattern "{pattern}"`                       | `pattern`, `flags` (when set)           |
| `INT`                                                                     | `Expected integer, got {actual}`                                       | `actual`                                |
| `MIN` / `MAX`                                                             | `Expected minimum {min}, got {actual}` / `Expected maximum {max}, …`   | `min` / `max`, `actual`                 |
| `EXCLUSIVE_MIN`                                                           | `Expected greater than {min}, got {actual}`                            | `min`, `actual`                         |
| `EXCLUSIVE_MAX`                                                           | `Expected less than {max}, got {actual}`                               | `max`, `actual`                         |
| `EMAIL`, `PHONE`, `DATE`, `ISO_DATE`, `UUID`, `URL`, `IPV4`, `IPV6`, `IP` | the `string.*` primitive's format message (`Invalid email format.`, …) |                                         |

Import the table and the code names from `@atscript/typescript/utils`: `VALIDATOR_MESSAGES` (code → English template), `VALIDATOR_ERROR_CODES` (code → code) and the `TValidatorErrorCode` type. Serve the table per locale (translated templates keyed by code) to let clients localise without their own catalog.

### Translating errors

`localizeErrors(errors, translate)` returns new errors with translated messages (details included). `translate(id, params, error)` gets:

- the **code** for a default message (`'MIN_LENGTH'`),
- the **message text** for app text (`custom: true`, or an error without a code) — the text is the message id (gettext style),

and returns the translated message, or `undefined` to keep the current one.

```typescript
import { localizeErrors, messagesTranslator } from '@atscript/typescript/utils'

const de = {
  MIN_LENGTH: 'Mindestens {min} Zeichen',
  'Choose a valid status': 'Bitte einen gültigen Status wählen',
}

if (!validator.validate(data, true)) {
  const errors = localizeErrors(validator.errors, messagesTranslator(de))
}
```

`messagesTranslator(map)` looks the id up in a map of templates and fills `{name}` placeholders from the params (`formatValidatorMessage(template, params)` does the filling on its own). Bring your own i18n library with a function instead:

```typescript
localizeErrors(errors, (id, params) => (i18n.exists(id) ? i18n.t(id, params) : undefined))
```

To get translated errors from one validator directly, pass `translate`:

```typescript
const validator = Product.validator({ translate: messagesTranslator(de) })
validator.validate(data) // the thrown ValidatorError and validator.errors carry translated messages
```

- **DO translate per request with `localizeErrors()`** and keep one validator per type: a `translate` option per locale means one validator per locale.
- **DON'T match on `message`.** It changes with custom messages and translation; branch on `code` and read `params`.

### Custom message for a wrong type

Constraint annotations take a message argument (`@expect.minLength 3, "Too short"`, `@expect.int "Whole numbers only"`). For a value of the wrong type, use `@expect.message` on the field or the type:

```atscript
export interface Account {
    @expect.message "Choose a valid status"
    status: 'active' | 'blocked'

    @expect.message "Age must be a number"
    age?: number.int
}
```

It replaces the message of `TYPE`, `TYPE_ARRAY`, `TYPE_OBJECT`, `TYPE_DECIMAL`, `NOT_FINITE`, `DECIMAL_FORMAT`, `LITERAL`, `UNION`, `UNION_DISCRIMINATOR` and `TUPLE_LENGTH` errors at that node. The error keeps its `code` and `params` with `custom: true`. Constraint failures keep their own messages.

### Discriminated unions

When every object branch of a union has a required literal-typed property of the same name with a distinct value (`{ kind: 'cat', … } | { kind: 'dog', … }`, optionally `| null`), an object that fails the union is reported through its discriminator:

- the discriminator picks a branch → that branch's errors, at their own paths (`pet.lives: Expected maximum 9, got 10`), instead of one union error with every branch's errors;
- the discriminator matches no branch (or is missing) → one `UNION_DISCRIMINATOR` error at the discriminator (`pet.kind`), `params.allowed` listing the values.

With partial validation at the union's depth (`partial: 'deep'`, or `true` at the top), an object without the discriminator gets the `UNION` error, with every branch's errors in `details`. Other unions (no shared literal property, two such properties, an optional discriminator in a branch, a branch that may hold any object) report the `UNION` error with `details` as before. The same detection drives the JSON Schema `discriminator`.

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

The plugin context exposes `opts`, `validateAnnotatedType`, `error`, `path`, `root`, and `context`. `ctx.validateAnnotatedType(def, value)` validates a sub-value at the current path. With `unknownProps: 'strip'`, a call that returns `false` drops the keys it recorded, as a rejected union branch does; a call that passes keeps them, and they are deleted once the whole value passes.

### The Root Type

`ctx.root` (since 0.1.105) is the type the validator was created for — the same for every node of the walk, as passed to the constructor (before `replace`). Use it when a rule depends on where the visited node sits in the whole type, together with `ctx.path`:

```typescript
// A custom repeatable annotation (`multiple: true`, `mergeStrategy: 'append'`) on the interface —
// `@app.serverFilled 'createdBy'` `@app.serverFilled 'audit.editor'` — lists the paths
// that may be left out because the server fills them in
const serverFilled: TValidatorPlugin = (ctx, def, value) => {
  const paths = ctx.root.metadata.get('app.serverFilled')
  if (value === undefined && paths?.includes(ctx.path)) {
    return true
  }
  return undefined
}
```

### Reporting Custom Errors from a Plugin

Plugins may push their own structured errors into the active validator via `ctx.error(message, path?, details?, info?)`:

| Argument  | Type          | Notes                                                                                                                              |
| --------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `message` | `string`      | Required. Becomes the `message` of a `TError` entry.                                                                               |
| `path`    | `string?`     | Optional. Defaults to the current dot-separated path being validated.                                                              |
| `details` | `TError[]?`   | Optional. Nested error breakdown — useful when an alternative-tested branch fails.                                                 |
| `info`    | `TErrorInfo?` | Optional `{ code, params, custom }`. Without it the error has code `CUSTOM` and `custom: true` (its message is the translation id) |

```typescript
const requirePositiveAmount: TValidatorPlugin = (ctx, def, value) => {
  if (def.metadata.get('meta.label') === 'Amount' && typeof value === 'number' && value <= 0) {
    ctx.error('Amount must be positive', ctx.path, [{ path: ctx.path, message: `Got ${value}` }])
    return false
  }
  return undefined
}
```

Give the error a code so apps can translate it by code:

```typescript
ctx.error(`Amount must be positive`, undefined, undefined, {
  code: 'AMOUNT_NOT_POSITIVE',
  params: { actual: value },
})
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

## Input Normalization: `normalizeForType()`

```typescript
import { normalizeForType } from '@atscript/typescript/utils'

normalizeForType<T>(def: TAtscriptAnnotatedType, value: T): T
```

Applies the type's [`@normalize.*`](/packages/typescript/annotations-reference#normalize-annotations-normalize) annotations (`trim`, `lowercase`, `uppercase`). The validator never normalizes, so call it on input before validating it:

```typescript
import { normalizeForType } from '@atscript/typescript/utils'
import { Signup } from './signup.as'

const input = normalizeForType(Signup, body) // { email: '  Ann@Example.COM ' } → { email: 'ann@example.com' }
Signup.validator().validate(input)
```

With coercion as well, the order is `coerceForType` → `normalizeForType` → `validate`. In Moost apps the [validation pipe](/packages/moost-validator/validation-pipe#normalized-input) does it for you.

Rules:

- **pure** — returns a normalized copy and never mutates the input; when nothing changes it returns the input itself, and unchanged nested objects are shared
- **strings only** — trim, then lowercase, then uppercase; other values, and strings without normalizers, are returned as they are; unknown properties are kept
- **walks** object properties (pattern properties too), arrays, tuples, intersections and unions; normalizers on a union apply to its string members (`@normalize.trim` on `nickname?: string | null`)
- **unions** — a value is normalized only when the result does not depend on the member that takes it. A union of objects with a [discriminator](/packages/typescript/json-schema#discriminated-unions) uses the member the discriminator names. Otherwise every member that can take the value must give the same result (a literal member takes a string only when the normalized string is its literal); if they differ, the members whose own validator (default options: every required property present, no unknown ones) accepts their result decide, and their result is used when they agree; otherwise the value is returned untouched for the validator to judge. So `contact: Email | Digits` normalizes `' A@B.CO '` to `'a@b.co'` (only the `Email` result is valid), while two members whose different results are both valid leave the value as it is. Give a union of objects a discriminator when its members normalize a field differently
- **non-plain objects** (`Date`, `Buffer`, class instances) are returned as they are; an object whose literal property (`kind: 'cat'`) holds another value is left as it is
- **never validates** — run the validator on the result. It does not throw on ordinary input; a cyclic value overflows the stack, as it does in the validator
- **cost** — a type without normalizers returns the input at once; otherwise each object of the value is normalized once per type, recursive unions included

Normalizers are kept by `serializeAnnotatedType()`, so a client can normalize with a deserialized type too.

## Next Steps

- [Validation Guide](/packages/typescript/validation) — the practical application flow
- [Compiled Validators](/packages/typescript/compiled-validators) — which options keep a validator on the interpreted path
- [Type Definitions](/packages/typescript/type-definitions) — the runtime type system behind validation
- [Serialization](/packages/typescript/serialization) — validate deserialized types

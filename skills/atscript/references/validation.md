# Validation

`Validator` reads the runtime metadata tree (`.as.js`) and checks data against `@expect.*` constraints. Also converts to/from JSON Schema.

All APIs in `@atscript/typescript/utils`. Main entry `@atscript/typescript` exports only `tsPlugin`.

## Basic use

```ts
import { User } from './models/user.as'

const validator = User.validator()

// Throwing: raises ValidatorError on failure
validator.validate({ id: '...', name: 'Ada' })

// Safe: returns boolean; errors on validator.errors
const ok = validator.validate(data, true)
if (!ok) {
  for (const err of validator.errors) console.log(err.path, err.message)
}
```

`User.validator(opts?)` is **cached** per options object — cheap to call repeatedly.

## `ValidatorOptions`

```ts
interface ValidatorOptions {
  partial?: boolean | 'deep' | ((path: string) => boolean)
  unknownProps?: 'strip' | 'ignore' | 'error'
  errorLimit?: number
  plugins?: TValidatorPlugin[]
}
```

- `partial` — allow missing required fields.
  - `true` → shallow (top-level only).
  - `'deep'` → partial at every nesting level.
  - function → per-path predicate; return `true` to treat as optional.
- `unknownProps`:
  - `'strip'` → remove (mutates the object).
  - `'ignore'` → leave silently.
  - `'error'` → fail. **Default.**
- `errorLimit` — stop accumulating after N. Useful for UI feedback.
- `plugins` — custom checks (see below).

## `ValidatorError`

```ts
import { ValidatorError } from '@atscript/typescript/utils'

try {
  validator.validate(data)
} catch (e) {
  if (e instanceof ValidatorError) {
    e.errors  // TError[]
    e.message // summary
  }
}

interface TError {
  path: string        // 'user.email', 'cart.items[3].sku'
  message: string
  details?: TError[]  // nested errors for structured constraints
}
```

Paths: dots for object props, `[n]` for array indices, `["key"]` for pattern-property matches.

## Assertion narrowing

```ts
function assertUser(data: unknown): asserts data is User {
  User.validator().validate(data)
}
assertUser(input)
// `input` is `User` from here
```

## JSON Schema

### `buildJsonSchema(annotatedType)`

Runtime type → JSON Schema (Draft 2020-12). Named interfaces → `$defs` + `$ref`. Discriminated unions detected when members share a literal-valued property.

```ts
import { buildJsonSchema } from '@atscript/typescript/utils'

const schema = buildJsonSchema(User.annotatedType)
// { $schema, $ref: '#/$defs/User', $defs: { User: { … } } }
```

### `fromJsonSchema(schema)`

Reverse. For OpenAPI / JSON-Schema-first interop.

```ts
const annotatedType = fromJsonSchema(mySchema)
```

### `mergeJsonSchemas(types)`

Combine types into one schema with shared `$defs`. Useful for a single OpenAPI doc covering many models.

```ts
const combined = mergeJsonSchemas([User.annotatedType, Project.annotatedType, Team.annotatedType])
// combined.$defs has User, Project, Team; top-level members as $ref
```

## Validator plugins

Custom rules via `plugins: TValidatorPlugin[]`. A plugin is a **function** — not an object — called per visited node. Returns `boolean | undefined`: `true`/`false` = pass/fail, `undefined` = no opinion.

```ts
type TValidatorPlugin = (
  ctx: TValidatorPluginContext,
  def: TAtscriptAnnotatedType,
  value: any,
) => boolean | undefined
```

```ts
import type { TValidatorPlugin } from '@atscript/typescript/utils'

const customRule: TValidatorPlugin = (ctx, def, value) => {
  const tag = def.metadata.get('business.rule')
  if (!tag) return
  if (!passes(value, tag)) {
    ctx.error('Failed business rule: ' + tag)
    return false
  }
  return true
}

const validator = User.validator({ plugins: [customRule] })
validator.validate(data, true)
```

Plugin receives:

- `ctx` — `TValidatorPluginContext` with `ctx.error(msg, details?)`, `ctx.path`, `ctx.opts`.
- `def` — current `TAtscriptAnnotatedType`.
- `value` — actual value at this location.

**Synchronous only** — no `Promise` support. Long-running checks (DB, HTTP) must happen outside `validate()`.

Inside plugins, rely on global `AtscriptMetadata` for typed `metadata.get(...)` — never cast to `any`. See [codegen.md](codegen.md#atscriptdts).

## See also

- [runtime.md](runtime.md) — the type tree.
- [annotations.md](annotations.md) — `@expect.*` constraints.
- [moost-validator.md](moost-validator.md) — Moost HTTP integration.

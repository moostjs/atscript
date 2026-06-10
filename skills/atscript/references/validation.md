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

`User.validator(opts?)` constructs a fresh `Validator` each call (not cached). Reuse the instance if you call it in a hot path.

## Options (`TValidatorOptions`)

All optional — pass any subset to `.validator(opts)`:

| Option         | Values (default first)                                                                            | Effect                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `partial`      | `false` · `true` (top-level only) · `'deep'` (every level) · `(type, path) => boolean`             | Allow missing required fields                                                                       |
| `unknownProps` | `'error'` · `'strip'` (removes — **mutates the object**) · `'ignore'`                               | How unknown properties are treated                                                                  |
| `errorLimit`   | `10`                                                                                                | Stop accumulating errors after N                                                                    |
| `replace`      | `(type, path) => TAtscriptAnnotatedType`                                                            | Substitute the type validated against at a path; results cached per-type via `WeakMap`              |
| `skipList`     | `Set<string>` of property paths                                                                     | Skip those paths entirely                                                                           |
| `plugins`      | `TValidatorPlugin[]`                                                                                | Custom checks (see below)                                                                           |

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

Runtime type → JSON Schema. Named nested object types (with an `id`) are extracted into `$defs` + `$ref`. The root is **not** extracted — the returned object is the schema itself (e.g. `{ type: 'object', properties, $defs? }`). No `$schema` field. Discriminated unions detected when members share a literal-valued property.

```ts
import { buildJsonSchema } from '@atscript/typescript/utils'

const schema = buildJsonSchema(User)
// { type: 'object', properties: { … }, $defs?: { … } }
```

### `fromJsonSchema(schema)`

Reverse. For OpenAPI / JSON-Schema-first interop.

```ts
const annotatedType = fromJsonSchema(mySchema)
```

### `mergeJsonSchemas(types)`

Combines types into `{ schemas: Record<id, schema>, $defs: Record<id, schema> }` — every type must have an `id`. Useful for a single OpenAPI doc covering many models.

```ts
const { schemas, $defs } = mergeJsonSchemas([User, Project, Team])
```

### `detectDiscriminator(items)`

Detects the discriminator property of a union: every variant must be an object carrying the same literal-valued property with a distinct value. Returns `TUnionDiscriminator | null` (`null` when no qualifying property exists or more than one does — ambiguous). Used internally by `buildJsonSchema`; exposed for consumers (e.g. form layers) that need a fast-path for tagged unions instead of brute-forcing every variant's validator.

```ts
import { detectDiscriminator } from '@atscript/typescript/utils'
import type { TUnionDiscriminator } from '@atscript/typescript/utils'

// MediaSource = { kind: 'url', url: string } | { kind: 'upload', file: Blob }
const disc = detectDiscriminator((MediaSource.type as any).items)
// → { propertyName: 'kind', indexMapping: { url: 0, upload: 1 } }
const idx = disc?.indexMapping[value[disc.propertyName]] // O(1) variant lookup
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

- `ctx` — `TValidatorPluginContext` with `ctx.error(message, path?, details?)`, `ctx.path`, `ctx.opts`, `ctx.validateAnnotatedType`, `ctx.context` (user-supplied via `validate(value, safe, context)`).
- `def` — current `TAtscriptAnnotatedType`.
- `value` — actual value at this location.

**Synchronous only** — no `Promise` support. Long-running checks (DB, HTTP) must happen outside `validate()`.

Inside plugins, rely on global `AtscriptMetadata` for typed `metadata.get(...)` — never cast to `any`. See [codegen.md](codegen.md#atscriptdts).

## See also

- [runtime.md](runtime.md) — the type tree.
- [annotations.md](annotations.md) — `@expect.*` constraints.
- [moost-validator.md](moost-validator.md) — Moost HTTP integration.

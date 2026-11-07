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

| Option         | Values (default first)                                                                 | Effect                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `partial`      | `false` · `true` (top-level only) · `'deep'` (every level) · `(type, path) => boolean` | Allow missing required fields                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `unknownProps` | `'error'` · `'strip'` (removes — **mutates the object**) · `'ignore'`                  | How unknown properties are treated; `'strip'` deletes only once the whole value passed (a rejected union branch, a plugin `ctx.validateAnnotatedType` call returning `false`, or a failed validation strips nothing); a runtime-built `'intersection'` node (hand-built, `fromJsonSchema` `allOf`) checks each member on its own (JSON Schema `allOf`): a key only another member declares is unknown to a member — merge object types in `.as` instead |
| `errorLimit`   | `10`                                                                                   | Stop accumulating errors after N                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `replace`      | `(type, path) => TAtscriptAnnotatedType`                                               | Substitute the type validated against at a path; results cached per-type via `WeakMap`                                                                                                                                                                                                                                                                                                                                                                  |
| `skipList`     | `Set<string>` of property paths                                                        | Skip those paths entirely                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `plugins`      | `TValidatorPlugin[]`                                                                   | Custom checks (see below)                                                                                                                                                                                                                                                                                                                                                                                                                               |

## Compiled validators (opt-in)

`ts({ compileValidators: true })` in `atscript.config` → `asc -f js` / unplugin emit a compiled boolean check per type into `.as.js`; `validate()` uses it with no code changes.

| #   | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Off by default. Turn on for backend/server builds; keep frontend bundles interpreted (each compiled type adds code). CSP-safe (no `eval` / `new Function`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2   | Results, error messages/paths, `errorLimit` and `'strip'` deletions are identical to interpreted. Compiled check = fast path for valid input only; invalid input runs the normal error-collecting walk (no error-path speed-up).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 3   | Always interpreted (validator): `plugins`, `replace`, `skipList`, function `partial`, any `Validator` subclass. Supported: `partial: true` / `'deep'`, `unknownProps: 'error'` / `'ignore'` / `'strip'`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 4   | Always interpreted (type): deserialized (`deserializeAnnotatedType`, e.g. metadata shipped to a frontend), `fromJsonSchema()`, flattened, hand-built `defineAnnotatedType()` types. Two copies of `@atscript/typescript` in the app → interpreted. Any size compiles; a same-file type over ~100 type nodes is called through its own check, not inlined (with `@emit.compiledValidator` annotate it too, else that part is interpreted). Generated by another `@atscript/typescript` version → its check is ignored (interpreted) until regenerated.                                                                                                                                                                                                           |
| 5   | Walked even when compiled (correct, not accelerated): pattern properties, `@expect.array.uniqueItems` arrays.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 6   | Tracked mutations (auto re-bind): `annotate()`, `metadata` / `props` Map `set`/`delete`/`clear`, `defineAnnotatedType()` handle methods.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 7   | Untracked → call `invalidateCompiledValidators()` (from `@atscript/typescript/utils` or `@atscript/typescript`): raw writes (`node.optional = …`, `node.type = …`, `node.metadata = …`, `type.items.push(…)`), in-place edits of a constraint object or `@expect.pattern` array (never mutate an array read from metadata — it may be shared with a base node; use `set()` or `annotate(map, key, value, true)`). Writes are local to the node written; see [runtime.md](runtime.md#metadata-layers--runtime-writes). Skipping it = check keeps validating the old shape/values. Same rule for the interpreted engine: layered metadata reads (references, merged fields, path overrides) are cached until a tracked write or `invalidateCompiledValidators()`. |
| 8   | Any mutation of a bound type makes every compiled check re-bind once on next use — mutate at startup, never per request.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 9   | Per-build override: unplugin `compileValidators: boolean \| 'ssr'` — see [unplugin.md](unplugin.md#options).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 10  | Per-type opt-in with the option off: `@emit.compiledValidator` on an interface/type/`annotate … as`. Only that class gets a check; same-file types it uses are compiled inside it but get no check of their own (annotate them too if validated directly); imported types compile inside it only if their module compiles them. On a mutating `annotate` it compiles the target only if declared in the same file (imported target → warning, no effect). Ignored by forced-interpreted builds (unplugin `false`, client side of `'ssr'`).                                                                                                                                                                                                                      |

## Non-finite numbers (since 0.1.100)

Every `number` (plain, optional, `number.int`, `number.timestamp`, union branch, array/tuple item) must be finite: `NaN` / `Infinity` / `-Infinity` fail with `Expected finite number, got NaN` before `@expect.min`/`max`/`int` run. `0`, `-0`, fractions stay valid. Not overridable by annotation. Escape hatch: a `TValidatorPlugin` returning `true` (plugins run before the type check). Upgrade: stored `Infinity` sentinels now fail write validation — use `null`, a bound, or a plugin.

Since 0.1.103 (tightenings — upgrade note in the docs' validation reference):

| #   | Rule                                                                                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Constraints on a nullable union (`@expect.max 10` on `number \| null`, `@meta.required` on `string \| null`) are checked on non-null values, full walk and fast path alike; `null` passes. Literal union members are exempt. `buildJsonSchema()` puts them on the matching `anyOf` member. |
| 2   | Optional `@meta.required` field: omitted / `undefined` passes, `null` fails with the `@meta.required` message. Partial modes still skip omitted fields. Declare `T \| null` to allow `null`.                                                                                               |
| 3   | Built-in primitive extensions as union members / array elements / tuple items (`number.int \| null`, `string.email[]`) keep their `expect.*` checks in generated code.                                                                                                                     |

Since 0.1.104: `string.required` / `boolean.required` fields (direct, optional, or via a type alias) carry `@meta.required` again — `''`/whitespace and `false` fail; JSON Schema gets `minLength: 1`. 0.1.79–0.1.103 dropped it there (only union members / array elements were checked). A field ref (`x: User.name`) still does not inherit it.

Since 0.1.109: `@expect.exclusiveMin n` / `@expect.exclusiveMax n` reject the bound itself (JSON Schema `exclusiveMinimum` / `exclusiveMaximum`; `fromJsonSchema()` also reads the draft-4 boolean form). Default messages + evaluation order: docs → `plugin-development/validation-spec.md` → "Number Constraints".

A `0` bound is enforced (since 0.1.102): `@expect.min 0` rejects `-1`, `@expect.max 0` rejects `1`, `@expect.maxLength 0` rejects `'a'` / `['a']`. Earlier versions skipped a bare-number `0` set at runtime (`annotate('expect.min', 0)`) in both `validate()` and `buildJsonSchema()`; `.as`-declared bounds were already enforced.

## `ValidatorError`

```ts
import { ValidatorError } from '@atscript/typescript/utils'

try {
  validator.validate(data)
} catch (e) {
  if (e instanceof ValidatorError) {
    e.errors // TError[]: { path, message, code, params, custom?, details? }
    e.message // summary
  }
}
```

Paths: dots for object props, `[n]` for array indices, `["key"]` for pattern-property matches.

## Error codes + translation

Key imports (`@atscript/typescript/utils`): `localizeErrors`, `messagesTranslator`, `formatValidatorMessage`, `VALIDATOR_MESSAGES`, `VALIDATOR_ERROR_CODES`, types `TError`, `TValidatorErrorCode`, `TValidatorTranslate`, `TErrorInfo`.

```ts
const de = { 'MIN_LENGTH': 'Mindestens {min} Zeichen', 'Choose a valid status': 'Status wählen' }
const errors = localizeErrors(validator.errors, messagesTranslator(de)) // per request
Product.validator({ translate: messagesTranslator(de) }) // or one validator per locale
```

| #   | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Every validator error has `code` (UPPER_SNAKE) + `params` (JSON-safe). Default `message` = `VALIDATOR_MESSAGES[code]` with `{name}` filled from `params` (English). Full code/params table: docs → `validation-reference.md` → "Error Codes".                                                                                                                                                                                                            |
| 2   | App text (annotation message arg, `@expect.message`, plugin `ctx.error(msg)` without info) → `custom: true`; `code`/`params` still set. Translator gets the **text** as id (gettext style); defaults → the **code**.                                                                                                                                                                                                                                     |
| 3   | `translate(id, params, error)` returning `undefined` keeps the message. `localizeErrors` returns new objects (details too); originals untouched.                                                                                                                                                                                                                                                                                                         |
| 4   | Branch on `code`, never on `message`. `string.email` & co. report `EMAIL`, `PHONE`, `DATE`, `ISO_DATE`, `UUID`, `URL`, `IPV4`, `IPV6`, `IP` (message stays the primitive's).                                                                                                                                                                                                                                                                             |
| 5   | Plugin errors with a code: `ctx.error(msg, path?, details?, { code, params })`; without `info` → code `CUSTOM`.                                                                                                                                                                                                                                                                                                                                          |
| 6   | Discriminated object unions (all object branches share one literal prop, distinct values; other branches scalars/arrays only, `\| null` ok): a failing object reports the picked branch's errors at their paths, or one `UNION_DISCRIMINATOR` (`params.allowed`) at the discriminator. Two literal props / an optional discriminator / an `any` branch → plain `UNION` with `details`. `partial` at the union's depth + missing tag → plain `UNION` too. |
| 7   | `@expect.minKeys`/`maxKeys` count kept keys: all own keys under `unknownProps: 'ignore'`, declared + pattern-matched under `'strip'`/`'error'`. A failed count is reported AND props still validated.                                                                                                                                                                                                                                                    |
| 8   | `errorLimit` is a hard cap on `validator.errors`. Raw input in params (`LITERAL.actual`, `DECIMAL_FORMAT.value`, `UNION_DISCRIMINATOR.actual`, `UNEXPECTED_PROPERTY.property`) is cut at 100 chars + `…`. Format codes (`EMAIL`…) have empty params.                                                                                                                                                                                                     |
| 9   | Compiled checks stay boolean; errors always come from the interpreted walk — same codes either engine.                                                                                                                                                                                                                                                                                                                                                   |
| 10  | Since 0.2.10: a non-optional `@meta.required` field that is missing (or `null` where its type rejects `null`) reports `REQUIRED` (`REQUIRED_CHECKED` for booleans) with the `@meta.required` message (bare: the `@expect.message` text, else the default), not `TYPE` / `UNION`. Fields without it keep `TYPE`; wrong-typed values keep `TYPE` + `@expect.message`; optional/partial omission still passes. |

## Assertion narrowing

```ts
function assertUser(data: unknown): asserts data is User {
  User.validator().validate(data)
}
assertUser(input)
// `input` is `User` from here
```

## `coerceForType` — string-transport coercion

```ts
import { coerceForType } from '@atscript/typescript/utils'

coerceForType(KafkaOffset, '42') // → 42
coerceForType(KafkaOffset, 'abc') // → 'abc' — validate afterwards for the proper error
```

Converts string input (route params, query strings) toward the annotated type's scalar shapes. Pure, never throws, never validates — always pair with `validate()` after.

| #   | Rule                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Only strings are converted: number ← `Number()` on trimmed non-empty (finite only); boolean ← `"true"/"1"/"false"/"0"`. `string`/`decimal` input never changed. |
| 2   | Unions: ONE branch, coerced against it only (linear, no backtracking). Scalar branch takes what it parses (literal: only its literal). Object / tuple branch takes a plain object / array of its length unless a literal prop / item (`kind: 'cat'`, `kind: 'cat' \| null`, an aliased literal union) holds a value not coercing to it, strings compared after the normalizers of the literal and the unions/aliases it is in. A string coerces to a numeric literal (`"2"` → `2`), and to a boolean literal only in hand-built/deserialized types (`.as` has none). Scalar → first taker. Object/array → the only taker, else the best one, judged from own keys/items only (linear), by independent checks in weight order: props/items hold their kinds (`"3"` for `number`, `null` only where allowed; never waivable) > no undeclared key (`unknownProps` can waive) > every required prop present (`partial` can waive). A patch `{good:'true'}` → `{kind:'dog'; good:boolean}` over an earlier `{kind:'cat'; lives:number}`. Nested unions count as their leaf branches (`(A\|B)\|C` ≡ `A\|B\|C`). Ties: the branch the discriminator (over the leaves) names by the literal itself, then declared order (`{v:1,n:number} \| {v:'1',n:boolean}`: `{v:'1',n:'3'}` → `{v:1,n:3}`). No branch takes it → untouched. Non-union objects ignore literal props. |
| 3   | Objects: recurses into props for plain-object input (`@Query()` DTO case). Returns a new object — input never mutated. Arrays/tuples: per item.                 |
| 4   | Constraints (`@expect.*`) are NOT checked — coercion is representation-only; unparsable input returns unchanged for `Validator` to report.                      |

In Moost apps use `coercionPipe` from `@atscript/moost-validator` instead of calling this directly — see [moost-validator.md](moost-validator.md#coercion-rules-coercionpipe).

## `normalizeForType` — input normalizers

```ts
import { normalizeForType, typeHasNormalizers } from '@atscript/typescript/utils'

const input = normalizeForType(Signup, body) // @normalize.trim / lowercase / uppercase applied
Signup.validator().validate(input) // order: coerceForType → normalizeForType → validate
typeHasNormalizers(Signup) // true when normalizeForType can change a value of this type (cached, current across annotate())
// validated with options? pass the same ones: union branches are judged with them
const patch = normalizeForType(Patch, body, { partial: true })
Patch.validator({ partial: true }).validate(patch)
```

Applies `@normalize.*` ([annotations.md](annotations.md#normalize)). The validator never normalizes — every write path (HTTP pipe, DB write, form submit) must call this before `validate()`.

| #   | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Pure: returns a normalized copy, never mutates input. Copy-on-change: nothing to change → the same object back; untouched sub-objects are shared; a type without normalizers returns the input at once. Never validates. Does not throw on ordinary input (a cyclic value overflows the stack, as in `Validator`).                                                                                                                                                                                                                                                                          |
| 2   | Only strings change (trim → lowercase → uppercase). Non-strings, wrong-kind values, non-plain objects (`Date`, `Buffer`, class instances) and strings without normalizers are returned as they are. Unknown props kept (an own `__proto__` key stays an own key). An object whose literal prop holds another value is left as it is.                                                                                                                                                                                                                                                                                          |
| 3   | Walks object props + pattern props, arrays, tuples, intersections, unions. A union's own normalizers apply to its string branches (`@normalize.trim x?: string \| null`).                                                                                                                                                                                                                                                                                 |
| 4   | Unions normalize only when unambiguous: an object union with a discriminator uses the branch it names; otherwise every branch that can take the value must give the same result (a literal branch takes a string only if the normalized string equals the literal), if they differ, the branches whose own validator accepts their result decide: one agreed result is used, else the value is returned untouched. Branch validators take the 3rd arg `opts` (pass the options you validate with; default options when omitted; `unknownProps: 'strip'` judged as `'ignore'`; `partial: true` only for a union that is the value's own type; path-dependent options see paths from the union). `contact: Email \| Digits` with `' A@B.CO '` → `'a@b.co'` (only the `Email` result validates); `Email \| Code` where both results validate → untouched. Linear in the value's size (each object is normalized once per type, recursive unions included). |
| 5   | Works on deserialized types (`normalize.*` metadata survives `serializeAnnotatedType`).                                                                                                                                                                                                                                                                                                                                                                   |

## `decimal` format

`decimal` values are **strings** at runtime, validated against a strict canonical shape — `^[+-]?\d+(\.\d+)?$` — never JS number coercion:

- Pass: `"0"`, `"0.000"`, `"-12.34"`, `"+5"`.
- Fail: `""`, `".5"`, `"5."`, `"1e3"`, `"1,000"`, `" 1.5 "`, `"NaN"`, `"Infinity"`, and any actual `number` (`123`).
- The validator never normalizes — trim whitespace, strip locale separators, and expand scientific notation **before** validating.
- Two distinct messages let you tell type bugs from bad input: `Expected string (decimal), got <kind>` (wrong runtime type) vs `Invalid decimal format: <value>` (string, but malformed).

Rationale + full sample table: docs → `plugin-development/validation-spec.md` → "`decimal` format check".

## JSON Schema

### `buildJsonSchema(annotatedType, opts?)`

Options (`TJsonSchemaOptions`): `annotations` (default `true`: `@meta.description` → `description`, `@meta.label` → `title`; a field's own description beside a `$ref` goes into `{ allOf: [{ $ref }], description }`, an inherited one stays on the `$defs` entry; an optional field keeps them beside its `anyOf: [T, null]`), `enums` (default `true`: a union of literals, also with `null` → `{ type, enum }`, e.g. `{ type: ['string','null'], enum: ['x','y',null] }`; a member with other keywords keeps `anyOf`), `closed` (default `false`: `additionalProperties: false` on every object — then the schema accepts exactly what the validator accepts with its default `unknownProps: 'error'`). `annotations: false, enums: false` = the output of 0.2.4 and earlier. `strict` (since 0.2.10, runtime only, not a plugin option): `OPENAI_STRICT` / `ANTHROPIC_STRICT` (from `@atscript/typescript/utils`) or a `TStrictProfile` `{ name, keywords (allow-list: keyword → true | (value) => boolean), requireAll, collapseAllOf, describeDropped, allowRecursion, objectRoot }`. Builds closed, drops keywords outside the allow-list and appends them to `description` in plain words (`"Minimum 0."`); `oneOf`+`discriminator` → `anyOf`; a `$ref` with a field's title/description → the `$defs` entry inlined with them. OpenAI: every property `required`, optional ones (incl. `@meta.required`) nullable → run `dropOptionalNulls(Type, output)` before validating; keeps patterns without lookaround/backreferences/modifier groups (first of several), numeric bounds, `minItems`/`maxItems`; recursion OK. Anthropic: optional stays optional; simple patterns only (also no `\b`, `\p{}`, `{n,m}` > 100; allOf of patterns kept); `minItems` 0/1 only; no numeric/length bounds, `maxItems`, `uniqueItems`; recursion throws. Both drop `minLength`/`maxLength`, `uniqueItems`, key counts. Throw: non-object root, records / pattern props (use an array of key/value objects), tuples, `unknown`, intersections. Always re-validate model output with the atscript validator (dropped constraints are not enforced). The generated `toJsonSchema()` uses the plugin option `ts({ jsonSchemaOptions })` (lazy, bundle and `@emit.jsonSchema` alike, identical to `buildJsonSchema(type, jsonSchemaOptions)`).

Runtime type → JSON Schema. Accepts exactly what the validator accepts with `unknownProps: 'ignore'`: optional props also accept `null` (`type: [T, 'null']` / `anyOf: [T, {type:'null'}]`, not with `@meta.required`), tuples get `minItems`/`maxItems`, `decimal` a pattern, `never` is `{ not: {} }`, `@meta.required` strings `pattern: '\\S'` (booleans `const: true`), `@expect.array.uniqueItems` → `uniqueItems: true`, pattern props → `patternProperties` (excluding declared names). Documented differences: uniqueness by `@expect.array.key` props (no `uniqueItems`), key order of unique object items, a key matching several pattern props (validator: any; schema: all). Named nested object types (with an `id`) are extracted into `$defs` + `$ref`; types without an `id` held in several places or recursive go to `$defs` too, one entry per distinct schema (a recursive merge used at several places: one entry). The root is **not** extracted — the returned object is the schema itself (e.g. `{ type: 'object', properties, $defs? }`). No `$schema` field. Discriminated unions detected when members share a literal-valued property.

```ts
import { buildJsonSchema } from '@atscript/typescript/utils'

const schema = buildJsonSchema(User)
// { type: 'object', properties: { … }, $defs?: { … } }
```

### `fromJsonSchema(schema)`

Reverse. For OpenAPI / JSON-Schema-first interop. `description` / `title` → `@meta.description` / `@meta.label`; `enum` → union of literals; `additionalProperties` ignored.

```ts
const annotatedType = fromJsonSchema(mySchema)
```

### `mergeJsonSchemas(types, opts?)`

`opts`: the `buildJsonSchema` options, for every schema. Combines types into `{ schemas: Record<id, schema>, $defs: Record<id, schema> }` — every type must have an `id`. Useful for a single OpenAPI doc covering many models. Equal definitions (references compared too) are shared; a different one asking for a taken name (two `Address` types from different files) becomes `Address_1`, references renamed.

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
  value: any
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

- `ctx` — `TValidatorPluginContext` with `ctx.error(message, path?, details?)`, `ctx.path`, `ctx.opts`, `ctx.validateAnnotatedType` (with `'strip'`, a call returning `false` strips nothing — trying alternatives `a || b` strips what the union `a | b` would), `ctx.root` (the type the validator was created for — same on every node, before `replace`; since 0.1.105), `ctx.context` (user-supplied via `validate(value, safe, context)`).
- `def` — current `TAtscriptAnnotatedType`.
- `value` — actual value at this location.

**Synchronous only** — no `Promise` support. Long-running checks (DB, HTTP) must happen outside `validate()`.

Inside plugins, rely on global `AtscriptMetadata` for typed `metadata.get(...)` — never cast to `any`. See [codegen.md](codegen.md#atscriptdts).

## See also

- [runtime.md](runtime.md) — the type tree.
- [annotations.md](annotations.md) — `@expect.*` constraints.
- [moost-validator.md](moost-validator.md) — Moost HTTP integration.

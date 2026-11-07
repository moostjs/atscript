# Annotations

First-class in `.as`. Attach metadata + validation to types, properties, primitives.

## Contents

- [Syntax](#syntax)
- [Built-in namespaces](#built-in-namespaces)
- [`@meta.*`](#meta) — id, label, description, documentation, sensitive, readonly, required, default, example
- [`@expect.*`](#expect) — min, max, int, pattern, minLength, maxLength, array.uniqueItems, array.key
- [`@normalize.*`](#normalize) — trim, lowercase, uppercase
- [`@emit.*`](#emit) — jsonSchema, compiledValidator
- [Merge](#merge) — replace (default) vs append
- [Pattern-property annotations](#pattern-property-annotations)
- [Custom annotations](#custom-annotations) — `AnnotationSpec` shape, inline registration
- [Typed metadata access](#typed-metadata-access) — `AtscriptMetadata` global

## Syntax

`@namespace.name arg1, arg2, …` on its **own line** above the target. Annotations CANNOT appear inline on the right-hand side of a `type` alias.

```atscript
@meta.label 'User'
@meta.description 'A registered user account'
export interface User {
  @meta.id
  @expect.pattern '^[A-Z0-9]{8}$'
  id: string

  @meta.label 'Full name'
  @expect.minLength 1
  @expect.maxLength 200
  name: string
}
```

- Arguments are **space-separated** (and comma-separated when more than one). NOT `@meta.label('User')`.
- Args are parsed literal tokens: `string` (quoted), `number`, `boolean` (`true` / `false`), `ref` (identifier), backticked `query` / `expr` / `order` (grammar picked by the spec's arg `type`). No regex literals outside backticks.
- Inside a `query` arg the comparison operators `=`, `!=`, `>`, `>=`, `<`, `<=` work at any nesting level, including inside parentheses (since 0.1.90): `` `A.at >= B.start and (B.end = null or A.at <= B.end)` ``.
- Omit args entirely for no-arg annotations: `@meta.id`, `@meta.sensitive`.

## Built-in namespaces

Core ships `@meta.*` (semantic metadata), `@expect.*` (validation constraints checked by `Validator`), `@normalize.*` (input normalizers applied before validation), and `@emit.*` (codegen flags). All other namespaces come from plugins.

## `@meta.*`

| Annotation                   | Args      | Effect                                                                                                                                 |
| ---------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `@meta.id`                   | _none_    | Primary-key member. Multiple `@meta.id` on different props = composite key. Never `@meta.id(...)`.                                     |
| `@meta.label 'text'`         | `string`  | Human label.                                                                                                                           |
| `@meta.description 'text'`   | `string`  | Description.                                                                                                                           |
| `@meta.documentation 'text'` | `string`  | Multi-line docs. `multiple: true` — repeat to accumulate.                                                                              |
| `@meta.sensitive`            | _none_    | Sensitive value (plugins mask/redact). Applies to `prop` / `type`.                                                                     |
| `@meta.readonly`             | _none_    | Read-only at API/DB layer (plugins decide). Applies to `prop` / `type`.                                                                |
| `@meta.required 'msg?'`      | `string?` | For `string`: rejects empty/whitespace-only. For `boolean`: requires `true`. Optional error message. `defType: ['string', 'boolean']`. |
| `@meta.default 'value'`      | `string`  | Default. Strings as-is; other types parsed as JSON. Applies to `prop` / `type`.                                                        |
| `@meta.example 'value'`      | `string`  | Example for docs/Swagger/UI. Strings as-is; others parsed as JSON. Applies to `prop` / `type`.                                         |

`@meta.required` and `null` (since 0.1.103): optional field (`name?: string`) → omission OK, `null` rejected with the `@meta.required` message; nullable field (`name: string | null`) → `null` OK, a string must be non-empty. Since 0.2.10 the message (and code `REQUIRED` / `REQUIRED_CHECKED`) also covers a missing value on a non-optional field, and `null` where the type rejects it — instead of `TYPE` / `UNION`.

Composite key:

```atscript
export interface MembershipRow {
  @meta.id
  tenantId: string

  @meta.id
  userId: string

  role: 'admin' | 'editor' | 'viewer'
}
```

## `@expect.*`

Validation, translated to JSON Schema. Every `@expect.*` takes an **optional error message** as its last argument.

| Annotation                                | Args                           | Target                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@expect.min n, 'msg?'`                   | `number`, `string?`            | `number` only (`defType: ['number']`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `@expect.max n, 'msg?'`                   | `number`, `string?`            | `number` only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `@expect.exclusiveMin n, 'msg?'`          | `number`, `string?`            | `number` only. Strict: `value > n` (since 0.1.109). JSON Schema `exclusiveMinimum`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `@expect.exclusiveMax n, 'msg?'`          | `number`, `string?`            | `number` only. Strict: `value < n` (since 0.1.109). JSON Schema `exclusiveMaximum`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `@expect.int 'msg?'`                      | `string?`                      | `number` (prefer `number.int`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `@expect.pattern 'pat', 'flags?', 'msg?'` | `string`, `string?`, `string?` | `string`. Pattern is a **string** (not a regex literal). `flags` from a fixed allow-list (`'g'`, `'i'`, `'u'`, combos, or `''` so a message can follow: `@expect.pattern '^x', '', 'msg'`). Validation is stateless: `g` is ignored, `y` anchors at the start of the value (like `^`); both warn. The pattern is compiled with its flags at build time (`"a{", "u"` is an error). JSON Schema `pattern` (no flags): `i` → case-variant classes (`[aA]`; with `u` also `ſ`/`K`), `s` → `.` as `[\s\S]`, `m` → `(?m:…)`, `y` → `^(?:…)`; `i` with a backreference / `\p{}` / (`u`) `\b` `\B` or `\W` in a class / a >1024-char non-ASCII range → also `(?i:…)` (ES2025 modifier groups). Write `u` on patterns meant for JSON Schema (ajv compiles with `u`). `multiple: true`, `mergeStrategy: 'append'`. |
| `@expect.minLength n, 'msg?'`             | `number`, `string?`            | `string`, arrays (`defType: ['array', 'string']`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `@expect.maxLength n, 'msg?'`             | `number`, `string?`            | `string`, arrays                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `@expect.minKeys n, 'msg?'`               | `number`, `string?`            | objects / records (`defType: ['object']`): at least `n` kept keys (see [validation.md](validation.md#error-codes--translation) rule 7). JSON Schema `minProperties`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `@expect.maxKeys n, 'msg?'`               | `number`, `string?`            | objects / records: at most `n` kept keys. JSON Schema `maxProperties`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `@expect.message 'msg'`                   | `string`                       | prop / type: message for a **type mismatch** (wrong type, not the literal, no union branch, unknown discriminator, wrong tuple length). Constraint failures keep their own messages. Error keeps `code` + `params`, `custom: true`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `@expect.array.uniqueItems 'msg?'`        | `string?`                      | array props — distinct items (or, with `@expect.array.key`, key-based)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `@expect.array.key 'msg?'`                | `string?`                      | Identity key inside array element type. Target: `string`/`number`, non-optional. Pair with `uniqueItems` for key-based uniqueness.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

`@expect.min` / `@expect.max` / `@expect.exclusiveMin` / `@expect.exclusiveMax` apply to `number` only — NOT `decimal`. `min`/`max` are inclusive (`number.positive` / `negative`: see [primitives.md](primitives.md)).

Nullable targets (since 0.1.103): every `defType`-guarded annotation (all `@expect.*` above + `@meta.required`) and `uniqueItems` also accept a union of the target with `null` / `undefined` — `number | null`, `string[] | null`, `number.int | null`, alias `type N = number | null`. `null` passes; other values are checked. Mixed unions (`number | string`) still error: `Expected type is (number), got union (number | string)`. Custom plugin hooks: `nonNullishMembers(def, doc)` from `@atscript/core` (see [plugin-development.md](plugin-development.md#type-guards)).

Key + uniqueItems:

```atscript
export interface CartItem {
  @expect.array.key
  sku: string

  qty: number.int.positive
}

export interface Cart {
  @expect.array.uniqueItems
  items: CartItem[]      // uniqueness by sku
}
```

## `@normalize.*`

Flag annotations (no args) on a `string` host: a prop, a type alias (its fields, array items and `T.field` refs inherit it), a nullable or literal union (`string | null`, `'a' | 'b'`). Non-string host → `Expected type is (string), …` error. `prop` / `type` only (not an interface).

| Annotation             | Effect                                                               |
| ---------------------- | -------------------------------------------------------------------- |
| `@normalize.trim`      | Strip leading/trailing whitespace. Also `string.trimmed`.            |
| `@normalize.lowercase` | `toLowerCase()`.                                                     |
| `@normalize.uppercase` | `toUpperCase()`. Beside `lowercase` → warning (uppercase runs last). |

Order: trim → lowercase → uppercase. `Validator` NEVER applies them (interpreted and compiled alike): call `normalizeForType(type, value)` before `validate()` ([validation.md](validation.md#normalizefortype--input-normalizers)); `validatorPipe` of `@atscript/moost-validator` does it for you.

```atscript
@normalize.trim
@normalize.lowercase
export type Email = string.email   // every `email: Email` field / `Email[]` item is normalized

interface Signup {
  @normalize.lowercase
  plan: 'free' | 'pro'             // 'PRO' → 'pro', then matches the literal
}
```

## `@emit.*`

| Annotation                | Args   | Effect                                                                                                                                                                           |
| ------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@emit.jsonSchema`        | _none_ | Pre-compute and embed JSON Schema at build time for this interface/type/annotate, regardless of the global `jsonSchema` plugin option.                                           |
| `@emit.compiledValidator` | _none_ | Emit a build-time compiled validator check for this interface/type/annotate even with `compileValidators` off. Rules: [validation.md](validation.md#compiled-validators-opt-in). |

`@annotate.reset 'name'` (only inside `annotate` blocks): removes annotation `name` from the entry's node (or, at the block's top, the type), including inherited and appended values; the block's own value applies over it. Rules: [as-syntax.md](as-syntax.md) A10.

## Merge

Property types resolve through aliases; annotations merge along the chain. Default = `replace` (child overrides parent same-name). Specs can opt into `mergeStrategy: 'append'` for repeatable annotations (e.g. `@expect.pattern`).

Ref-boundary rules (field referencing another declaration's field, e.g. `ownerId: User.id`, any depth):

1. Precedence is nearest-first: local declaration > nearest ref > deeper refs > resolved type.
2. Specs with `passedWhenReferred: false` never cross a reference — the referring node does not read them. Built-ins flagged: `@meta.id`, `@meta.required`, `@meta.default`, `@meta.readonly` (a field referencing a PK is not a PK; requiredness/defaults/mutability belong to the referring declaration).
   Exception: a primitive's own annotations (`string.required` → `@meta.required`, `number.timestamp.created` → `@db.default.now`, `number.timestamp.updated` → `@db.default.now` + `@db.onUpdate.now` since 0.1.106) apply to every field typed with the primitive, directly or via a type alias; only a field ref (`createdAt: Order.createdAt`) drops the `false` ones. Since 0.1.104 (0.1.79–0.1.103 dropped them except on union members / array elements).
3. The flag filters REFERENCE layers only: prop types (`owner: User`), chain refs, intersection operands' type level (`type RW = RO & W`), annotated aliases (`@db.alias 'x' type P = T` does not inherit `@db.table`). Kept: bare alias (`type P = T` IS `T`), `annotate T as X` copy, inherited props / props of a merge (they are or read through the members' props). It comes from the SPEC (core + plugins), so raw `metadata.set` writes of such a key do not pass a reference either.
4. Since 0.1.100, `ref` arguments (and `Type.field` query refs) inside an inherited annotation are bound in the inheriting file's generated JS: the missing import is synthesized (aliased `Name_1` on clash), so `target: () => Dict` never throws `ReferenceError`.

```atscript
type Email = string.email

export interface Contact {
  @expect.maxLength 254     // adds to Email's expect set
  primary: Email

  @expect.pattern '^corp-' // appended to Email's pattern (pattern uses 'append')
  workInternal: Email
}
```

## Pattern-property annotations

Apply to every matched value:

```atscript
export interface I18n {
  @expect.minLength 1
  [/^[a-z]{2}$/]: string
}
```

## Custom annotations

Plugins register `AnnotationSpec` via `config()`. See [plugin-development.md](plugin-development.md).

`AnnotationSpec` fields:

- `argument` — `TAnnotationArgument` or array. Each: `{ name, type, optional?, description?, values?, fieldScope?, refFilter?, valueScope?, userText? }` where `type ∈ 'string' | 'number' | 'boolean' | 'value' | 'ref' | 'query' | 'expr' | 'order'`. Omit for no-arg annotations. Backtick arg types → [table below](#backtick-argument-types).
  - `'value'`: a string, number or boolean literal, stored as written (`@x.default 0` → `0`, `true` → `true`, `'a'` → `'a'`). A number / boolean must fit the annotated field's type (number field / boolean field; a union: one member; a scalar merge `number & number.int`: every member; `unknown`: any) — else a compile error; a number on a `decimal` field is stored as its string (`12.50` → `'12.50'`); a string fits any field (JSON by convention on non-string fields). Readers get `string | number | boolean`.
  - `userText: true` (on a `'string'` arg): user-facing text (labels, hints, messages). `userText: 'expression'`: the arg is function source the client evaluates (computed label, custom validator); its string literals are the texts — see [i18n.md](i18n.md). `userTextAnnotations(tree)` (`@atscript/core`) lists flagged annotations (`true` = the value is the text; `'expression'` = the value is function source; `string[]` = those fields of the value object, an expression field as `'name()'`). At runtime: `userTextOf(key)` / `userTextKeys()` from `@atscript/typescript/utils` — core keys known from the start; a plugin's registered by each generated module that writes them; a plugin writing such metadata at runtime calls `registerUserText(key, fields?)` (`fields`: `true` default, `'expression'`, or a field list). Core flags `meta.label`, `meta.description`, `meta.required` (message), `expect.message`, every `expect.*` `message`.
- `nodeType` — `TNodeEntity[]` (e.g. `['prop', 'interface', 'type', 'primitive']`). Validated at parse time.
- `defType` — restrict to specific primitive bases / kinds (e.g. `['string']`, `['number']`, `['array', 'string']`). On a top-level annotation of an `annotate` block it checks the type the block's target resolves to (through aliases), like the annotation written on the target.
- `multiple` — repeatable on same node.
- `mergeStrategy` — `'replace'` (default) or `'append'`.
- `passedWhenReferred` — default `true`; set `false` for declaring-scope annotations (indexes, storage, keys) that must not be inherited by fields referencing the annotated node (see [Merge](#merge)).
- `description` — VSCode hover text.
- `validate(mainToken, args, doc)` / `modify(mainToken, args, doc)` — post-parse hooks.

Editor (LSP) hooks on a `TAnnotationArgument` — drive VSCode completion/hover/go-to-definition/references inside the argument; no validation (keep that in `validate`):

| Hook                        | For `type`                     | Return                                               | Effect                                                                                                                                     |
| --------------------------- | ------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `fieldScope(argToken, doc)` | `'query'`, `'expr'`, `'order'` | `{ allowedTypes, unqualifiedTarget }` or `undefined` | Types a `Type.field` may name + the type a bare `field` resolves against                                                                   |
| `fieldScope(argToken, doc)` | `'string'`                     | `{ allowedTypes, unqualifiedTarget }` or `undefined` | String is a (dotted, unqualified) field path of `unqualifiedTarget` → field completion per level, hover, F12, find-refs/rename per segment |
| `valueScope(annTok, doc)`   | `'string'`, `'number'`         | `TValueCandidate[]`                                  |
| `refFilter(decl, doc)`      | `'ref'`                        | `boolean`                                            | Filters type-name completion candidates                                                                                                    |

1. `argToken.parentNode` = annotated node; read sibling annotations from `argToken.parentNode.annotations` to derive the scope.
2. `refFilter`'s `doc` is the document that **declares** `decl` (not the one being edited).
3. A `fieldScope` answer is final — `undefined` means "no scope", no fallback. For `string` args `allowedTypes` is ignored (pass `[]`).
4. Sibling scoping (since 0.1.100): derive the scope from an earlier argument with `argToken.parentNode.annotations.find(a => a.args.includes(argToken))` → `args[0].text`; return `undefined` if missing/not an identifier. Works in `annotate` block entries too. F12 on a `ref` argument jumps to the type (also across imports).
5. Other spec hooks: `valueScope(annotationToken, doc)` (`'string'`/`'number'` args) returns `TValueCandidate[]` (`{ value, definition?, documentation? }`) — the closed set of values declared elsewhere (e.g. the literals of the annotated union); drives completion and F12 on the argument, advisory only (no validation). `definition` is `{ doc, token }` in the declaring document.
6. Inside `validate` hooks use `doc.annotatedDefinition(node)` (from `AtscriptDoc`) — not `node.getDefinition()` — to get `{ def, doc }` of the annotated field: it resolves annotate-block entries (incl. nested `addr.status`) to the target property's type and returns the declaring doc, which may be another file. `undefined` if unresolved.
7. Built-in `@db.view.filter` / `@db.view.joins` / `@db.rel.filter` scopes in core are a deprecated fallback used only when `fieldScope` is absent (removal: next minor).
8. Types: `import type { TAnnotationArgument, TQueryScope } from '@atscript/core'`.

Full example → [atscript.dev plugin-development/annotation-system](https://atscript.dev/plugin-development/annotation-system#editor-support-for-arguments).

### Backtick argument types

Since 0.1.99. A backtick arg parses by its spec `type`; spec-less positions (unknown annotation, extra arg) keep the `query` grammar.

Unknown annotation (`unknownAnnotation: 'allow' | 'warn'`, no spec): runtime value = first arg as written — string / number / `true` / `false` / `null` / `undefined`; any other name (`User`, `User.email`) or backtick arg → the string of its source; empty arg (`@x , 'y'`) → `undefined`. Repeated on a node (or several args) → a list of first args — the same in an interface inheriting the prop, whichever file declares it. Shape is decided where written: an `annotate` entry (mutating or `as`) overriding it → the entry's occurrences (once → single value, repeated → list), whatever the target wrote — same as a hand-written copy and everything built from the alias. Need the type itself → declare a spec with a `ref` arg.

| `type`    | Grammar                                                                                         | Example                                    | Runtime value (type from `@atscript/typescript/utils`)                                             |
| --------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `'query'` | predicate: comparisons, `and` / `or` / `not`, `in`, `matches`, `exists`                         | `` `status = 'open'` ``                    | `AtscriptQueryNode`                                                                                |
| `'expr'`  | `+ - * /`, unary `-`, `( )`, numbers, `coalesce(a, b, …)` (≥ 2 args), field refs — nothing else | `` `openCount * 10 + coalesce(rank, 0)` `` | `AtscriptExprNode`: number \| `{ field, type? }` \| `{ op, args }` (`op` ∈ `+ - * / neg coalesce`) |
| `'order'` | `key (asc \| desc)?, …`                                                                         | `` `raisedAt desc, id` ``                  | `AtscriptOrderItem[]`: `[{ ref: { field, type? }, desc?: true }]`                                  |

1. Core reports syntax errors only; field existence/types are the plugin's `validate` job (walk `argToken.exprNode.fieldRefs()` / `argToken.orderNode.fieldRefs()`).
2. `a -5` / `a+1` parse as binary `a - 5` / `a + 1`; a standalone `-5` is a negative literal.
3. `/` is division inside backticks; a regexp literal lexes only after `matches` (space optional: `matches/re/` ok) — `field = /x/` is no longer a regexp (0.1.99 change).
4. `expr` number literals: finite, no underflow to `0` (`1e-400`), `|n| <= 2^53 - 1` — else a core error.
5. `fieldScope` gives expr leaves and order keys the same completion / hover / F12 / references / rename as query refs.

Inline registration in `atscript.config.js`:

```js
import { defineConfig, AnnotationSpec } from '@atscript/core'
import ts from '@atscript/typescript'

export default defineConfig({
  plugins: [ts()],
  annotations: {
    ui: {
      widget: new AnnotationSpec({
        argument: {
          name: 'kind',
          type: 'string',
          values: ['text', 'select', 'checkbox'],
        },
        nodeType: ['prop', 'type'],
        description: 'UI widget hint consumed by the form generator.',
      }),
      hidden: new AnnotationSpec({
        nodeType: ['prop'],
        description: 'Hide from auto-generated forms.',
      }),
    },
  },
})
```

Use:

```atscript
@ui.widget 'select'
role: 'admin' | 'editor'
```

## Typed metadata access

After `asc -f dts`, global `AtscriptMetadata` in `atscript.d.ts` declares precise return types:

```ts
const label = User.metadata.get('meta.label') // string | undefined
const ids = User.metadata.get('meta.id') // correct shape
```

Never cast to `any`. Stale `atscript.d.ts` → `npx asc -f dts`. See [codegen.md](codegen.md#atscriptdts).

# Annotations

First-class in `.as`. Attach metadata + validation to types, properties, primitives.

## Contents

- [Syntax](#syntax)
- [Built-in namespaces](#built-in-namespaces)
- [`@meta.*`](#meta) — id, label, description, documentation, sensitive, readonly, required, default, example
- [`@expect.*`](#expect) — min, max, int, pattern, minLength, maxLength, array.uniqueItems, array.key
- [`@emit.*`](#emit) — jsonSchema
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

Core ships `@meta.*` (semantic metadata), `@expect.*` (validation constraints checked by `Validator`), and `@emit.*` (codegen flags). All other namespaces come from plugins.

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

`@meta.required` and `null` (since 0.1.103): optional field (`name?: string`) → omission OK, `null` rejected with the `@meta.required` message; nullable field (`name: string | null`) → `null` OK, a string must be non-empty.

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

| Annotation                                | Args                           | Target                                                                                                                                                               |
| ----------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@expect.min n, 'msg?'`                   | `number`, `string?`            | `number` only (`defType: ['number']`)                                                                                                                                |
| `@expect.max n, 'msg?'`                   | `number`, `string?`            | `number` only                                                                                                                                                        |
| `@expect.int`                             | _none_                         | `number` (prefer `number.int`)                                                                                                                                       |
| `@expect.pattern 'pat', 'flags?', 'msg?'` | `string`, `string?`, `string?` | `string`. Pattern is a **string** (not a regex literal). `flags` from a fixed allow-list (`'g'`, `'i'`, `'u'`, combos). `multiple: true`, `mergeStrategy: 'append'`. |
| `@expect.minLength n, 'msg?'`             | `number`, `string?`            | `string`, arrays (`defType: ['array', 'string']`)                                                                                                                    |
| `@expect.maxLength n, 'msg?'`             | `number`, `string?`            | `string`, arrays                                                                                                                                                     |
| `@expect.array.uniqueItems 'msg?'`        | `string?`                      | array props — distinct items (or, with `@expect.array.key`, key-based)                                                                                               |
| `@expect.array.key 'msg?'`                | `string?`                      | Identity key inside array element type. Target: `string`/`number`, non-optional. Pair with `uniqueItems` for key-based uniqueness.                                   |

`@expect.min` / `@expect.max` apply to `number` only — NOT `decimal`.

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

## `@emit.*`

| Annotation         | Args   | Effect                                                                                                                                 |
| ------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `@emit.jsonSchema` | _none_ | Pre-compute and embed JSON Schema at build time for this interface/type/annotate, regardless of the global `jsonSchema` plugin option. |

## Merge

Property types resolve through aliases; annotations merge along the chain. Default = `replace` (child overrides parent same-name). Specs can opt into `mergeStrategy: 'append'` for repeatable annotations (e.g. `@expect.pattern`).

Ref-boundary rules (field referencing another declaration's field, e.g. `ownerId: User.id`, any depth):

1. Precedence is nearest-first: local declaration > nearest ref > deeper refs > resolved type.
2. Specs with `passedWhenReferred: false` never cross a ref — the referring field does not inherit them. Built-ins flagged: `@meta.id`, `@meta.required`, `@meta.default`, `@meta.readonly` (a field referencing a PK is not a PK; requiredness/defaults/mutability belong to the referring declaration).
   Exception: a primitive's own annotations (`string.required` → `@meta.required`, `number.timestamp.created` → `@db.default.now`) apply to every field typed with the primitive, directly or via a type alias; only a field ref (`createdAt: Order.createdAt`) drops the `false` ones. Since 0.1.104 (0.1.79–0.1.103 dropped them except on union members / array elements).
3. `extends`/intersection always inherit the full set — the flag applies only to refs.
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

- `argument` — `TAnnotationArgument` or array. Each: `{ name, type, optional?, description?, values?, fieldScope?, refFilter? }` where `type ∈ 'string' | 'number' | 'boolean' | 'ref' | 'query' | 'expr' | 'order'`. Omit for no-arg annotations. Backtick arg types → [table below](#backtick-argument-types).
- `nodeType` — `TNodeEntity[]` (e.g. `['prop', 'interface', 'type', 'primitive']`). Validated at parse time.
- `defType` — restrict to specific primitive bases / kinds (e.g. `['string']`, `['number']`, `['array', 'string']`).
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

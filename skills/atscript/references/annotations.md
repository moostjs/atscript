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
- Args are parsed literal tokens: `string` (quoted), `number`, `boolean` (`true` / `false`), `ref` (identifier), `query` (backticked). No regex literals, no expressions.
- Omit args entirely for no-arg annotations: `@meta.id`, `@meta.sensitive`.

## Built-in namespaces

Core ships `@meta.*` (semantic metadata), `@expect.*` (validation constraints checked by `Validator`), and `@emit.*` (codegen flags). All other namespaces come from plugins.

## `@meta.*`

| Annotation                | Args            | Effect                                                                                              |
| ------------------------- | --------------- | --------------------------------------------------------------------------------------------------- |
| `@meta.id`                | _none_          | Primary-key member. Multiple `@meta.id` on different props = composite key. Never `@meta.id(...)`.  |
| `@meta.label 'text'`      | `string`        | Human label.                                                                                        |
| `@meta.description 'text'` | `string`       | Description.                                                                                        |
| `@meta.documentation 'text'` | `string`     | Multi-line docs. `multiple: true` — repeat to accumulate.                                           |
| `@meta.sensitive`         | _none_          | Sensitive value (plugins mask/redact). Applies to `prop` / `type`.                                  |
| `@meta.readonly`          | _none_          | Read-only at API/DB layer (plugins decide). Applies to `prop` / `type`.                             |
| `@meta.required 'msg?'`   | `string?`       | For `string`: rejects empty/whitespace-only. For `boolean`: requires `true`. Optional error message. `defType: ['string', 'boolean']`. |
| `@meta.default 'value'`   | `string`        | Default. Strings as-is; other types parsed as JSON. Applies to `prop` / `type`.                     |
| `@meta.example 'value'`   | `string`        | Example for docs/Swagger/UI. Strings as-is; others parsed as JSON. Applies to `prop` / `type`.      |

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

| Annotation                          | Args                              | Target                                                                   |
| ----------------------------------- | --------------------------------- | ------------------------------------------------------------------------ |
| `@expect.min n, 'msg?'`             | `number`, `string?`               | `number` only (`defType: ['number']`)                                    |
| `@expect.max n, 'msg?'`             | `number`, `string?`               | `number` only                                                            |
| `@expect.int`                       | _none_                            | `number` (prefer `number.int`)                                           |
| `@expect.pattern 'pat', 'flags?', 'msg?'` | `string`, `string?`, `string?` | `string`. Pattern is a **string** (not a regex literal). `flags` from a fixed allow-list (`'g'`, `'i'`, `'u'`, combos). `multiple: true`, `mergeStrategy: 'append'`. |
| `@expect.minLength n, 'msg?'`       | `number`, `string?`               | `string`, arrays (`defType: ['array', 'string']`)                        |
| `@expect.maxLength n, 'msg?'`       | `number`, `string?`               | `string`, arrays                                                         |
| `@expect.array.uniqueItems 'msg?'`  | `string?`                         | array props — distinct items (or, with `@expect.array.key`, key-based)   |
| `@expect.array.key 'msg?'`          | `string?`                         | Identity key inside array element type. Target: `string`/`number`, non-optional. Pair with `uniqueItems` for key-based uniqueness. |

`@expect.min` / `@expect.max` apply to `number` only — NOT `decimal`.

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

| Annotation         | Args   | Effect                                                                              |
| ------------------ | ------ | ----------------------------------------------------------------------------------- |
| `@emit.jsonSchema` | _none_ | Pre-compute and embed JSON Schema at build time for this interface/type/annotate, regardless of the global `jsonSchema` plugin option. |

## Merge

Property types resolve through aliases; annotations merge along the chain. Default = `replace` (child overrides parent same-name). Specs can opt into `mergeStrategy: 'append'` for repeatable annotations (e.g. `@expect.pattern`).

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

- `argument` — `TAnnotationArgument` or array. Each: `{ name, type, optional?, description?, values? }` where `type ∈ 'string' | 'number' | 'boolean' | 'ref' | 'query'`. Omit for no-arg annotations.
- `nodeType` — `TNodeEntity[]` (e.g. `['prop', 'interface', 'type', 'primitive']`). Validated at parse time.
- `defType` — restrict to specific primitive bases / kinds (e.g. `['string']`, `['number']`, `['array', 'string']`).
- `multiple` — repeatable on same node.
- `mergeStrategy` — `'replace'` (default) or `'append'`.
- `description` — VSCode hover text.
- `validate(mainToken, args, doc)` / `modify(mainToken, args, doc)` — post-parse hooks.

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
const label = User.metadata.get('meta.label')  // string | undefined
const ids = User.metadata.get('meta.id')       // correct shape
```

Never cast to `any`. Stale `atscript.d.ts` → `npx asc -f dts`. See [codegen.md](codegen.md#atscriptdts).

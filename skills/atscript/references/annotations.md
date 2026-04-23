# Annotations

First-class in `.as`. Attach metadata + validation to types, properties, primitives.

## Contents

- [Syntax](#syntax)
- [Built-in namespaces](#built-in-namespaces)
- [`@meta.*`](#meta) — id, label, description, documentation, sensitive, readonly, required, default, example
- [`@expect.*`](#expect) — min, max, int, pattern, minLength, maxLength, array.uniqueItems, array.key
- [Merge](#merge) — replace (default) vs append
- [Pattern-property annotations](#pattern-property-annotations)
- [Custom annotations](#custom-annotations) — `AnnotationSpec` shape, inline registration
- [Typed metadata access](#typed-metadata-access) — `AtscriptMetadata` global

## Syntax

`@namespace.name(args)` above the target.

```atscript
@meta.label('User')
@meta.description('A registered user account')
export interface User {
  @meta.id
  @expect.pattern(/^[A-Z0-9]{8}$/)
  id: string

  @meta.label('Full name')
  @expect.minLength(1)
  @expect.maxLength(200)
  name: string
}
```

- Stack freely; order of unrelated annotations irrelevant.
- Args are parsed literals: strings, numbers, booleans, regex, arrays, inline objects. No expressions.
- Omit parens only when the spec has no argument.

## Built-in namespaces

Core ships **only** `@meta.*` (semantic metadata) and `@expect.*` (validation constraints checked by `Validator`). All other namespaces come from plugins.

## `@meta.*`

| Annotation                  | Args       | Effect                                                                                                |
| --------------------------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| `@meta.id`                  | _none_     | Primary-key member. Multiple `@meta.id` on different props = composite key. Never `@meta.id(...)`.    |
| `@meta.label(text)`         | `string`   | Human label.                                                                                          |
| `@meta.description(text)`   | `string`   | Description. Propagates to JSON Schema `description`.                                                 |
| `@meta.documentation(text)` | `string`   | Multi-line docs. `multiple: true` — repeat to accumulate.                                             |
| `@meta.sensitive`           | _none_     | Sensitive value (plugins mask/redact).                                                                |
| `@meta.readonly`            | _none_     | Read-only at API/DB layer (plugins decide).                                                           |
| `@meta.required(msg?)`      | `string?`  | For `string`: rejects empty/whitespace-only. For `boolean`: requires `true`. Optional error message.  |
| `@meta.default(value)`      | literal    | Default. Strings as-is; other types parsed as JSON.                                                   |
| `@meta.example(value)`      | literal    | Example for docs/Swagger/UI. Strings as-is; others parsed as JSON.                                    |

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

| Annotation                   | Args                  | Target                                                                   |
| ---------------------------- | --------------------- | ------------------------------------------------------------------------ |
| `@expect.min(n, msg?)`       | `number`, `string?`   | `number`, `decimal`                                                      |
| `@expect.max(n, msg?)`       | `number`, `string?`   | `number`, `decimal`                                                      |
| `@expect.int(msg?)`          | `string?`             | `number` (prefer `number.int`)                                           |
| `@expect.pattern(re, msg?)`  | `RegExp`, `string?`   | `string`                                                                 |
| `@expect.minLength(n, msg?)` | `number`, `string?`   | `string`, arrays                                                         |
| `@expect.maxLength(n, msg?)` | `number`, `string?`   | `string`, arrays                                                         |
| `@expect.array.uniqueItems`  | `string?`             | arrays — distinct items (or, with `@expect.array.key`, key-based)        |
| `@expect.array.key`          | `string?`             | Identity key inside array element type. Target: `string`/`number`, non-optional. Pair with `uniqueItems` for key-based uniqueness. |

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

## Merge

Property types resolve through aliases; annotations merge along the chain. Default = `replace` (child overrides parent same-name). Specs can opt into `append` for array-valued metadata.

```atscript
type Email = @expect.pattern(/^.+@.+$/) string.email

export interface Contact {
  @expect.maxLength(254)     // adds to Email's expect set
  primary: Email

  @expect.pattern(/^corp-/)  // replaces Email's pattern for this prop
  workInternal: Email
}
```

## Pattern-property annotations

Apply to every matched value:

```atscript
export interface I18n {
  @expect.minLength(1)
  [/^[a-z]{2}$/]: string
}
```

## Custom annotations

Plugins register `AnnotationSpec` via `config()`. See [plugin-development.md](plugin-development.md).

`AnnotationSpec` fields:

- `argument` — `TAnnotationArgument` or array. Each: `{ name, type, optional?, description?, values? }` where `type ∈ 'string' | 'number' | 'boolean' | 'ref' | 'query'`. Regex literals accepted for `'string'` (see `@expect.pattern`). Omit for no-arg annotations.
- `nodeType` — `'prop' | 'interface' | 'type' | 'primitive' | …`. Validated at parse time.
- `defType` — restrict to specific primitive bases (e.g. only `string`).
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

## Typed metadata access

After `asc -f dts`, global `AtscriptMetadata` in `atscript.d.ts` declares precise return types:

```ts
const label = User.metadata.get('meta.label')  // string | undefined
const ids = User.metadata.get('meta.id')       // correct shape
```

Never cast to `any`. Stale `atscript.d.ts` → `npx asc -f dts`. See [codegen.md](codegen.md#atscriptdts).

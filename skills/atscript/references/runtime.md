# Runtime

What the generated `.as.js` exports at runtime, and how consumers use it.

All APIs live in `@atscript/typescript/utils`. The main entry `@atscript/typescript` exports only the build-time `tsPlugin`.

## Contents

- [`TAtscriptAnnotatedType`](#tatscriptannotatedtype) — core shape
- [Runtime vs serialized form](#runtime-vs-serialized-form)
- [`defineAnnotatedType`](#defineannotatedtype) — builder used by generated code
- [`TAtscriptDataType<T>`](#tatscriptdatatype-t) — extract TS data shape
- [`forAnnotatedType`](#foranotatedtype) — kind-dispatched walker
- [`serializeAnnotatedType` / `deserializeAnnotatedType`](#serializeannotatedtype--deserializeannotatedtype) — JSON round-trip, `SERIALIZE_VERSION`, `refDepth` shallow FK targets, annotation filtering
- [`createDataFromAnnotatedType`](#createdatafromannotatedtype) — build empty/default/example data objects from a type
- [Metadata access](#metadata-access) — typed `metadata.get(...)` via `AtscriptMetadata`
- [What `.as.js` exports](#what-asjs-exports)

## `TAtscriptAnnotatedType`

Every generated `.as` export conforms to this shape (type importable from `@atscript/typescript/utils`):

| Field                                 | Use                                                                                                                                                 |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `__is_atscript_annotated_type: true` | Brand — what `isAnnotatedType()` checks                                                                                                              |
| `type`                                | Type tree node — dispatch on `type.kind` (see below)                                                                                                 |
| `metadata`                            | Typed `Map` — `metadata.get('meta.label')` returns the type declared in global `AtscriptMetadata` (see [codegen.md](codegen.md))                     |
| `id?`                                 | Stable type name; used by `buildJsonSchema()` for `$defs`/`$ref`                                                                                     |
| `optional?`                           | Set when the node is an optional object prop                                                                                                         |
| `ref?`                                | Present only when authored as a reference to another type: `{ type, field }` — `type` is a **lazy function** resolving the target; `field` is a dot-joined chain into it |
| `validator(opts?)`                    | Constructs `new Validator(this, opts)`. **Not cached.**                                                                                              |

- `type.kind` is one of `'' | 'object' | 'array' | 'union' | 'intersection' | 'tuple'`. There is **no `'ref'` kind at runtime** — refs are carried via the sibling `ref?` field. `'$ref'` only appears in the *serialized* form.
- `'' (final)` — primitive/literal node. Has `designType`, optional `value`, `tags`.
- `'object'` — has `props: Map<string, TAtscriptAnnotatedType>`, `propsPatterns`, `tags`.
- `'array'` — has `of: TAtscriptAnnotatedType`, `tags`.
- `'union' | 'intersection' | 'tuple'` — has `items: TAtscriptAnnotatedType[]`, `tags`.

## Runtime vs serialized form

| Concept            | Runtime                                                   | Serialized                                                     |
| ------------------ | --------------------------------------------------------- | -------------------------------------------------------------- |
| Ref to another type | `ref: { type: () => Target; field: '…' }`                 | `type: { kind: '$ref', id: 'Target' }` (also `ref` shallow target form when `refDepth` ends in `.5`) |
| Primitive node     | `type.kind = ''`                                          | `type.kind = ''`                                               |
| Object node        | `type.kind = 'object'`, `props: Map`                      | `type.kind = 'object'`, `props: Record`                        |

## `defineAnnotatedType`

Builder used by generated code. Returns a handle (not the annotated type directly) — read `.\$type`:

```ts
import { defineAnnotatedType as $ } from '@atscript/typescript/utils'

const _User = $('object', class User {})
  .id('User')
  .prop('id', $().designType('string').annotate('meta.id', true).$type)
  .prop('name', $().designType('string').annotate('meta.label', 'Full name').$type)
  .annotate('meta.interface', 'user.User')

export const User = _User.$type
```

Subtleties:

- `$('object', Class)` **resets** the node. Never reuse a handle across declarations.
- Metadata propagation is lazy; inspecting `metadata.get(...)` before the tree is fully built may miss later entries.

Prefer `.as` fixtures compiled via `prepareFixtures()` over hand-written `$()` chains in tests — hand-written builders are fragile. It recompiles `.as.js` + `.as.d.ts` next to the source on every run but **writes only files whose content changed** (up-to-date artifacts keep their mtime — no watch-mode churn, no cache busting). Gitignore `*.as.js` / `*.as.d.ts` and let it regenerate.

## `TAtscriptDataType<T>`

Extracts TS data shape from a generated type:

```ts
import type { TAtscriptDataType } from '@atscript/typescript/utils'
import { User } from './user.as'

type UserData = TAtscriptDataType<typeof User>
// ⇒ { id: string; name: string; … }
```

## `forAnnotatedType`

Kind-dispatched walker. Each handler receives the full `TAtscriptAnnotatedType` node — access the structural body via `node.type`.

```ts
import { forAnnotatedType } from '@atscript/typescript/utils'

forAnnotatedType(User, {
  object(node) { for (const [name, child] of node.type.props) { /* … */ } },
  array(node)  { /* node.type.of */ },
  union(node)  { /* node.type.items */ },
  intersection(node) { /* node.type.items */ },
  tuple(node)  { /* node.type.items */ },
  final(node)  { /* primitive — node.type.designType, node.type.value, node.type.tags */ },
  phantom(node) { /* optional — diverts phantoms away from final */ },
})
```

Use for custom traversals (serializers, schema exporters, form generators). Don't reimplement kind-dispatch manually.

## `serializeAnnotatedType` / `deserializeAnnotatedType`

Round-trip a runtime type tree as JSON. Ship types to the browser without codegen, cache compiled metadata, share cross-process.

```ts
import {
  serializeAnnotatedType,
  deserializeAnnotatedType,
  SERIALIZE_VERSION,
} from '@atscript/typescript/utils'

const json = serializeAnnotatedType(User)
// json.$v === SERIALIZE_VERSION
const restored = deserializeAnnotatedType(json)
```

### `SERIALIZE_VERSION`

Bumped when the serialized JSON shape changes. Validate `json.$v === SERIALIZE_VERSION` before deserializing in another process — mismatch means regenerate + reship.

### `refDepth` — shallow FK targets

`serializeAnnotatedType(type, { refDepth })`:

- `0` (default) — refs stripped.
- `1` — immediate refs serialized; refs inside referenced types stripped.
- `2+` — deeper expansion.
- **`.5`** — emits `TSerializedShallowRefTarget` (`{ id, metadata }`) at that level instead of the full structural body. Client gets the target's identity without its field tree (useful for FK value-help dropdowns).

```ts
// Order.customerId → Customer. Client gets { id: 'Customer', metadata: {...} }.
serializeAnnotatedType(Order, { refDepth: 0.5 })
```

Self-referential FKs handled via the serialized `kind: '$ref'` node.

### Annotation filtering

```ts
// Strip by name:
serializeAnnotatedType(Product, {
  ignoreAnnotations: ['db.table', 'db.mongo.collection'],
})

// Transform via callback:
serializeAnnotatedType(Product, {
  processAnnotation({ key, value, path, kind }) {
    if (key.startsWith('meta.') || key.startsWith('expect.') || key.startsWith('ui.')) {
      return { key, value }
    }
    // return undefined to strip
  },
})
```

Callback args: `key`, `value`, `path: string[]`, `kind` (type kind at node).

## Metadata access

```ts
import { User } from './user.as'

const label = User.metadata.get('meta.label') // string | undefined (via AtscriptMetadata)
const idFlag = User.metadata.get('meta.id')   // boolean — true if this node is a @meta.id member

forAnnotatedType(User, {
  object(node) {
    for (const [name, child] of node.type.props) {
      const childLabel = child.metadata.get('meta.label')
    }
  },
})
```

Never cast `metadata.get(...)` to `any`. If the type is wrong/missing, `atscript.d.ts` is stale — see [codegen.md](codegen.md#atscriptdts).

## What `.as.js` exports

Each top-level `.as` export → a `class` of the same name with `static __is_atscript_annotated_type`, `static id`, `static type`, `static metadata`, `static validator`. The class itself **is** the `TAtscriptAnnotatedType`:

```ts
import { User } from './models/user.as'

User.metadata.get('meta.label')
User.validator().validate(data)
User.type.kind          // 'object' | 'array' | 'union' | …
```

`.as` resolution: `unplugin-atscript` in bundlers, VSCode extension in editors, or pre-generated `.as.js` on disk (Node ESM with loader).

## `createDataFromAnnotatedType`

Builds a plain data object matching a type's shape. `opts.mode` (default `'empty'`):

- `'empty'` — structural defaults (`''`, `0`, `false`, `[]`, `{}`); optional props skipped.
- `'default'` — values from `@meta.default`; optional props skipped unless annotated.
- `'example'` — values from `@meta.example`; optional props always included; arrays get one sample item. This is what the generated `.toExampleData()` calls when `exampleData: true` is set in the TS plugin config.
- `'db'` — `@db.default` / `@db.default.increment|uuid|now` (DB layer — see https://db.atscript.dev).
- a `TValueResolver` — `(prop, path) => value` for full control.

```ts
import { createDataFromAnnotatedType } from '@atscript/typescript/utils'
const blank = createDataFromAnnotatedType(Product)                       // empty
const sample = createDataFromAnnotatedType(Product, { mode: 'example' })
```

Full reference: the docs `type-definitions` page.

## DB-oriented helpers (documented elsewhere)

`@atscript/typescript/utils` also exports type helpers consumed by the DB layer — `FlatOf`, `OwnPropsOf`, `NavPropsOf`, `PrimaryKeyOf`, and the query-AST types (`AtscriptRef`, `AtscriptQueryFieldRef`, `AtscriptQueryComparison`, `AtscriptQueryNode`). They ship from this package but are only meaningful with `@atscript/db`. Documented in the `atscript-db` skill and https://db.atscript.dev — not here.

## See also

- [validation.md](validation.md) — `Validator` details.
- [codegen.md](codegen.md) — how the tree is produced.
- [annotations.md](annotations.md) — metadata keys.

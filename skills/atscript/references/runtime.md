# Runtime

What the generated `.as.js` does at runtime, and how consumers use it.

All APIs live in `@atscript/typescript/utils`. The main entry `@atscript/typescript` exports only the build-time `tsPlugin`.

## Contents

- [`TAtscriptAnnotatedType`](#tatscriptannotatedtype) — core shape
- [`defineAnnotatedType`](#defineannotatedtype) — builder used by generated code
- [`TAtscriptDataType<T>`](#tatscriptdatatype-t) — extract TS data shape
- [`forAnnotatedType`](#foranotatedtype) — kind-dispatched walker
- [`serializeAnnotatedType` / `deserializeAnnotatedType`](#serializeannotatedtype--deserializeannotatedtype) — JSON round-trip, `SERIALIZE_VERSION`, `refDepth` shallow FK targets, annotation filtering
- [Metadata access](#metadata-access) — typed `metadata.get(...)` via `AtscriptMetadata`
- [What `.as.js` exports](#what-asjs-exports)

## `TAtscriptAnnotatedType`

Every `.as.js` export:

```ts
interface TAtscriptAnnotatedType {
  id?: string
  type: TTypeDef
  metadata: TMetadataMap
  optional?: boolean
  ref?: { type: TAtscriptAnnotatedType; field: string }
  validator(opts?: ValidatorOptions): Validator
}
```

- `type` — structural def: `{ kind: 'object' | 'array' | 'union' | 'intersection' | 'tuple' | 'ref' | '' /* primitive */; … }`.
- `metadata` — typed `Map<string, unknown>` keyed by annotation name. `metadata.get('meta.label')` returns the type declared in global `AtscriptMetadata` (see [codegen.md](codegen.md)).
- `optional` — optional at the referring site.
- `ref` — alias to another interface/type; walked lazily.
- `validator(opts?)` — cached, typed `Validator<this>`. See [validation.md](validation.md).

## `defineAnnotatedType`

Builder used by generated code. Normally not called by hand (use `.as` + `asc`):

```ts
import { defineAnnotatedType as $ } from '@atscript/typescript/utils'

const _User = $('object', class User {})
  .prop('id', $('string').annotate('meta.id', true).annotate('primitive.tag', 'string.uuid'))
  .prop('name', $('string').annotate('meta.label', 'Full name'))
  .annotate('meta.interface', 'user.User')

export const User = _User
```

Subtleties:

- `$('object', Class)` **resets** the node. Never reuse a `$()` instance across declarations.
- Metadata propagation is lazy; inspecting `metadata.get(...)` before the tree is fully built may miss later entries.
- `.prop()` flatten is lazy (queued until first read).

Prefer `.as` fixtures compiled via `prepareFixtures()` over hand-written `$()` chains in tests — hand-written builders are fragile.

## `TAtscriptDataType<T>`

Extracts TS data shape from a generated type:

```ts
import type { TAtscriptDataType } from '@atscript/typescript/utils'
import { User } from './user.as'

type UserData = TAtscriptDataType<typeof User>
// ⇒ { id: string; name: string; … }
```

## `forAnnotatedType`

Kind-dispatched walker:

```ts
import { forAnnotatedType } from '@atscript/typescript/utils'

forAnnotatedType(User.annotatedType, {
  'object'(node) { for (const [name, child] of node.props) { /* … */ } },
  'array'(node) { /* node.items */ },
  'union'(node) { /* node.variants */ },
  'intersection'(node) { /* node.variants */ },
  'tuple'(node) { /* node.items */ },
  ''(node) { /* primitive — node.primitive is the tag */ },
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

const json = serializeAnnotatedType(User.annotatedType)
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

Self-referential FKs handled via `$ref` resolution.

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

forAnnotatedType(User.annotatedType, {
  object(node) {
    for (const [name, child] of node.props) {
      const childLabel = child.metadata.get('meta.label')
    }
  },
})
```

Never cast `metadata.get(...)` to `any`. If the type is wrong/missing, `atscript.d.ts` is stale — see [codegen.md](codegen.md#atscriptdts).

## What `.as.js` exports

Each top-level `.as` export → constant of the same name, a `TAtscriptAnnotatedType`-bearing class/object:

- `interface X` → `export const X` (class-like, with `.annotatedType`, `.metadata`, `.validator(...)`, nested prop types).
- `export type X = …` → same surface, data type = alias target.

```ts
import { User } from './models/user.as'
```

`.as` resolution: `unplugin-atscript` in bundlers, VSCode extension in editors, or pre-generated `.as.js` on disk (Node ESM with loader).

## See also

- [validation.md](validation.md) — `Validator` details.
- [codegen.md](codegen.md) — how the tree is produced.
- [annotations.md](annotations.md) — metadata keys.

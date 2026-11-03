# Runtime Metadata

Generated types expose their annotations as `metadata` maps on every node (`Type.metadata`, `prop.metadata`). Reading them is the everyday API, covered in [Metadata](/packages/typescript/metadata-export). This page is for plugin and core developers who read metadata in bulk or write to it at runtime: how a map reads through the types it refers to, and what a write reaches.

To change a type, write an [`annotate` block](/packages/typescript/ad-hoc-annotations). Writing to a `metadata` map at runtime is a low-level tool with the limits listed below.

```typescript
import { Client } from './client.as'
import { Address } from './address.as'

// interface Client { home: Address; billing: Address }
// annotate Client { @meta.label 'Home City' home.city }
const homeCity = Client.type.props.get('home')!.type.props.get('city')!

homeCity.metadata.get('meta.label') // 'Home City' — Client's own override
homeCity.metadata.get('meta.description') // read from Address.city
```

## How a map reads

A node's metadata is its own values plus an ordered list of **base** nodes it reads through: a property typed by a reference reads through the referenced type, a path override (`annotate Client { home.city }`) through `Address.city`, a property several merge members declare through each member's property, an `annotate T as X` copy through `T`.

| Operation                                   | Result                                                                                                                                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get(key)`                                  | The own value if there is one, else the value of the first base that has the key (bases are in priority order: later merge member first)                                                                   |
| `get(key)` of an `append` key               | The bases' values first (lowest priority first), then the own values: `A & B` gives `A`'s patterns, then `B`'s                                                                                             |
| `has`, `size`, `keys()`, `entries()`, loops | The effective entries: each key once, with the value `get` returns; own keys first                                                                                                                         |
| `passedWhenReferred: false` keys            | Not read through a reference (a prop's type, a chain ref, a merge operand's type level, an annotated alias); see [Ref boundaries](/plugin-development/annotation-system#ref-boundaries-passedwhenreferred) |

Bases are read through: a value written to `Address.city` later (with `set`, `delete` or `annotate()`) shows in `Client.home.city` unless the override sets that key itself. A node caches what it reads through its bases and refreshes it after any such write; see [Writing at runtime](#writing-at-runtime) for the one rule.

Maps of a [deserialized](/packages/typescript/serialization) type are plain maps holding the effective entries; they read through nothing.

## Which nodes are shared

What a write reaches depends on which node objects are the same. The generated code mirrors the `.as` source:

| In the source                                       | At runtime                                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `type P = T`, `type P = (T)`                        | `P` **is** `T` (the same object)                                                                 |
| `@meta.description 'x' type P = T`                  | A node of its own, reading through `T`                                                           |
| `p?: T`                                             | A node of its own (its `?` and annotations), reading through `T`; deeper nodes are `T`'s         |
| `interface C extends P` (inherited `name`)          | `C`'s `name` **is** `P`'s `name`                                                                 |
| `A & B`, a field only `A` declares                  | **Is** `A`'s field                                                                               |
| `A & B`, a field both declare                       | A node of the merge, reading through both fields                                                 |
| `type AB = A & B`                                   | A class of its own                                                                               |
| The same unnamed merge (`m?: A & B`) in two modules | Two objects, one per module                                                                      |
| `annotate Client { home.city }`                     | `Client`'s own nodes along `home → city`, reading through `Address`'s; everything else is shared |
| `annotate T as X { … }`                             | A class of its own over `T`'s structure, own nodes where it has entries                          |

## Writing at runtime

`metadata.set(key, value)` writes the node you hold, and only that node. The value shows wherever that node object is, and through every node that reads through it:

```typescript
const addressCity = Address.type.props.get('city')!

addressCity.metadata.set('meta.description', 'Town or city')
homeCity.metadata.get('meta.description') // 'Town or city' — read through

homeCity.metadata.set('meta.label', 'Home')
addressCity.metadata.get('meta.label') // unchanged — the write is Client's own
```

Consequences to plan for:

- **A write on an inherited property is the parent's.** `Admin.type.props.get('name')` is `User.name` when `Admin extends User`, so a write there changes `User` and every other child.
- **A write is local to the map you hold.** A write on one module's copy of an unnamed merge does not show in another module's copy of the same merge, and a write on a property's own node (`homeCity`) does not reach its base.
- **Blocks run when their module loads, and write the type's own nodes.** A block loaded after your write that sets the same key overwrites it. Write after every module with `annotate` blocks has loaded.
- **`delete(key)` removes only the node's own value.** A base's value shows through again. To hide a value, set a different one. In `.as`, [`@annotate.reset`](/packages/typescript/ad-hoc-annotations#removing-an-annotation-annotate-reset) hides an inherited value; `delete(key)` on a node that resets `key` ends the reset, so the base's value shows again.
- **An array read from metadata may be stored or shared.** It is not a copy: it can be the node's own array, a base node's array that other nodes read too, or, for an append key read through layers, a concatenation the node keeps and returns on every read until the next metadata write. Pushing onto it or changing it changes what other nodes and later reads see. Never mutate it. Write with `set()`, or add a value with `annotate(map, key, value, true)` from `@atscript/typescript/utils`, which appends to the node's own values.
- **Write through the map, or call `invalidateCompiledValidators()`.** `set` / `delete` / `clear`, `annotate()` and the `defineAnnotatedType()` handle methods are seen everywhere. After any other edit (swapping a node's map, `node.metadata = otherMap`, or changing a stored value in place) call `invalidateCompiledValidators()` from `@atscript/typescript/utils`. This holds for both validator engines: compiled checks and the nodes that read through other nodes keep what they read until a tracked write or that call.
- **Layers read a key as its spec says.** A plugin's raw write of a key whose spec says `passedWhenReferred: false` does not pass a reference, and one of a `mergeStrategy: 'append'` key comes after its bases' values, like the same annotation written in `.as` (also when no `.as` file writes that key).

```typescript
import { annotate } from '@atscript/typescript/utils'

annotate(homeCity.metadata, 'expect.pattern', { pattern: '^[A-Z]' }, true)
```

## What sees a write

| Reader                                                                                | After `metadata.set` / `delete` / `clear` / `annotate()`                                                                              |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Validator` (interpreted)                                                             | Sees it. A direct edit (`node.metadata = …`) needs `invalidateCompiledValidators()`, as for compiled checks                           |
| [Compiled checks](/packages/typescript/compiled-validators#changing-types-at-runtime) | Re-bind on their next use: see it. Direct property writes (`node.optional = …`) need `invalidateCompiledValidators()`                 |
| `toJsonSchema()` with `jsonSchema: 'lazy'`                                            | Rebuilt after a write: sees it                                                                                                        |
| `toJsonSchema()` with `jsonSchema: 'bundle'`                                          | The schema embedded at build time does **not** see runtime writes. Call `buildJsonSchema(type)` for a schema of the type as it is now |
| `serializeAnnotatedType`, `flattenAnnotatedType`                                      | Read the maps when called: see it                                                                                                     |

## DOs and DON'Ts

- **DO change types with `annotate` blocks.** They apply in a [fixed order](/packages/typescript/ad-hoc-annotations#two-blocks-setting-the-same-annotation) and reach every use of the type.
- **DO write at runtime only after all annotate modules have loaded**, during startup rather than per request.
- **DON'T mutate an array read from a map** (push, splice, sort): it may be shared with a base node or kept for later reads. Use `set()` or `annotate(map, key, value, true)`.
- **DON'T use `delete` to hide an inherited value**; set another value on the node.
- **DON'T expect a write on one node to reach another copy**: a merge in another module, a deserialized type, a bundled JSON schema.

## See Also

- [Metadata](/packages/typescript/metadata-export): reading annotations
- [Custom Annotations](/plugin-development/annotation-system): `mergeStrategy`, `passedWhenReferred`
- [Ad-hoc Annotations](/packages/typescript/ad-hoc-annotations): changing types with blocks

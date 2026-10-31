# Compiled Validators

By default `validate()` interprets the runtime type tree on every call. With `compileValidators` turned on, the build also emits a specialised check for each type into its `.as.js` module, and `validate()` runs that check first. It is an opt-in speed-up for servers that validate a lot of valid input.

```javascript
// atscript.config.js
import { defineConfig } from '@atscript/core'
import ts from '@atscript/typescript'

export default defineConfig({
  plugins: [ts({ compileValidators: true })],
})
```

Your code does not change: `Product.validator().validate(input)` uses the compiled check automatically, with both `asc -f js` and [`unplugin-atscript`](/packages/typescript/build-setup).

## Per-type opt-in: `@emit.compiledValidator`

To compile only the hot types and leave the rest interpreted, keep the option off and annotate those types:

```atscript
@emit.compiledValidator
export interface OrderRequest {
  lines: OrderLine[]   // same-file type: checked inside OrderRequest's compiled check
  address: Address     // imported type: compiled only if Address has its own check
}
```

- Only the annotated type gets a check. Types of the same file that it uses are compiled into that check, but they do not get checks of their own. Annotate them as well if you also validate them directly.
- An imported type is compiled inside the check only when its own module compiles it. Otherwise that part is interpreted.
- The annotation goes on an `interface`, a `type` or an `annotate … as` alias. With `compileValidators: true` every type is compiled anyway, so the annotation changes nothing.
- On a mutating `annotate` block, it compiles the annotated type when that type is declared in the same file. On an imported type it has no effect, and the compiler reports a warning: annotate the type in its own file instead.
- A build that forces interpreted output ignores it: `unplugin-atscript` with `compileValidators: false`, or the client bundle with `'ssr'` (see below).

## What changes and what does not

- **Results are identical.** The compiled check is a fast path for valid input only. When it fails, `validate()` runs the normal walk, so error messages, paths, `errorLimit` and `unknownProps: 'strip'` deletions are the same as without it.
- **Valid input gets faster.** On the reference `Order` benchmark, compiled checks are roughly 8–10× faster on valid input. Invalid input costs the same as before. See [Performance](/packages/typescript/validation-comparison#performance).
- **No `eval` and no `new Function`.** The checks are plain code in the generated module, so they work under a strict Content Security Policy.
- **Bundles get bigger.** Each compiled type adds code to its `.as.js`.

## When to turn it on

| Build                                            | Recommendation                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| Backend / API server                             | Turn it on: request validation is where the speed-up pays off      |
| Frontend bundle                                  | Leave it off: the extra code costs more than form validation gains |
| One Vite config for server and client (SSR apps) | Use the bundler option `compileValidators: 'ssr'` (see below)      |

### Per-build override in `unplugin-atscript`

The bundler plugin can override the config value for the modules it compiles:

| `compileValidators` | Effect                                                                              |
| ------------------- | ----------------------------------------------------------------------------------- |
| _unset_             | The `atscript.config` value decides (default: only `@emit.compiledValidator` types) |
| `true`              | Compile every type, whatever the config says                                        |
| `false`             | Compile nothing, `@emit.compiledValidator` types included                           |
| `'ssr'`             | `true` for Vite's server (SSR) build or environment, `false` for the client bundle  |

```javascript
// vite.config.js — one config for an SSR app (for example a Moost server with a Vite client)
import { defineConfig } from 'vite'
import atscript from 'unplugin-atscript/vite'

export default defineConfig({
  plugins: [atscript({ compileValidators: 'ssr' })],
})
```

Only Vite reports server builds. On every other bundler `'ssr'` means interpreted; use `true` there for a server build. Other plugin options are listed in [Build Setup](/packages/typescript/build-setup#options).

## When validation stays interpreted

Nothing breaks in these cases. `validate()` takes the interpreted path as before.

**The validator is configured with:**

- `plugins` (see [Plugins](/packages/typescript/validation-reference#plugins))
- [`replace`](/packages/typescript/validation-reference#replace)
- [`skipList`](/packages/typescript/validation-reference#skiplist)
- a function as [`partial`](/packages/typescript/validation-reference#partial)
- a subclass of `Validator` instead of `Validator` itself

`partial: true` / `'deep'` and every `unknownProps` mode (`'error'`, `'ignore'`, `'strip'`) work with compiled checks.

**The type was not built by a generated module:**

- deserialized types (for example metadata shipped to a frontend with [`serializeAnnotatedType()`](/packages/typescript/serialization))
- types built from JSON Schema with `fromJsonSchema()`
- flattened types ([`flattenAnnotatedType()`](/packages/typescript/type-definitions#flattenannotatedtype))
- types built by hand with `defineAnnotatedType()`

**Parts of a type that are always checked by the walk.** The rest of the type is still compiled:

- pattern properties
- arrays with `@expect.array.uniqueItems`
- `@expect.pattern` with the `g` or `y` flag
- in `unknownProps: 'strip'` mode, unknown keys on a nested object. That call falls back to the full walk.

**The type reaches too many types.** A compiled check covers the type and every same-file type it reaches. When that is more than a few hundred type nodes (for example a long chain of types that each extend and intersect the previous one), the class gets no compiled check, so the generated code does not grow with every type it reaches.

**Your app loads two copies of `@atscript/typescript`.** The compiled checks register with one copy, and validators from the other copy do not see them. Validation is still correct but not accelerated. To keep a single copy, see [Bundling for Production](/packages/typescript/build-setup#bundling-for-production).

## Changing types at runtime

A compiled check reads the type tree on first use and keeps the values it needs. It notices these changes on its own:

- `annotate()` from `@atscript/typescript/utils`
- `set` / `delete` / `clear` on a node's `metadata` map or an object type's `props` map
- `defineAnnotatedType()` handle methods

After any other change, call `invalidateCompiledValidators()`. Otherwise the check keeps validating against the old shape or values. Examples of such changes:

- direct property writes: `node.optional = true`, `node.type = …`, `node.metadata = new Map()`, `type.items.push(…)`
- editing an annotation value in place: changing a field of a constraint object, or pushing onto an `@expect.pattern` array (on a node that reads through other nodes, the array is a fresh copy and a push changes nothing: add a value with `annotate(map, key, value, true)`)

```typescript
import { invalidateCompiledValidators } from '@atscript/typescript/utils'

skuProp.optional = true // direct write: not tracked
invalidateCompiledValidators()
```

`invalidateCompiledValidators` is exported from both `@atscript/typescript/utils` and `@atscript/typescript`. The same rule holds without compiled checks: a node that reads metadata through other nodes (a reference, a merged field, a path override) caches what it reads and refreshes it after the tracked changes above. After a direct write such as `node.metadata = otherMap`, call `invalidateCompiledValidators()` whichever engine validates the type.

A write changes only the node it is made on, and what reads through it; see [Runtime Metadata](/plugin-development/runtime-metadata) for which nodes are shared.

## DOs and DON'Ts

- **DO enable it for server builds** that validate request bodies, queue messages or other high-volume input.
- **DON'T enable it for browser bundles.** If one Vite config builds both, use `'ssr'`.
- **DO annotate the hot types with `@emit.compiledValidator`** when only a few types see heavy traffic and you don't want every type compiled.
- **DO change types during startup, not per request.** Any change to a type that a compiled check uses makes every compiled check re-read its type once on next use. That is cheap once but adds up if it happens on every request.
- **DO call `invalidateCompiledValidators()` after direct writes** to a type tree. Prefer `annotate()` and the `Map` methods, which are tracked.
- **DON'T expect error-path speed-ups.** Invalid input runs the same walk as before.

## Next Steps

- [Validation Guide](/packages/typescript/validation): everyday validation flow
- [Validation Reference](/packages/typescript/validation-reference): every validator option
- [Configuration](/packages/typescript/configuration#compilevalidators): the plugin option
- [Build Setup](/packages/typescript/build-setup#options): bundler options

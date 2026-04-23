# Plugin development

Plugins can register primitives, annotations, emit new output formats (another language, SQL, GraphQL, OpenAPI), or intercept documents for analysis.

## Contents

- [`TAtscriptPlugin`](#tatscriptplugin) — hooks: `config`, `resolve`, `load`, `onDocument`, `render`, `buildEnd`
- [Packaging](#packaging) — factory + peer deps
- [New language extension](#new-language-extension) — patterns for Python/Java/Go/…
- [`AnnotationSpec` and primitive annotations](#annotationspec-and-primitive-annotations)
- [Message convention](#message-convention) — `doc.getDiagMessages()`
- [Type guards](#type-guards) — `isInterface`, `isProp`, `isRef`, `isStructure`
- [Testing a plugin](#testing-a-plugin) — unit / integration / end-to-end

## `TAtscriptPlugin`

```ts
import type { TAtscriptPlugin } from '@atscript/core'

export interface TAtscriptPlugin {
  name: string                                       // required
  config?(config: TAtscriptConfig): TAtscriptConfig | void
  resolve?(id: string): string | null | undefined    // virtual modules
  load?(id: string): string | null | undefined       // virtual file content
  onDocument?(doc: AtscriptDoc): void                // per-document post-parse
  render?(
    doc: AtscriptDoc,
    format: TAtscriptRenderFormat,
  ): Promise<TPluginOutput[]> | TPluginOutput[]
  buildEnd?(
    output: TPluginOutput[],
    format: TAtscriptRenderFormat,
    repo: AtscriptRepo,
  ): Promise<void> | void
}
```

All hooks optional except `name`. Plugins run in the order they appear in `plugins: [...]`.

### `config(config)`

Called once on `PluginManager` init. Returns partial config; merged via `defu`.

Use to register:
- Primitives ([primitives.md](primitives.md))
- `AnnotationSpec`s ([annotations.md](annotations.md))
- Defaults (e.g. `outDir`)

```ts
config(config) {
  return {
    primitives: { /* see primitives.md */ },
    annotations: { /* see annotations.md */ },
  }
}
```

### `resolve(id)` / `load(id)`

- `resolve(id)` — import specifier → absolute URI / stable ID. `null`/`undefined` falls through to default.
- `load(id)` — source text for a resolved ID. Use for virtual `.as` (schema registry, DB, …).

Document IDs typically `file:///absolute/path.as`. Non-file IDs need `resolve` to return a stable string.

### `onDocument(doc)`

Called after parse + semantic-node registration. Use for:

- Validating invariants, pushing messages to `doc.getDiagMessages()`.
- Synthesizing virtual properties (e.g. `@db.rel.via` reads the relation table, injects synthetic fields).
- Recording relationships for `buildEnd`.

Never mutate destructively — append, don't delete. Unexpected mutations break snapshot tests and the LSP.

### `render(doc, format)`

Per-document, per-format. Return zero or more:

```ts
interface TPluginOutput {
  fileName: string   // path relative to outDir
  content: string
  format?: string
}
```

TS plugin emits `foo.as.d.ts` on `format === 'dts'`, `foo.as.js` on `format === 'js'`. New formats should use a unique name (`'sql'`, `'openapi'`) or opt into an existing one.

`format` is the CLI `-f` value (or `undefined` → emit all supported). Plugins ignore formats they don't handle.

### `buildEnd(output, format, repo)`

Once per format after all docs rendered. Use for:

- Per-project index (e.g. `atscript.d.ts` from the TS plugin).
- Aggregating interfaces into a single GraphQL schema / OpenAPI doc.
- Cross-document invariants.

`repo` is `AtscriptRepo` — access to every parsed document and their messages.

## Packaging

Plugin = factory returning `TAtscriptPlugin`:

```ts
import type { TAtscriptPlugin } from '@atscript/core'

export interface MyPluginOptions { /* … */ }

export default function myPlugin(opts: MyPluginOptions = {}): TAtscriptPlugin {
  return {
    name: 'my-plugin',
    config(config) { /* … */ },
    render(doc, format) { /* … */ },
    buildEnd(output, format, repo) { /* … */ },
  }
}
```

Consumers:

```js
import { defineConfig } from '@atscript/core'
import ts from '@atscript/typescript'
import myPlugin from 'my-atscript-plugin'

export default defineConfig({
  plugins: [ts(), myPlugin({ /* … */ })],
})
```

Peer deps: `@atscript/core` always; `@atscript/typescript` if extending TS output.

## New language extension

A language extension = plugin whose `render()` emits another language. Pattern:

1. `config()` → register primitive extensions / annotations (`@python.pydantic.*`).
2. `render(doc, 'py')` → walk `doc.nodes` with a code printer.
3. `buildEnd('py', outputs, repo)` → emit a project-level index if useful.
4. Ship a CLI only if the workflow isn't `asc -f py`. Otherwise `asc -f py` is sufficient — `asc` exposes arbitrary formats.

## `AnnotationSpec` and primitive annotations

`AnnotationSpec` shape, arg types (`'string' | 'number' | 'boolean' | 'ref' | 'query'`), full example → [annotations.md](annotations.md#custom-annotations).

Primitives use generic `annotations: Record<string, TPrimitiveAnnotationValue>` — no hardcoded `expect` property. See [primitives.md](primitives.md#extending-primitives-via-config).

`PluginManager.applyAnnotations()` resolves each key against its registered `AnnotationSpec`, validates the value, attaches to primitive metadata. After `config()` registers a spec, any primitive's `annotations` map can reference it.

## Message convention

Errors/warnings never throw. Push to `doc.getDiagMessages()` (or return from `buildEnd`) as `TMessages`. Core aggregates diagnostics across plugins → CLI exit code, LSP, build tooling.

## Type guards

Use exported guards instead of `instanceof`:

```ts
import { isInterface, isProp, isRef, isStructure } from '@atscript/core'

for (const node of doc.nodes) {
  if (isInterface(node)) { /* … */ }
  if (isProp(node))      { /* … */ }
}
```

Guards check the `entity` string field — stable across serialization boundaries.

## Testing a plugin

- **Unit** — exercise `render()` with fabricated `AtscriptDoc` instances.
- **Integration** — `build()` from `@atscript/core` with an in-memory config + virtual `load()` returning `.as` strings. Compare outputs to snapshots.
- **End-to-end** — `prepareFixtures()` from `@atscript/typescript/test-utils` to compile real `.as` and dynamic-import.

## See also

- [config.md](config.md) — wiring plugins.
- [codegen.md](codegen.md) — the TS plugin's render pipeline.
- [annotations.md](annotations.md), [primitives.md](primitives.md) — consumer view.

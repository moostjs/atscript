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
import type { TAtscriptPlugin, TPluginOutput, TAtscriptRenderFormat, TAtscriptConfig } from '@atscript/core'
import type { AtscriptDoc, AtscriptRepo } from '@atscript/core'
import type { TOutput } from '@atscript/core'   // TOutput = TPluginOutput + { source, target }

export interface TAtscriptPlugin {
  name: string                                                        // required
  config?(config: TAtscriptConfig): Promise<TAtscriptConfig | undefined> | TAtscriptConfig | undefined
  resolve?(id: string): Promise<string | undefined> | string | undefined
  load?(id: string): Promise<string | undefined> | string | undefined
  onDocument?(doc: AtscriptDoc): Promise<void> | void
  render?(doc: AtscriptDoc, format: TAtscriptRenderFormat): Promise<TPluginOutput[]> | TPluginOutput[]
  buildEnd?(output: TOutput[], format: TAtscriptRenderFormat, repo: AtscriptRepo): Promise<void> | void
}
```

All hooks optional except `name`. Plugins run in the order they appear in `plugins: [...]`.

### `config(config)`

Called once on `PluginManager` init. Returns partial config (or `undefined`); merged via `defu`.

Use to register:
- Primitives ([primitives.md](primitives.md))
- `AnnotationSpec`s ([annotations.md](annotations.md))
- Defaults

```ts
config(config) {
  return {
    primitives: { /* see primitives.md */ },
    annotations: { /* see annotations.md */ },
  }
}
```

### `resolve(id)` / `load(id)`

- `resolve(id)` — import specifier → absolute URI / stable ID. Return `undefined` to fall through to default resolution.
- `load(id)` — source text for a resolved ID. Use for virtual `.as` (schema registry, DB, …).

Document IDs typically `file:///absolute/path.as`. Non-file IDs need `resolve` to return a stable string.

### `onDocument(doc)`

Called after parse + semantic-node registration. Returns `Promise<void> | void`. Use for:

- Validating invariants, pushing messages to `doc.getDiagMessages()`.
- Synthesizing virtual properties (e.g. `@db.rel.via` reads the relation table, injects synthetic fields).
- Recording relationships for `buildEnd`.

Never mutate destructively — append, don't delete. Unexpected mutations break snapshot tests and the LSP.

### `render(doc, format)`

Per-document, per-format. Return zero or more outputs:

```ts
interface TPluginOutput {
  fileName: string   // relative to outDir (or the source dir)
  content: string
}
```

`TPluginOutput` has **only** `fileName` + `content`. The `source` + `target` fields appear later (added by `BuildRepo` when materializing files into `TOutput`).

- `format` is the CLI `-f` value, or the `DEFAULT_FORMAT` sentinel (`'__default__'`) when `-f` is omitted.
- Plugins should accept `format === DEFAULT_FORMAT` for their primary output (the editor sends this on save):

```ts
import { DEFAULT_FORMAT } from '@atscript/core'

render(doc, format) {
  if (format === 'dts' || format === DEFAULT_FORMAT) {
    return [{ fileName: `${doc.name}.d.ts`, content: renderTypes(doc) }]
  }
  if (format === 'js') {
    return [{ fileName: `${doc.name}.js`, content: renderJs(doc) }]
  }
}
```

New language formats should use a unique name (`'py'`, `'sql'`, `'openapi'`).

### `buildEnd(output, format, repo)`

Once per format after all docs rendered. Argument order: `output` (the `TOutput[]` produced by every plugin's `render`), `format`, `repo`. Returns `Promise<void> | void`.

Use for:

- Per-project index (e.g. `atscript.d.ts` from the TS plugin).
- Aggregating interfaces into a single GraphQL schema / OpenAPI doc.
- Cross-document invariants.

`repo` is `AtscriptRepo` — access to every parsed document and their messages.

## Packaging

Plugin = factory returning `TAtscriptPlugin`:

```ts
import type { TAtscriptPlugin } from '@atscript/core'
import { DEFAULT_FORMAT } from '@atscript/core'

export interface MyPluginOptions { /* … */ }

export default function myPlugin(opts: MyPluginOptions = {}): TAtscriptPlugin {
  return {
    name: 'my-plugin',
    config(config) { /* … */ },
    render(doc, format) {
      if (format === DEFAULT_FORMAT || format === 'dts') {
        /* … */
      }
    },
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
2. `render(doc, 'py')` → walk `doc.nodes` with a code printer. Also accept `DEFAULT_FORMAT` if this is the user's primary language.
3. `buildEnd('py', outputs, repo)` → emit a project-level index if useful.
4. Ship a CLI only if the workflow isn't `asc -f py`. Otherwise `asc -f py` is sufficient — `asc` accepts any format string.

## `AnnotationSpec` and primitive annotations

`AnnotationSpec` shape, arg types (`'string' | 'number' | 'boolean' | 'ref' | 'query'`), full example → [annotations.md](annotations.md#custom-annotations).

Primitives use generic `annotations: Record<string, TPrimitiveAnnotationValue>` — no hardcoded `expect` property. See [primitives.md](primitives.md#extending-via-config). Annotation values on primitives are resolved against the registered `AnnotationSpec` (spec arg names → object keys, `multiple: true` → array).

## Message convention

Errors/warnings never throw. Push to `doc.getDiagMessages()` (or return them from `validate`/`modify` spec hooks) as `TMessages`. Core aggregates diagnostics across plugins → CLI exit code, LSP, build tooling.

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

# Plugin Hooks Reference

This page documents all seven hooks in the `TAtscriptPlugin` interface — their signatures, when they fire, execution semantics, and practical examples.

## Hook Summary

| Hook                             | When                    | Return                         | Execution                            |
| -------------------------------- | ----------------------- | ------------------------------ | ------------------------------------ |
| `config(config)`                 | At startup (once)       | `TAtscriptConfig \| undefined` | Sequential, merged with `defu`       |
| `buildStart(config)`             | Before discovery        | `void`                         | Sequential, all plugins called       |
| `resolve(id)`                    | Opening a document      | `string \| undefined`          | Sequential, last non-undefined wins  |
| `load(id)`                       | Loading source content  | `string \| undefined`          | Sequential, first non-undefined wins |
| `onDocument(doc)`                | After parsing           | `void`                         | Sequential, all plugins called       |
| `render(doc, format)`            | Code generation         | `TPluginOutput[] \| undefined` | Sequential, outputs concatenated     |
| `buildEnd(output, format, repo)` | After all docs rendered | `void`                         | Sequential, all plugins called       |

All hooks can be synchronous or async (return `Promise`). All are optional — implement only the ones you need.

## config()

```typescript
config?(
  config: TAtscriptConfig
): Promise<TAtscriptConfig | undefined> | TAtscriptConfig | undefined
```

Called once per loaded config, before any document is resolved, loaded or parsed. This is where you register primitives, annotations, and config options.

**Execution**: Plugins are called sequentially in array order. Each plugin receives the accumulated config; its `rootDir` is absolute (since 0.2.19). Return values are merged using `defu` (deep defaults — the first defined value wins).

**Example — Register primitives and annotations:**

```typescript
config() {
  return {
    primitives: {
      geo: {
        extensions: {
          latitude: {
            type: 'number',
            annotations: { 'expect.min': -90, 'expect.max': 90 },
          },
          longitude: {
            type: 'number',
            annotations: { 'expect.min': -180, 'expect.max': 180 },
          },
        },
      },
    },
    annotations: {
      geo: {
        coordinates: new AnnotationSpec({
          nodeType: ['interface'],
          description: 'GeoJSON coordinate system',
        }),
      },
    },
  }
}
```

**Example — Set unknownAnnotation policy:**

```typescript
config() {
  return {
    unknownAnnotation: 'warn',  // 'error' | 'warn' | 'allow'
  }
}
```

## buildStart()

```typescript
buildStart?(config: TAtscriptConfig & { rootDir: string }): Promise<void> | void
```

Called at the start of a build, after every plugin's `config()` and before any `.as` file is discovered or read (since 0.2.19). This is where a plugin writes `.as` files generated from another source — an OpenAPI document, a database schema, protobuf definitions. The build then compiles them like any other `.as` file, and your users can open and import them.

**Parameters**: `config` is the final config, with every plugin's `config()` merged and `rootDir` absolute. Resolve the paths of your own options against `config.rootDir`.

**Execution**: Plugins are called sequentially in array order, each awaited. An error thrown (or a rejected promise) fails the build.

**Who calls it**:

| Host                          | When                                                                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `asc` CLI and `build()`       | Once per build, before the `.as` files are collected                                                                              |
| Bundler (`unplugin-atscript`) | At the start of every build and watch rebuild, and when the dev server starts — before the first `.as` module is resolved or read |
| VSCode extension              | Never                                                                                                                             |

**Rules for a generator**:

- **Be idempotent and write a file only when its content changes.** The hook runs again on every build and watch rebuild. A file you rewrite makes a watching bundler rebuild once more; when that run writes nothing, the rebuilds stop. Rewriting an unchanged file every time never stops.
- **Write atomically.** Runs can overlap: a bundler building several outputs at once, or several test projects in one process sharing the plugin instance. Write each file to a temp file and rename it over the target, so no run reads a half-written file.
- **Keep it cheap.** It runs before every build and dev server start. Skip the work when the source did not change since the last run (compare its modification time, for example).
- **Run a build after changing the source.** The editor does not run the hook: it reads the `.as` files a build left on disk. After you change the source schema, run `asc` (or restart the dev server) once; the editor and a running dev server pick up the rewritten `.as` files.

**Example — Generate `.as` files from a schema document:**

```typescript
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { createAtscriptPlugin } from '@atscript/core'

let seq = 0

/** Writes `content` to `file` unless it already holds it — atomically: a temp file renamed over it. */
function writeIfChanged(file: string, content: string) {
  let old: string | undefined
  try {
    old = readFileSync(file, 'utf8')
  } catch {}
  if (old !== content) {
    const tmp = `${file}.${process.pid}.${seq++}.tmp`
    writeFileSync(tmp, content)
    renameSync(tmp, file)
  }
}

export const schemaPlugin = (options: { source: string; output: string }) =>
  createAtscriptPlugin({
    name: 'schema',
    buildStart(config) {
      const source = readFileSync(path.resolve(config.rootDir, options.source), 'utf8')
      // (`schemaToAtscript`: your converter from the schema document to `.as` text)
      writeIfChanged(path.resolve(config.rootDir, options.output), schemaToAtscript(source))
    },
  })
```

## resolve()

```typescript
resolve?(id: string): Promise<string | undefined> | string | undefined
```

Called when the repo opens a document or resolves an import. Allows you to remap module IDs — useful for virtual modules, path aliases, or rewriting import paths.

**Execution**: All plugins are called. The last non-`undefined` return wins. If all plugins return `undefined`, the original ID is used.

**Example — Virtual module:**

```typescript
resolve(id) {
  if (id.includes('virtual:generated-types')) {
    return '/absolute/path/to/generated-types.as'
  }
}
```

**Example — Path alias:**

```typescript
resolve(id) {
  if (id.startsWith('@models/')) {
    return id.replace('@models/', '/project/src/models/')
  }
}
```

## load()

```typescript
load?(id: string): Promise<string | undefined> | string | undefined
```

Called to get the source content for a document. Allows plugins to provide virtual file content without a real file on disk.

**Execution**: Plugins are called sequentially. The first to return a non-`undefined` string wins (early exit). If no plugin provides content, the file is read from disk.

**Example — Virtual file:**

```typescript
load(id) {
  if (id.endsWith('generated-enums.as')) {
    return `
      export type Status = "active" | "inactive" | "pending"
      export type Role = "admin" | "user" | "guest"
    `
  }
}
```

**Example — Preprocessing:**

```typescript
load(id) {
  if (id.endsWith('.as.template')) {
    const raw = readFileSync(id.replace('.template', ''), 'utf8')
    return raw.replace(/\$\{VERSION\}/g, '1.0.0')
  }
}
```

## onDocument()

```typescript
onDocument?(doc: AtscriptDoc): Promise<void> | void
```

Called after a document is parsed and its AST is fully built. All plugins receive the call in sequence — there is no early exit.

**Use cases**: Post-parse processing, injecting virtual properties, running custom validation, patching the AST.

**Example — Add computed fields:**

```typescript
onDocument(doc) {
  for (const node of doc.nodes) {
    if (isInterface(node)) {
      const struc = node.getDefinition()
      if (isStructure(struc) && node.props.has('firstName') && node.props.has('lastName')) {
        struc.addVirtualProp({
          name: 'fullName',
          type: 'string',
          documentation: 'Computed: firstName + lastName',
        })
      }
    }
  }
}
```

## render()

```typescript
render?(
  doc: AtscriptDoc,
  format: TAtscriptRenderFormat,
  options?: TAtscriptRenderOptions
): Promise<TPluginOutput[] | undefined> | TPluginOutput[] | undefined
```

Called once per document per format during the build phase. This is the primary code generation hook.

**Options**: what the caller says about the render. `options.loadCheck` is `true` in the bundler plugin's checked builds (one-shot Vite, Rollup and Rolldown builds, or any build with its `loadCheck: true` option), `false` where it must not check (dev server, watch builds, `loadCheck: false`), and unset otherwise — then the TypeScript plugin checks when the render runs inside `withLoadCheck` (the `asc` CLI build, or your own code), which does not set `options.loadCheck`. The TypeScript plugin loads its generated modules when the check is on; other plugins may ignore the option. A plugin that wraps the TypeScript plugin's `render` must pass the third argument on.

**Execution**: All plugins are called. Their outputs are concatenated — multiple plugins can produce output for the same document and format.

**Return type**: Array of `{ fileName: string, content: string }`. Return an empty array or `undefined` to produce no output for this format.

**Example — Primary output with DEFAULT_FORMAT:**

Plugins should handle `DEFAULT_FORMAT` for output that is essential during development (e.g., type declarations). This format is triggered by the VSCode extension on save and by the CLI when no `-f` flag is given. See [VSCode & Build Integration](/plugin-development/tooling-integration#the-default-format-constant) for details.

```typescript
import { DEFAULT_FORMAT } from '@atscript/core'

render(doc, format) {
  if (format === 'dts' || format === DEFAULT_FORMAT) {
    return [{
      fileName: `${doc.name}.d.ts`,
      content: new TypeRenderer(doc).render(),
    }]
  }
  if (format === 'js') {
    return [{
      fileName: `${doc.name}.js`,
      content: new RuntimeRenderer(doc).render(),
    }]
  }
}
```

**Example — Multiple output files per document:**

```typescript
render(doc, format) {
  if (format === 'graphql') {
    return [
      { fileName: `${doc.name}.graphql`, content: generateSchema(doc) },
      { fileName: `${doc.name}.resolvers.ts`, content: generateResolvers(doc) },
    ]
  }
}
```

## buildEnd()

```typescript
buildEnd?(
  output: TOutput[],
  format: TAtscriptRenderFormat,
  repo: AtscriptRepo
): Promise<void> | void
```

Called once after all documents have been rendered for a given format. Use this for cross-document aggregation.

**Parameters**:

- `output` — Mutable array of all output files. You can push new files or modify existing ones.
- `format` — The format string (same as passed to `render()`).
- `repo` — The `AtscriptRepo` instance for querying across all documents.

**`TOutput` extends `TPluginOutput`** with:

- `source` — The source document path
- `target` — The resolved output file path

**Example — Generate an index file:**

```typescript
async buildEnd(output, format, repo) {
  if (format !== 'python') return

  const exports = output
    .filter(o => o.fileName.endsWith('.py'))
    .map(o => {
      const module = o.fileName.replace('.py', '')
      return `from .${module} import *`
    })

  output.push({
    content: exports.join('\n'),
    fileName: '__init__.py',
    source: '',
    target: '/output/__init__.py',
  })
}
```

**Example — Collect project-wide metadata:**

```typescript
import { DEFAULT_FORMAT } from '@atscript/core'

async buildEnd(output, format, repo) {
  if (format !== 'dts' && format !== DEFAULT_FORMAT) return

  const annotations = await repo.getUsedAnnotations()
  const tags = await repo.getPrimitivesTags()

  output.push({
    content: generateGlobalTypes(annotations, tags),
    fileName: 'global-types.ext',
    source: '',
    target: '/output/global-types.ext',
  })
}
```

## Plugin Ordering

Plugins execute in the order they appear in the `plugins` array:

```typescript
export default defineConfig({
  plugins: [pluginA(), pluginB(), pluginC()],
})
```

**For `config()`**: Plugin A's return merges first. Since `defu` uses "first defined wins", Plugin A's values take priority over Plugin B's for the same key. Built-in defaults merge last.

**For `buildStart()`**: Called after every plugin's `config()`, in array order, each awaited — Plugin B starts after Plugin A's hook finished, so a plugin can read files an earlier one wrote.

**For `resolve()`**: All plugins are called; the last non-undefined return wins. So Plugin C's result takes priority if all three return a value.

**For `load()`**: First non-undefined return wins. So Plugin A's content takes priority if all three return content.

**For `render()`**: All plugins contribute. Their output arrays are concatenated in order (Plugin A's files, then B's, then C's).

**For `onDocument()` and `buildEnd()`**: All plugins are called in order with no return value merging.

## Next Steps

- [Testing Plugins](/plugin-development/testing-plugins) — test your hooks with Vitest
- [VSCode & Build Integration](/plugin-development/tooling-integration) — how hooks are triggered by tooling

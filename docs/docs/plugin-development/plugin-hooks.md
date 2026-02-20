# Plugin Hooks Reference

This page documents all six hooks in the `TAtscriptPlugin` interface — their signatures, when they fire, execution semantics, and practical examples.

## Hook Summary

| Hook | When | Return | Execution |
| --- | --- | --- | --- |
| `config(config)` | At startup (once) | `TAtscriptConfig \| undefined` | Sequential, merged with `defu` |
| `resolve(id)` | Opening a document | `string \| undefined` | Sequential, last non-undefined wins |
| `load(id)` | Loading source content | `string \| undefined` | Sequential, first non-undefined wins |
| `onDocument(doc)` | After parsing | `void` | Sequential, all plugins called |
| `render(doc, format)` | Code generation | `TPluginOutput[]` | Sequential, outputs concatenated |
| `buildEnd(output, format, repo)` | After all docs rendered | `void` | Sequential, all plugins called |

All hooks can be synchronous or async (return `Promise`). All are optional — implement only the ones you need.

## config()

```typescript
config?(config: TAtscriptConfig): TAtscriptConfig | undefined
```

Called once during `PluginManager` initialization, before any documents are opened. This is where you register primitives, annotations, and config options.

**Execution**: Plugins are called sequentially in array order. Each plugin receives the accumulated config. Return values are merged using `defu` (deep defaults — the first defined value wins).

**Example — Register primitives and annotations:**

```typescript
config() {
  return {
    primitives: {
      geo: {
        extensions: {
          latitude: { type: 'number', expect: { min: -90, max: 90 } },
          longitude: { type: 'number', expect: { min: -180, max: 180 } },
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

## resolve()

```typescript
resolve?(id: string): string | undefined
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
load?(id: string): string | undefined
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
onDocument?(doc: AtscriptDoc): void
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
render?(doc: AtscriptDoc, format: string): TPluginOutput[]
```

Called once per document per format during the build phase. This is the primary code generation hook.

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
buildEnd?(output: TOutput[], format: string, repo: AtscriptRepo): void
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

**For `resolve()`**: All plugins are called; the last non-undefined return wins. So Plugin C's result takes priority if all three return a value.

**For `load()`**: First non-undefined return wins. So Plugin A's content takes priority if all three return content.

**For `render()`**: All plugins contribute. Their output arrays are concatenated in order (Plugin A's files, then B's, then C's).

**For `onDocument()` and `buildEnd()`**: All plugins are called in order with no return value merging.

## Next Steps

- [Testing Plugins](/plugin-development/testing-plugins) — test your hooks with Vitest
- [VSCode & Build Integration](/plugin-development/tooling-integration) — how hooks are triggered by tooling

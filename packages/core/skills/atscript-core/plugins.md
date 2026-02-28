# Plugin Development — @atscript/core

> How to create Atscript plugins that add annotations, primitives, and code generators.

## Concepts

A plugin is a plain object implementing `TAtscriptPlugin` — a `name` plus optional hooks. Plugins extend Atscript by adding annotations, primitives, and output generators without modifying the parser.

## Creating a Plugin

```ts
import { createAtscriptPlugin, AnnotationSpec } from '@atscript/core'

export const myPlugin = () =>
  createAtscriptPlugin({
    name: 'my-plugin',

    // Add annotations and primitives
    config(config) {
      return {
        annotations: {
          api: {
            deprecated: new AnnotationSpec({
              description: 'Mark as deprecated',
              argument: { name: 'message', type: 'string', optional: true },
            }),
          },
        },
      }
    },

    // Generate output files
    render(doc, format) {
      if (format === 'json') {
        return [{ fileName: `${doc.name}.json`, content: JSON.stringify(doc.metadata) }]
      }
      return []
    },
  })
```

`createAtscriptPlugin` is a type-safe identity function — returns the object as-is but provides IntelliSense on hook signatures.

## Registering Plugins

```ts
import { defineConfig } from '@atscript/core'
import { myPlugin } from './plugins/my-plugin'

export default defineConfig({
  rootDir: 'src',
  plugins: [myPlugin()],
})
```

Plugins execute in array order. Each plugin's `config()` output is merged with accumulated config using `defu` (deep defaults).

## The TAtscriptPlugin Interface

```ts
interface TAtscriptPlugin {
  name: string
  config?(config: TAtscriptConfig): TAtscriptConfig | undefined
  resolve?(id: string): string | undefined
  load?(id: string): string | undefined
  onDocument?(doc: AtscriptDoc): void
  render?(doc: AtscriptDoc, format: string): TPluginOutput[]
  buildEnd?(output: TOutput[], format: string, repo: AtscriptRepo): void
}
```

All hooks except `name` are optional. Hooks can be sync or async.

## Hook Reference

### `config(config)`

Called once during initialization. Return additional config to merge (annotations, primitives). Multiple plugins merge via `defu`.

```ts
config(config) {
  return {
    primitives: {
      url: { type: 'string', annotations: { 'expect.pattern': { pattern: '^https?://' } } },
    },
    annotations: {
      cache: { ttl: new AnnotationSpec({ argument: { name: 'seconds', type: 'number' } }) },
    },
  }
}
```

### `resolve(id)`

Remap or virtualize module paths. Return a new path string or `undefined` to skip.

```ts
resolve(id) {
  if (id === '@my-lib/types') return '/path/to/virtual-types.as'
}
```

### `load(id)`

Provide virtual file content. Return `.as` source string or `undefined`.

```ts
load(id) {
  if (id === '/virtual/base-entity.as') {
    return `export interface BaseEntity { id: string.uuid }`
  }
}
```

### `onDocument(doc)`

Post-process a parsed document. Access the AST, inject virtual props, run checks.

```ts
onDocument(doc) {
  // Access parsed interfaces
  for (const [name, node] of doc.interfaces) {
    // Inspect or modify the AST
  }
}
```

### `render(doc, format)`

Generate output files for each document. Return `TPluginOutput[]`.

```ts
render(doc, format) {
  if (format === 'dts' || format === DEFAULT_FORMAT) {
    return [{ fileName: `${doc.name}.d.ts`, content: generateTypes(doc) }]
  }
  return []
}
```

The `DEFAULT_FORMAT` constant is the format used when saving `.as` files in an editor. Check for it alongside your plugin's format strings.

### `buildEnd(output, format, repo)`

Called after all documents are rendered. Aggregate across all docs — useful for global type declarations, index files, etc.

```ts
buildEnd(output, format, repo) {
  // repo.getUsedAnnotations() — all annotation specs registered
  // output — array of { doc, files } from render phase
}
```

## AtscriptDoc API (Key Methods)

| Method / Property       | Description                                      |
| ----------------------- | ------------------------------------------------ |
| `doc.name`              | File name (without extension)                    |
| `doc.path`              | Full file path                                   |
| `doc.interfaces`        | Map of interface names → AST nodes               |
| `doc.types`             | Map of type names → AST nodes                    |
| `doc.imports`           | Import declarations                              |
| `doc.exports`           | Export declarations                               |
| `doc.unwindType(id, chain)` | Resolve a type reference to its definition   |

## AtscriptRepo API (Key Methods)

| Method / Property              | Description                                    |
| ------------------------------ | ---------------------------------------------- |
| `repo.getUsedAnnotations()`    | Iterator of all registered annotation specs    |
| `repo.documents`               | Map of all parsed documents                    |
| `repo.config`                  | Merged configuration                           |

## Common Patterns

### Annotation-only plugin

Just `config()` — the simplest plugin type:

```ts
export const tagsPlugin = () =>
  createAtscriptPlugin({
    name: 'tags',
    config: () => ({
      annotations: {
        tag: new AnnotationSpec({
          multiple: true,
          mergeStrategy: 'append',
          argument: { name: 'value', type: 'string' },
        }),
      },
    }),
  })
```

### Full language extension

`config()` + `render()` + `buildEnd()` — see `@atscript/typescript` for the reference implementation.

## Best Practices

- Keep plugin names unique and descriptive
- Use `config()` for annotations/primitives, not hardcoded checks
- Check `format` in `render()` — plugins may be called with different formats
- Use `DEFAULT_FORMAT` for output that's essential to the dev experience (e.g., type declarations)
- Return empty array from `render()` when format doesn't match

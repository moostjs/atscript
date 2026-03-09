# Plugin Development

Atscript plugins extend the language in three practical ways:

- add custom annotations
- add custom primitives
- generate output files from `.as` models

You do not need to learn the entire parser or runtime internals up front. For most plugins, the useful path is:

1. add one annotation or primitive with `config()`
2. optionally add a `render()` hook if you generate files
3. test the result with a small fixture
4. wire it into CLI, build tools, or editor workflows

::: warning Early Documentation
Plugin development is part of Atscript's long-term architecture, but this section is still early and incomplete. If you are new to Atscript, start with the [TypeScript guide](/packages/typescript/) first.
:::

## Best Path For New Plugin Authors

::: tip Recommended Order
If you are building your first plugin, read these in order:

1. [Custom Annotations](/plugin-development/annotation-system)
2. [Custom Primitives](/plugin-development/primitives-type-tags)
3. [Building a Code Generator](/plugin-development/code-generation)
4. [Testing Plugins](/plugin-development/testing-plugins)
5. [VSCode & Build Integration](/plugin-development/tooling-integration)
:::

Keep [Plugin Architecture](/plugin-development/architecture) and [Plugin Hooks Reference](/plugin-development/plugin-hooks) for later, when you need the deeper model.

## What Plugins Can Do

| Capability                       | Hook           | Example                                     |
| -------------------------------- | -------------- | ------------------------------------------- |
| Add semantic types (primitives)  | `config()`     | `mongo.objectId`, `mongo.vector`            |
| Define annotation specs          | `config()`     | `@db.mongo.collection`, `@db.index.unique`  |
| Remap or virtualize module paths | `resolve()`    | Path aliases, virtual modules               |
| Provide virtual file content     | `load()`       | Synthetic `.as` modules                     |
| Post-process parsed documents    | `onDocument()` | Inject virtual props, run custom checks     |
| Generate output files            | `render()`     | `.d.ts`, `.js`, `.py`, `.json` — any format |
| Aggregate across all documents   | `buildEnd()`   | Global type declarations, indexes           |

## Choose The Smallest Plugin Shape

Most plugin work starts in one of these shapes:

- `Language extension`: only `config()`
  - add custom annotations or primitives
  - no output files yet
- `Generator plugin`: `config()` plus `render()`
  - read parsed models
  - generate `.d.ts`, `.json`, `.py`, or other files
- `Project-wide generator`: `config()` plus `render()` plus `buildEnd()`
  - generate registries, manifests, or shared declarations across files

Start with the smallest one that solves your problem.

## Your First Plugin

Here's a minimal plugin that adds a `@api.deprecated` annotation:

```typescript
import { createAtscriptPlugin, AnnotationSpec } from '@atscript/core'

export const apiPlugin = () =>
  createAtscriptPlugin({
    name: 'api',
    config() {
      return {
        annotations: {
          api: {
            deprecated: new AnnotationSpec({
              description: 'Mark this field as deprecated in the API',
              nodeType: ['prop', 'interface'],
              argument: {
                name: 'message',
                type: 'string',
                optional: true,
              },
            }),
          },
        },
      }
    },
  })
```

`createAtscriptPlugin` is a type-safe identity function — it returns the object you pass in, but gives you full TypeScript IntelliSense on the hook signatures.

This is already enough to make Atscript understand a new annotation. If your goal is syntax support or metadata only, you can stop at this stage.

## Registering Your Plugin

Add the plugin to your `atscript.config.ts`:

```typescript
import { defineConfig } from '@atscript/core'
import { tsPlugin } from '@atscript/typescript'
import { apiPlugin } from './plugins/api-plugin'

export default defineConfig({
  rootDir: 'src',
  plugins: [tsPlugin(), apiPlugin()],
})
```

Plugins execute in array order. Each plugin's `config()` output is merged with the accumulated config using deep defaults (`defu`), so multiple plugins can contribute primitives and annotations without conflicts.

## The Plugin Interface

```typescript
interface TAtscriptPlugin {
  name: string

  config?(
    config: TAtscriptConfig
  ): Promise<TAtscriptConfig | undefined> | TAtscriptConfig | undefined
  resolve?(id: string): Promise<string | undefined> | string | undefined
  load?(id: string): Promise<string | undefined> | string | undefined
  onDocument?(doc: AtscriptDoc): Promise<void> | void
  render?(
    doc: AtscriptDoc,
    format: TAtscriptRenderFormat
  ): Promise<TPluginOutput[]> | TPluginOutput[]
  buildEnd?(
    output: TOutput[],
    format: TAtscriptRenderFormat,
    repo: AtscriptRepo
  ): Promise<void> | void
}
```

All hooks except `name` are optional. In practice:

- start with `config()` for annotations and primitives
- add `render()` when you need generated output
- add `buildEnd()` only when you need cross-file aggregation

You usually do not need `resolve()`, `load()`, or `onDocument()` for a first plugin.

## Recommended Reading Paths

### Path A: Extend The Model Language

1. **[Custom Annotations](/plugin-development/annotation-system)** — add new annotation names with typed arguments and validation.
2. **[Custom Primitives](/plugin-development/primitives-type-tags)** — add semantic types like `geo.latitude` or `openapi.date`.
3. **[Testing Plugins](/plugin-development/testing-plugins)** — verify that the plugin really works on `.as` fixtures.

### Path B: Generate Files

1. **[Custom Annotations](/plugin-development/annotation-system)** or **[Custom Primitives](/plugin-development/primitives-type-tags)** — define what your generator reads.
2. **[Building a Code Generator](/plugin-development/code-generation)** — write a `render()` hook that walks one document and emits output.
3. **[Testing Plugins](/plugin-development/testing-plugins)** — lock behavior with snapshots.
4. **[VSCode & Build Integration](/plugin-development/tooling-integration)** — decide which outputs run in the CLI, bundler, and editor.

### Path C: Deepen Your Mental Model

1. **[Plugin Architecture](/plugin-development/architecture)** — understand the document model and the processing pipeline.
2. **[Plugin Hooks Reference](/plugin-development/plugin-hooks)** — exact signatures and hook behavior.
3. **[Validation Specification](/plugin-development/validation-spec)** — implement validation in non-TypeScript targets.

## Prerequisites

- Familiarity with [Atscript syntax](/packages/typescript/interfaces-types) (interfaces, types, annotations)
- A working TypeScript development environment
- `@atscript/core` as a dependency (the only required package for plugin development)

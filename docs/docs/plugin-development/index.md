# Creating a Plugin

Atscript plugins extend the language with custom primitives, annotations, and code generators. A plugin is a plain object that implements the `TAtscriptPlugin` interface — a `name` plus optional hooks that participate in the Atscript processing pipeline.

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

## The TAtscriptPlugin Interface

```typescript
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

All hooks except `name` are optional. A plugin can implement any combination — from a simple annotation-only plugin (just `config()`) to a full language extension with code generation (`config()` + `render()` + `buildEnd()`).

## Guide Roadmap

This guide walks you through plugin development from simple to complex:

1. **[Plugin Architecture](/plugin-development/architecture)** — The processing pipeline, AST node types, plugin lifecycle, and the document API you'll use throughout.

2. **[Custom Primitives](/plugin-development/primitives-type-tags)** — Adding semantic types with validation constraints, complex type definitions, and inheritance.

3. **[Custom Annotations](/plugin-development/annotation-system)** — Defining annotation specs with typed arguments, custom validation, merge strategies, and AST modification.

4. **[Building a Code Generator](/plugin-development/code-generation)** — Writing a `render()` hook to generate output files, walking the AST, resolving types, and building a complete code generator from scratch.

5. **[Plugin Hooks Reference](/plugin-development/plugin-hooks)** — Complete reference for all six hooks with signatures, execution order, and examples.

6. **[Validation Specification](/plugin-development/validation-spec)** — Language-agnostic spec for implementing data validation: type dispatch, constraint annotations, optional vs required, error reporting.

7. **[Testing Plugins](/plugin-development/testing-plugins)** — Test setup with Vitest, snapshot testing generated output, and testing diagnostics.

8. **[VSCode & Build Integration](/plugin-development/tooling-integration)** — How plugins integrate with the CLI, build tools, and VSCode on-save generation.

## Prerequisites

- Familiarity with [Atscript syntax](/packages/typescript/interfaces-types) (interfaces, types, annotations)
- A working TypeScript development environment
- `@atscript/core` as a dependency (the only required package for plugin development)

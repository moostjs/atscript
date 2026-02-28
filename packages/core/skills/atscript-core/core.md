# Setup & Configuration — @atscript/core

> How to install, configure, and understand the @atscript/core package.

## Overview

`@atscript/core` is the foundation of the Atscript ecosystem. It provides:
- Parser for `.as` files → AST
- Annotation system (`AnnotationSpec`, annotation trees)
- Primitive type system
- Plugin architecture
- Built-in annotations (`@meta.*`, `@expect.*`, `@ui.*`, `@db.*`, `@emit.*`)
- Built-in primitives (`string`, `number`, `boolean`, `null`, `void`, `phantom` + extensions)

Language extensions like `@atscript/typescript` build on top of core.

## Installation

```bash
npm install @atscript/core
```

## Configuration

Create `atscript.config.ts` (or `.js`) at your project root:

```ts
import { defineConfig } from '@atscript/core'
import tsPlugin from '@atscript/typescript'

export default defineConfig({
  rootDir: 'src',
  plugins: [tsPlugin()],

  // Optional: custom annotations
  annotations: {
    myNamespace: {
      myAnnotation: new AnnotationSpec({ ... }),
    },
  },

  // Optional: custom primitives
  primitives: {
    currency: { type: 'string', annotations: { 'expect.pattern': { pattern: '^\\d+\\.\\d{2}$' } } },
  },

  // Optional: how unknown annotations are handled
  unknownAnnotation: 'error', // 'error' (default) | 'warn' | 'allow'

  // Optional: file patterns
  include: ['**/*.as'],
  exclude: ['**/node_modules/**'],
})
```

### `TAtscriptConfig` Fields

| Field               | Type                          | Description                                    |
| ------------------- | ----------------------------- | ---------------------------------------------- |
| `rootDir`           | `string`                      | Root directory for `.as` files                 |
| `entries`           | `string[]`                    | Explicit entry files (instead of auto-discover) |
| `plugins`           | `TAtscriptPlugin[]`           | Plugins to load (order matters)                |
| `annotations`       | `TAnnotationsTree`            | Custom annotation definitions                  |
| `primitives`        | `Record<string, TPrimitiveConfig>` | Custom primitive type definitions         |
| `unknownAnnotation` | `'error' \| 'warn' \| 'allow'` | How to handle unrecognized annotations       |
| `include`           | `string[]`                    | Glob patterns to include                       |
| `exclude`           | `string[]`                    | Glob patterns to exclude                       |
| `format`            | `string`                      | Output format (set by CLI or build tool)       |
| `outDir`            | `string`                      | Output directory                               |

## Package Exports

```ts
// Configuration
export { defineConfig } from '@atscript/core'

// Annotations
export { AnnotationSpec, isAnnotationSpec, resolveAnnotation } from '@atscript/core'

// Config types
export type { TAtscriptConfig, TAnnotationsTree } from '@atscript/core'

// Plugin system
export { createAtscriptPlugin } from '@atscript/core'
export type { TAtscriptPlugin, TPluginOutput } from '@atscript/core'
export { DEFAULT_FORMAT } from '@atscript/core'

// Document & Repo (for plugin authors)
export { AtscriptDoc } from '@atscript/core'
export { AtscriptRepo } from '@atscript/core'

// Parser nodes (for plugin authors)
export { /* node type guards and types */ } from '@atscript/core'

// Build utilities
export { build } from '@atscript/core'
```

## Architecture

```
atscript.config.ts
  └─ defineConfig({ plugins, annotations, primitives })
       └─ Plugins merge configs via defu (deep defaults)
            └─ AtscriptRepo orchestrates parsing
                 └─ AtscriptDoc per .as file (AST + metadata)
                      └─ Plugins render output (render hook)
                           └─ Plugins aggregate (buildEnd hook)
```

Plugins execute in array order. Each plugin's `config()` output is merged using `defu`, so multiple plugins can contribute annotations and primitives without conflicts.

## Annotation Namespaces (Built-in)

The core ships five annotation namespaces:

| Namespace  | Purpose                            | Example                    |
| ---------- | ---------------------------------- | -------------------------- |
| `meta.*`   | Semantic metadata                  | `@meta.label "Name"`       |
| `expect.*` | Validation constraints             | `@expect.min 0`            |
| `ui.*`     | Presentation / UI hints            | `@ui.placeholder "Enter…"` |
| `db.*`     | Database schema                    | `@db.table "users"`        |
| `emit.*`   | Build-time directives              | `@emit.jsonSchema`         |

See [annotations.md](annotations.md) for the full reference.

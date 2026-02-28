---
name: atscript-core
description: Use when working with @atscript/core — configuring atscript.config.ts with defineConfig, defining custom AnnotationSpec annotations, creating custom TPrimitiveConfig primitives, building TAtscriptPlugin plugins with config/resolve/load/onDocument/render/buildEnd hooks, understanding built-in @meta.* @expect.* @ui.* @db.* @emit.* annotations, or working with AtscriptDoc/AtscriptRepo APIs.
---

# @atscript/core

The foundation package for Atscript — a universal type and metadata description language. Provides the parser, AST, annotation system, plugin architecture, and all built-in annotations and primitives that language extensions (TypeScript, Python, etc.) build upon.

## How to use this skill

Read the domain file that matches the task. Do not load all files — only what you need.

| Domain                   | File                             | Load when…                                                                        |
| ------------------------ | -------------------------------- | --------------------------------------------------------------------------------- |
| Setup & configuration    | [core.md](core.md)               | Installing, configuring `atscript.config.ts`, understanding the package structure |
| Annotations reference    | [annotations.md](annotations.md) | Using or defining `@meta.*`, `@expect.*`, `@ui.*`, `@db.*`, `@emit.*` annotations |
| Primitives reference     | [primitives.md](primitives.md)   | Using built-in primitives (`string.email`, `number.int`) or defining custom ones  |
| Plugin development       | [plugins.md](plugins.md)         | Creating plugins with `createAtscriptPlugin`, implementing hooks                  |

## Quick reference

```ts
// Configuration
import { defineConfig, AnnotationSpec } from '@atscript/core'

// Plugin creation
import { createAtscriptPlugin } from '@atscript/core'

// AST / document types (for plugin authors)
import { AtscriptDoc, AtscriptRepo } from '@atscript/core'
```

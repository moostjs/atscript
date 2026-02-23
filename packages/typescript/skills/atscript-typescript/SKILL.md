---
name: atscript-typescript
description: Use when working with Atscript (.as files) in TypeScript projects — writing or editing .as interfaces/types/annotations, configuring atscript.config.ts or tsPlugin, understanding generated .d.ts/.js output, using runtime APIs (TAtscriptAnnotatedType, metadata, validators), generating JSON Schema or example data from types, serializing/deserializing annotated types, or running the asc CLI.
---

# @atscript/typescript

Atscript is a universal type and metadata description language. `@atscript/typescript` is the TypeScript language extension that compiles `.as` files into `.d.ts` type declarations and `.js` runtime modules with full metadata, validation, and JSON Schema support.

## How to use this skill

Read the domain file that matches the task. Do not load all files — only what you need.

| Domain | File | Load when… |
|--------|------|------------|
| Setup & configuration | [core.md](core.md) | Installing, configuring `atscript.config.ts`, using the `tsPlugin`, running the CLI |
| `.as` file syntax | [syntax.md](syntax.md) | Writing `.as` files — interfaces, types, imports/exports, property syntax |
| Annotations & primitives | [annotations.md](annotations.md) | Using built-in `@meta.*`/`@expect.*` annotations, defining custom annotations or primitives |
| Code generation | [codegen.md](codegen.md) | Understanding what `.d.ts` and `.js` files are generated, `atscript.d.ts` global types |
| Runtime type system | [runtime.md](runtime.md) | Reading/writing metadata, walking type definitions, understanding `TAtscriptAnnotatedType` |
| Validation | [validation.md](validation.md) | Validating data, type guards, error handling, custom validator plugins |
| Utility functions | [utilities.md](utilities.md) | Serialization, flattening, JSON Schema, `createDataFromAnnotatedType`, `forAnnotatedType` |

## Quick reference

```ts
// Main export (plugin for atscript.config)
import tsPlugin from '@atscript/typescript'

// Runtime utilities (used in app code)
import {
  defineAnnotatedType, isAnnotatedType, annotate,
  Validator, ValidatorError,
  buildJsonSchema, fromJsonSchema, mergeJsonSchemas,
  serializeAnnotatedType, deserializeAnnotatedType,
  flattenAnnotatedType, createDataFromAnnotatedType,
  forAnnotatedType, throwFeatureDisabled,
} from '@atscript/typescript/utils'

// CLI
// npx asc -f dts        — generate .d.ts files
// npx asc -f js         — generate .js files (not usually needed with unplugin)
// npx asc               — generate default formats (for typescript plugin this is d.ts only, but if there are other language plugins it may generate multiple formats)
```

# @atscript/typescript

The TypeScript plugin for Atscript. It generates TypeScript declarations (`.d.ts`) and JavaScript modules (`.js`) from `.as` files, and provides runtime utilities for validation, JSON Schema generation, serialization, and type traversal.

## Two Entry Points

- **`@atscript/typescript`** — the code generation plugin (used in `atscript.config.js`)
- **`@atscript/typescript/utils`** — runtime utilities for working with generated types

```typescript
import {
  Validator,
  buildJsonSchema,
  serializeAnnotatedType,
  deserializeAnnotatedType,
  forAnnotatedType,
} from '@atscript/typescript/utils'
```

## What's in This Section

**Getting Started:**
- [Installation](/packages/typescript/installation) — install the package
- [Configuration](/packages/typescript/configuration) — set up the plugin and config file
- [Code Generation](/packages/typescript/code-generation) — understand `.d.ts` and `.js` output formats
- [CLI](/packages/typescript/cli) — build `.as` files from the command line

**Runtime API:**
- [Type Definitions](/packages/typescript/type-definitions) — the annotated type system, DataType inferring, and type traversal
- [Metadata](/packages/typescript/metadata-export) — access annotations at runtime
- [Validation](/packages/typescript/validation) — validate data with type guard support
- [JSON Schema](/packages/typescript/json-schema) — generate JSON Schema from types
- [Serialization](/packages/typescript/serialization) — serialize types for backend-to-frontend transfer

::: tip New to Atscript?
Start with the [Quick Start](/guide/quick-start) guide for a hands-on introduction to the `.as` language and TypeScript integration.
:::

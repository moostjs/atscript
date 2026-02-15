# @atscript/typescript

The TypeScript plugin for Atscript. It generates TypeScript declarations (`.d.ts`) and JavaScript modules (`.js`) from `.as` files, and provides runtime utilities for validation, JSON Schema generation, serialization, and type traversal.

## Entry Points

The package exposes two entry points:

- **`@atscript/typescript`** — the code generation plugin, used in `atscript.config.js`:

  ```javascript
  import { defineConfig } from '@atscript/core'
  import ts from '@atscript/typescript'

  export default defineConfig({
    plugins: [ts()],
  })
  ```

- **`@atscript/typescript/utils`** — runtime utilities for working with generated types:

  ```typescript
  import {
    Validator,
    buildJsonSchema,
    serializeAnnotatedType,
    deserializeAnnotatedType,
    forAnnotatedType,
  } from '@atscript/typescript/utils'
  ```

## Features

- **[Type Definitions](/packages/typescript/type-definitions)** — runtime annotated type system with automatic DataType inferring and type-safe traversal
- **[Validation](/packages/typescript/validation)** — `Validator` class with type guard support, configurable options, and plugin system
- **[JSON Schema](/packages/typescript/json-schema)** — generate JSON Schema from annotated types, with annotation-driven constraints
- **[Serialization](/packages/typescript/serialization)** — serialize types to JSON for backend-to-frontend transfer, database storage, and caching

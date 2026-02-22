# Quick Start

A minimal working example — from installing Atscript to validating data in TypeScript.

## 1. Install

```bash
npm install @atscript/typescript
npm install -D @atscript/core unplugin-atscript
```

`@atscript/typescript` is a regular dependency — it ships runtime utilities (validation, metadata access) that your code needs at runtime. `@atscript/core` and `unplugin-atscript` are dev-only (build tooling).

## 2. Create a `.as` File

Create `src/user.as` — this is your single source of truth for the data model, metadata, and validation constraints:

```atscript
export interface User {
    @meta.label 'User Name'
    @expect.minLength 2
    name: string

    @meta.label 'Email Address'
    email: string.email

    @expect.min 0
    age: number
}
```

Here we define an interface with [annotations](/packages/typescript/annotations) like `@meta.label` and `@expect.minLength`, and a [semantic type](/packages/typescript/primitives) `string.email` that carries built-in validation. See [Interfaces & Types](/packages/typescript/interfaces-types) for the full syntax.

## 3. Configure Atscript

Create `atscript.config.js` in your project root:

```javascript
import { defineConfig } from '@atscript/core'
import ts from '@atscript/typescript'

export default defineConfig({
  rootDir: 'src',
  plugins: [ts()],
})
```

See [Configuration](/packages/typescript/configuration) for all available options and plugin settings.

## 4. Set Up Your Build

Install `unplugin-atscript` and configure your bundler. Here's a Vite example for a Node.js library:

```javascript
// vite.config.js
import { defineConfig } from 'vite'
import atscript from 'unplugin-atscript/vite'

export default defineConfig({
  plugins: [atscript()],
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
    },
    rollupOptions: {
      external: [/node_modules/],
    },
  },
})
```

The plugin compiles `.as` files automatically during the build. See [Build Setup](/packages/typescript/build-setup) for Rollup, esbuild, and other bundlers.

## 5. Generate Type Definitions

Install the [Atscript VSCode extension](https://marketplace.visualstudio.com/items?itemName=moost.atscript-as) — it automatically generates `.as.d.ts` files on save, giving you IntelliSense and type checking. See the [VSCode](/packages/vscode/) section for details.

Alternatively, use the CLI:

```bash
npx asc -f dts
```

This generates `.as.d.ts` files for each `.as` file and an `atscript.d.ts` file with annotation type definitions. Run this at least once so TypeScript knows about your annotation types. See [CLI](/packages/typescript/cli) for all options.

Add `atscript.d.ts` to your `tsconfig.json`:

```json
{
  "include": ["src/**/*", "atscript.d.ts"]
}
```

## 6. Use in TypeScript

Import your `.as` types — the imported `User` is a fully typed class whose data shape matches the interface you defined:

```typescript
// The generated type is equivalent to:
declare class User {
  name: string
  email: string
  age: number
}
```

Beyond the data shape, it also carries static members that give you runtime access to everything declared in the `.as` file:

- **`User.type`** — the [annotated type definition](/packages/typescript/type-definitions); traverse properties, access per-property metadata and tags
- **`User.metadata`** — top-level [metadata](/packages/typescript/metadata-export) map for the interface itself
- **`User.validator()`** — creates a [Validator](/packages/typescript/validation) that enforces `@expect.*` annotations and semantic type rules
- **`User.toJsonSchema()`** — generates a [JSON Schema](/packages/typescript/json-schema) from the type and its annotations

Here's a quick example:

```typescript
// src/index.ts
import { User } from './user.as'

// Access metadata
const emailProp = User.type.props.get('email')
console.log(emailProp?.metadata.get('meta.label'))
// → 'Email Address'

// Validate data
const validator = User.validator()

const data: any = {
  name: 'A',
  email: 'not-an-email',
  age: -5,
}

if (validator.validate(data, true)) {
  console.log('Valid user:', data.name)
} else {
  console.log('Validation errors:')
  for (const err of validator.errors) {
    console.log(`  ${err.path}: ${err.message}`)
  }
}
```

Expected output:

```
Validation errors:
  name: Expected minimum length 2
  email: Expected valid email
  age: Expected minimum value 0
```

## Next Steps

- [Interfaces & Types](/packages/typescript/interfaces-types) — how interfaces and type aliases work in `.as` files
- [Annotations](/packages/typescript/annotations) — built-in annotations (`@meta.*`, `@expect.*`) and how to define custom ones
- [Primitives](/packages/typescript/primitives) — semantic type extensions like `string.email`, `number.positive`
- [Configuration](/packages/typescript/configuration) — custom annotations, primitives, and plugin options

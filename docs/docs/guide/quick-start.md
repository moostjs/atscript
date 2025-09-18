# Quick Start

This guide will walk you through creating your first Atscript file and using it in a TypeScript project.

## Create Your First .as File

Let's start with a simple product model. Create a file named `product.as`:

```atscript
// product.as
@meta.description 'Product in our catalog'
export interface Product {
    @meta.id
    id: string.uuid

    @meta.label 'Product Name'
    @expect.minLength 3
    @expect.maxLength 100
    name: string

    @meta.label 'Price in USD'
    @expect.min 0
    @expect.max 1000000
    price: number.positive

    @meta.label 'In Stock'
    inStock: boolean

    createdAt: string.isoDate
}
```

This concise example demonstrates:
- Interface annotation (`@meta.description`)
- Property metadata (`@meta.label`, `@meta.id`)
- Validation rules (`@expect.minLength`, `@expect.min`)
- Semantic types (`string.uuid`, `number.positive`, `string.isoDate`)

## Configuration

Create an `atscript.config.js` file in your project root:

```javascript
// atscript.config.js
import { defineConfig } from '@atscript/core'
import ts from '@atscript/typescript'

export default defineConfig({
  rootDir: 'src',
  format: 'dts',
  unknownAnnotation: 'error',
  plugins: [ts()],
})
```

### Configuration Options

- **`rootDir`** - Where your `.as` files are located
- **`format`** - Default output format (`dts` or `js`)
- **`unknownAnnotation`** - How to handle unknown annotations:
  - `'error'` - Treat as error (strict mode)
  - `'warn'` - Show warning but continue
  - `'allow'` - Accept any annotation (available in runtime)
- **`plugins`** - Active plugins (TypeScript plugin for JS/TS generation)

### VSCode Extension Integration

If you have the [Atscript VSCode extension](https://marketplace.visualstudio.com/items?itemName=moost.atscript-as) installed, it will:
- Automatically pick up this config file
- Generate `.d.ts` files for each `.as` file on save
- Enable smooth TypeScript integration
- Provide IntelliSense and error checking

## Manual Compilation (Alternative)

If you're not using the VSCode extension, use the `asc` CLI from `@atscript/typescript`:

::: code-group

```bash [Generate TypeScript definitions]
npx asc -f dts
```

```bash [Generate JavaScript with metadata]
npx asc -f js
```

:::

**Important**: Run `asc -f dts` at least once to generate `atscript.d.ts`. This file contains:
- All annotation types with proper TypeScript definitions
- Tag type definitions for IntelliSense
- Even unknown annotations (if using `'allow'` mode)

Add `atscript.d.ts` to your `tsconfig.json`:

```json
{
  "include": [
    "src/**/*",
    "atscript.d.ts"  // Add this line
  ]
}
```

## Bundler Integration

For build tools, install `unplugin-atscript`:

::: code-group

```bash [npm]
npm install -D unplugin-atscript
```

```bash [pnpm]
pnpm add -D unplugin-atscript
```

```bash [yarn]
yarn add -D unplugin-atscript
```

:::

Then configure your bundler:

::: code-group

```javascript [Vite]
// vite.config.js
import { defineConfig } from 'vite'
import atscript from 'unplugin-atscript'

export default defineConfig({
  plugins: [
    atscript.vite(),
    // other plugins...
  ],
})
```

```javascript [Rollup]
// rollup.config.js
import atscript from 'unplugin-atscript'

export default {
  plugins: [
    atscript.rollup(),
    // other plugins...
  ],
}
```

```javascript [esbuild]
// build.js
import { build } from 'esbuild'
import atscript from 'unplugin-atscript'

build({
  plugins: [atscript.esbuild()],
  // other options...
})
```

```javascript [Rolldown]
// rolldown.config.js
import atscript from 'unplugin-atscript'

export default {
  plugins: [
    atscript.rolldown(),
    // other plugins...
  ],
}
```

:::

## Using Atscript in TypeScript

Import and use your Atscript types in TypeScript:

```typescript
// app.ts
import { Product } from './product.as'

// 1. Use as a TypeScript type
const laptop: Product = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Gaming Laptop',
  price: 1299.99,
  inStock: true,
  createdAt: '2024-01-15T10:30:00Z'
}

// 2. Access property metadata
const nameProp = Product.type.props.get('name')
const nameLabel = nameProp?.metadata.get('meta.label')
console.log(nameLabel) // 'Product Name'

// 3. Access type tags
const idProp = Product.type.props.get('id')
const idTags = idProp?.type.tags
console.log(idTags) // ['uuid', 'string']

// 4. Runtime validation with type guard
const validator = Product.validator()

function processData(data: unknown) {
  // Safe validation - acts as type guard
  if (validator.validate(data, true)) {
    // TypeScript now knows 'data' is Product type
    console.log(`Product ${data.name} costs $${data.price}`)
    // data.name and data.price are fully typed!
  } else {
    console.log('Invalid product:', validator.errors)
  }
}

// 5. Unsafe validation (throws on error)
try {
  validator.validate(someData)
  // If we reach here, someData is valid
} catch (error) {
  console.error('Validation failed:', error.message)
}
```

### Key Points

- **Type Guard**: Safe validation (`validate(data, true)`) acts as a TypeScript type guard
- **Runtime Metadata**: All annotations are accessible at runtime
- **Type Tags**: Semantic types are preserved as tags for runtime inspection
- **Automatic Validation**: Semantic types like `string.email` automatically add validation rules

::: tip
Semantic types automatically add validation. For example:
- `string.email` adds email format validation
- `number.positive` adds `@expect.min 0`
- `string.uuid` adds UUID format validation

Learn more on the [Primitives](/guide/primitives) page.
:::

## Next Steps

- [Interfaces & Types](/guide/interfaces-types) - Define complex data structures
- [Primitives](/guide/primitives) - Explore semantic types
- [Annotations](/guide/annotations) - Learn the annotation system
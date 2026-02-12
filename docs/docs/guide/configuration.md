# Configuration

Atscript uses a configuration file to control parsing, validation, and code generation. This configuration is automatically picked up by:
- **VSCode extension** - For enhanced IntelliSense and real-time validation
- **Build tools** - When using `unplugin-atscript` with Vite, Rollup, Rolldown, etc.
- **CLI** - When running `asc` commands

## Configuration File

Create `atscript.config.js` in your project root. Supported formats:
- `atscript.config.js` - CommonJS
- `atscript.config.mjs` - ESM module
- `atscript.config.ts` - TypeScript (requires tsx/ts-node)
- `atscript.config.mts` - TypeScript ESM

## Basic Example

```javascript
// atscript.config.js
import { defineConfig } from '@atscript/core'
import ts from '@atscript/typescript'

export default defineConfig({
  rootDir: 'src',
  format: 'dts',
  unknownAnnotation: 'warn',
  plugins: [ts()]
})
```

## defineConfig Helper

The `defineConfig` helper provides type checking and IntelliSense:

```typescript
import { defineConfig } from '@atscript/core'

export default defineConfig({
  // Full type checking and autocomplete
})
```

## Configuration Options

### Input Options

#### `rootDir`
- **Type:** `string`
- **Required:** Yes
- **Description:** Root directory containing `.as` files

```javascript
rootDir: 'src'  // Look for .as files in src/
```

#### `entries`
- **Type:** `string[]`
- **Default:** All `.as` files in rootDir
- **Description:** Specific entry files to process

```javascript
entries: ['types/user.as', 'types/product.as']
```

#### `include`
- **Type:** `string[]`
- **Default:** `['**/*.as']`
- **Description:** Glob patterns for files to include

```javascript
include: ['**/*.as', '!**/*.test.as']
```

#### `exclude`
- **Type:** `string[]`
- **Default:** `['**/node_modules/**']`
- **Description:** Glob patterns for files to exclude

```javascript
exclude: ['**/temp/**', '**/*.draft.as']
```

#### `unknownAnnotation`
- **Type:** `'allow' | 'warn' | 'error'`
- **Default:** `'error'`
- **Description:** How to handle unknown annotations

```javascript
unknownAnnotation: 'allow'  // Accept any annotation
unknownAnnotation: 'warn'   // Warn but continue
unknownAnnotation: 'error'  // Treat as error (strict)
```

#### `primitives`
- **Type:** `Record<string, PrimitiveConfig>`
- **Description:** Custom primitive types and extensions

```javascript
primitives: {
  string: {
    extensions: {
      url: {
        type: 'string',
        documentation: 'URL format',
        expect: {
          pattern: ['^https?://.+$', '', 'Invalid URL']
        }
      }
    }
  }
}
```

#### `annotations`
- **Type:** `AnnotationsTree`
- **Description:** Custom annotation definitions

```javascript
import { AnnotationSpec } from '@atscript/core'

annotations: {
  ui: {
    hidden: new AnnotationSpec({
      description: 'Hide field in UI',
      nodeType: ['prop']
    })
  }
}
```

`AnnotationSpec` accepts the following options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `description` | `string` | — | Documentation shown in IntelliSense |
| `argument` | `object \| object[]` | — | Argument definition(s) with `name`, `type`, optional `values` |
| `nodeType` | `string[]` | — | Restrict to node types (e.g., `['prop']`, `['interface']`) |
| `multiple` | `boolean` | `false` | Allow the annotation to appear more than once on the same node. Values are stored as arrays |
| `mergeStrategy` | `'replace' \| 'append'` | `'replace'` | How same-named annotations combine during [merging](/guide/annotations#merge-strategies). Only relevant when `multiple: true` |

::: tip
When `multiple: true` and `mergeStrategy: 'replace'` (the default), the higher-priority set of values replaces the lower-priority set entirely. With `mergeStrategy: 'append'`, values from both sides are concatenated.
:::

#### `plugins`
- **Type:** `Plugin[]`
- **Description:** Active plugins for code generation

```javascript
import ts from '@atscript/typescript'
import mongo from '@atscript/mongo'

plugins: [
  ts(),
  mongo({ syncIndexes: true })
]
```

### Output Options

#### `format`
- **Type:** `string`
- **Default:** `'dts'`
- **Description:** Output format that plugins should generate

```javascript
format: 'dts'   // TypeScript plugin: Generate .d.ts files
format: 'js'    // TypeScript plugin: Generate .js files with metadata
format: 'py'    // Python plugin (hypothetical): Generate .py files
```

The format is an open string field - each plugin decides which formats to support:
- **@atscript/typescript**: Supports `'dts'` and `'js'`
- Other plugins define their own supported formats

::: info Format Usage
- **VSCode extension**: Uses this setting to determine what files to generate on save
- **asc CLI**: Uses this setting by default (overridden by `-f` flag if provided)
- **unplugin-atscript**: Ignores this setting (always generates what the bundler needs)
:::

#### `outDir`
- **Type:** `string`
- **Default:** Same as source directory
- **Description:** Output directory for generated files

```javascript
outDir: 'dist'  // Output to dist/ instead of source location
```

## Complete Example

```javascript
// atscript.config.js
import { defineConfig, AnnotationSpec } from '@atscript/core'
import ts from '@atscript/typescript'
import mongo from '@atscript/mongo'

export default defineConfig({
  // Input configuration
  rootDir: 'src',
  entries: undefined,  // Process all .as files
  include: ['**/*.as'],
  exclude: ['**/*.test.as', '**/drafts/**'],

  // Validation
  unknownAnnotation: 'warn',

  // Custom primitives
  primitives: {
    string: {
      extensions: {
        objectId: {
          type: 'string',
          documentation: 'MongoDB ObjectId',
          expect: {
            pattern: ['^[0-9a-f]{24}$', 'i', 'Invalid ObjectId']
          }
        }
      }
    }
  },

  // Custom annotations
  annotations: {
    api: {
      endpoint: new AnnotationSpec({
        description: 'API endpoint path',
        argument: {
          name: 'path',
          type: 'string'
        }
      }),
      method: new AnnotationSpec({
        description: 'HTTP method',
        argument: {
          name: 'verb',
          type: 'string',
          values: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
        }
      })
    }
  },

  // Plugins
  plugins: [
    ts({
      // TypeScript plugin options
    }),
    mongo({
      // MongoDB plugin options
      syncIndexes: true,
      connectionUrl: process.env.MONGO_URL
    })
  ],

  // Output configuration
  format: 'js',  // Generate JavaScript with metadata
  outDir: undefined  // Output alongside source files
})
```

## TypeScript Configuration

For TypeScript config files (`atscript.config.ts`):

```typescript
// atscript.config.ts
import { defineConfig } from '@atscript/core'
import ts from '@atscript/typescript'

export default defineConfig({
  rootDir: 'src',
  plugins: [ts()]
  // Full type checking and autocomplete provided by defineConfig
})
```

Or without `defineConfig` (manually typed):

```typescript
// atscript.config.ts
import type { TAtscriptConfig } from '@atscript/core'
import ts from '@atscript/typescript'

const config: TAtscriptConfig = {
  rootDir: 'src',
  plugins: [ts()]
}

export default config
```

## Integration Points

### VSCode Extension
The VSCode extension automatically:
1. Detects configuration file changes
2. Updates IntelliSense for annotations
3. Validates annotations in real-time
4. Generates files based on format setting
5. Applies unknownAnnotation rules

### Build Tools (unplugin-atscript)
When using `unplugin-atscript` with Vite, Rollup, or Rolldown:
1. Reads the configuration file
2. Applies all plugins defined in the config
3. Processes files according to include/exclude patterns
4. Generates output based on format settings
5. Respects all custom primitives and annotations

```javascript
// vite.config.js
import atscript from 'unplugin-atscript'

export default {
  plugins: [
    atscript.vite()  // Uses atscript.config.js automatically
  ]
}
```

## Config File Lookup

### VSCode Extension
Looks for the nearest config file starting from the `.as` file location:
1. Check the folder containing the `.as` file
2. Check parent folder
3. Continue up the directory tree until workspace root is reached

### Build Tools (unplugin-atscript)
Similar lookup strategy:
1. Start from the `.as` file location
2. Search upward through parent directories
3. Stop at current working directory (cwd)

This allows for monorepo setups where different packages can have their own Atscript configurations.

## Loading Priority

When multiple config formats exist in the same directory:
1. `atscript.config.ts` / `atscript.config.mts`
2. `atscript.config.js` / `atscript.config.mjs`
3. Default configuration if no file found

## Next Steps

- [Build Setup](/guide/build-setup) - Integrate with build tools
- [Quick Start](/guide/quick-start) - Complete setup guide
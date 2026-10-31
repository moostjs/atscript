Atscript uses a configuration file to control parsing, validation, and code generation. This configuration is automatically picked up by:

- **VSCode extension** - For enhanced IntelliSense and real-time validation
- **Build tools** - When using `unplugin-atscript` with Vite, Rollup, Rolldown, etc.
- **CLI** - When running `asc` commands

## Configuration File

Create `atscript.config.js` in your project root. Supported formats:

- `atscript.config.js` - CommonJS
- `atscript.config.mjs` - ESM module
- `atscript.config.cjs` - Explicit CommonJS
- `atscript.config.ts` - TypeScript (bundled with rolldown)
- `atscript.config.mts` - TypeScript ESM
- `atscript.config.cts` - TypeScript CommonJS

When multiple formats coexist in the same directory, TypeScript variants (`.ts` / `.mts` / `.cts`) take precedence over JavaScript variants.

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
- **Default:** Config file's directory (or `process.cwd()` if no config file)
- **Description:** Root directory containing `.as` files

```javascript
rootDir: 'src' // Look for .as files in src/
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
- **Default:** `['node_modules']`
- **Description:** Glob patterns for files to exclude

```javascript
exclude: ['**/temp/**', '**/*.draft.as']
```

#### `unknownAnnotation`

- **Type:** `'allow' | 'warn' | 'error'`
- **Default:** `'error'`
- **Description:** How to handle unknown annotations

```javascript
unknownAnnotation: 'allow' // Accept any annotation
unknownAnnotation: 'warn' // Warn but continue
unknownAnnotation: 'error' // Treat as error (strict)
```

An annotation without a spec (accepted with `'allow'` / `'warn'`) keeps only its **first argument** at runtime, as written: a string, a number, `true` / `false` / `null` / `undefined`, any other name (`User`, `User.email`) or a backtick argument as the string of its source, an empty argument (`@x , 'y'`) as `undefined`. Written more than once on the same node, or with several arguments, its value is a list (of the first arguments). Its shape is decided where it is written: an `annotate` entry (mutating or `annotate … as`) overriding it on a prop gives the prop the entry's occurrences — written once, a single value; more than once, a list — whatever the target wrote, like a hand-written copy declaring them, and so does everything built from the alias (`extends`, an intersection, an alias of it). A prop inherited through `extends` has the same metadata in the interface inheriting it, whichever file declares that interface. Declare a spec (see [custom annotations](/packages/typescript/custom-annotations)) to keep every argument or to reference a type.

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
        annotations: {
          'expect.pattern': {
            pattern: '^https?://.+$',
            message: 'Invalid URL'
          }
        }
      },
      coord: {
        type: 'number',
        documentation: 'Geographic coordinate',
        annotations: {
          'expect.min': -180,
          'expect.max': 180
        }
      }
    }
  }
}
```

::: tip Annotations map
Custom primitives apply implicit annotations via the `annotations` map. Each key is the annotation name (e.g., `'expect.pattern'`, `'expect.min'`); each value matches the annotation's argument shape — a single primitive for one-argument annotations, an object keyed by argument name when there are multiple arguments, or an array when the annotation is repeatable. The legacy `expect: { ... }` shape was removed.
:::

#### `annotations`

- **Type:** `AnnotationsTree`
- **Description:** Custom annotation definitions

```javascript
import { AnnotationSpec } from '@atscript/core'

annotations: {
  ui: {
    hidden: new AnnotationSpec({
      description: 'Hide field in UI',
      nodeType: ['prop'],
    })
  }
}
```

`AnnotationSpec` accepts the following options:

| Option          | Type                    | Default     | Description                                                                                 |
| --------------- | ----------------------- | ----------- | ------------------------------------------------------------------------------------------- |
| `description`   | `string`                | —           | Documentation shown in IntelliSense                                                         |
| `argument`      | `object \| object[]`    | —           | Argument definition(s) with `name`, `type`, optional `values`                               |
| `nodeType`      | `string[]`              | —           | Restrict to node types (e.g., `['prop']`, `['interface']`)                                  |
| `multiple`      | `boolean`               | `false`     | Allow the annotation to appear more than once on the same node. Values are stored as arrays |
| `mergeStrategy` | `'replace' \| 'append'` | `'replace'` | How same-named annotations combine during merging. Only relevant when `multiple: true`      |

::: tip
When `multiple: true` and `mergeStrategy: 'replace'` (the default), the higher-priority set of values replaces the lower-priority set entirely. With `mergeStrategy: 'append'`, values from both sides are concatenated.
:::

#### `plugins`

- **Type:** `Plugin[]`
- **Description:** Active plugins for code generation

```javascript
import ts from '@atscript/typescript'

plugins: [ts()]
```

Plugins from external ecosystems follow the same pattern — e.g. database plugins like `@atscript/db-*` live in a [separate repo](https://db.atscript.dev) and are imported the same way.

### Output Options

#### `format`

- **Type:** `string`
- **Default:** Plugin-dependent (the TypeScript plugin emits `.d.ts` when `format` is unset or set to `'dts'`; pass `'js'` to emit runtime metadata instead)
- **Description:** Output format that plugins should generate

```javascript
format: 'dts' // TypeScript plugin: Generate .d.ts files
format: 'js' // TypeScript plugin: Generate .js files with metadata
```

The format is an open string field - each plugin decides which formats to support.

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
outDir: 'dist' // Output to dist/ instead of source location
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

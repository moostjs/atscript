# VSCode & Build Integration

Once your plugin is built and tested, you need to integrate it with the developer toolchain — the CLI, build tools, and the VSCode extension. This page covers how each tool triggers code generation and how your plugin fits in.

## Three Entry Points

Code generation flows through the same `build()` → `generate()` → `write()` pipeline regardless of how it's triggered:

| Entry Point | Trigger | Formats |
| --- | --- | --- |
| **CLI** (`asc`) | Manual invocation | `DEFAULT_FORMAT` when no `-f` flag; any format via `-f` |
| **Build tools** (unplugin) | File change during build/dev | `'js'` (configured in unplugin) |
| **VSCode extension** | File save | `DEFAULT_FORMAT` |

All three discover your plugin through `atscript.config.ts` and call `render(doc, format)` on every registered plugin.

## The `DEFAULT_FORMAT` Constant

`@atscript/core` exports a well-known format constant called `DEFAULT_FORMAT`. This is the format passed to `render()` and `buildEnd()` when:

- A `.as` file is **saved in VSCode** (or any editor with Atscript support)
- The CLI is run **without a `-f` flag** (`npx asc`)

Every plugin that produces output essential for the development experience should handle `DEFAULT_FORMAT` alongside its own named formats:

```typescript
import { createAtscriptPlugin, DEFAULT_FORMAT } from '@atscript/core'

export const myPlugin = () => createAtscriptPlugin({
  name: 'my-plugin',

  render(doc, format) {
    if (format === 'myformat' || format === DEFAULT_FORMAT) {
      // Generate the primary output for this plugin
      return [{ fileName: `${doc.name}.ext`, content: generate(doc) }]
    }
  },
})
```

This way, when a user saves a file in their editor, **all plugins** generate their primary output automatically — not just a single hardcoded format.

::: tip When to handle DEFAULT_FORMAT
Handle `DEFAULT_FORMAT` for output that developers need continuously during editing — type declarations, type stubs, schema files. Don't handle it for expensive or one-off outputs like bundled runtime code or documentation generation — those should only run via explicit CLI invocation with `-f`.
:::

## CLI Usage

The Atscript CLI (`asc`) triggers code generation. When called without `-f`, it uses `DEFAULT_FORMAT`, which triggers every plugin's primary output:

```bash
# Generate all plugins' default output
npx asc

# Generate with a specific format
npx asc -f myformat

# Generate TypeScript declarations only
npx asc -f dts

# Generate JavaScript runtime only
npx asc -f js

# Specify a config file
npx asc -c path/to/atscript.config.ts -f myformat

# Check diagnostics without generating files
npx asc --noEmit
```

When `-f` is provided, it's passed directly to `render(doc, format)` as the format string. Your plugin only needs to handle the format strings it cares about:

```typescript
render(doc, format) {
  if (format === 'myformat' || format === DEFAULT_FORMAT) {
    return [{ fileName: `${doc.name}.ext`, content: generate(doc) }]
  }
  // Return nothing for other formats
}
```

### Watch Mode

The CLI doesn't have a built-in `--watch` flag. For file-watching, use a tool like `chokidar-cli` or `nodemon`:

```bash
# Using chokidar
npx chokidar "src/**/*.as" -c "npx asc -f myformat"

# Using nodemon
npx nodemon --watch src --ext as --exec "npx asc -f myformat"
```

## Build Tool Integration (unplugin)

The `unplugin-atscript` package integrates Atscript into Vite, Rollup, Webpack, Rspack, esbuild, and other bundlers. It transforms `.as` imports into JavaScript at build time.

### Setup

```bash
npm install -D unplugin-atscript @atscript/typescript
```

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import atscript from 'unplugin-atscript'

export default defineConfig({
  plugins: [atscript.vite()],
})
```

### How It Works

1. When your bundler encounters an `import { User } from './user.as'`, the unplugin intercepts it
2. It loads the Atscript config (including your plugin) and parses the `.as` file
3. It calls `render(doc, 'js')` to generate JavaScript output
4. The generated JS is passed to the bundler as the module content

Your plugin participates automatically — if it produces output for `format === 'js'`, that output is included in the bundle. If your plugin only handles custom formats (not `'js'`), it still runs `config()` to contribute primitives and annotations, but `render()` won't produce output during the build.

### Supported Bundlers

| Bundler | Plugin call |
| --- | --- |
| Vite | `atscript.vite()` |
| Rollup | `atscript.rollup()` |
| Rolldown | `atscript.rolldown()` |
| Webpack | `atscript.webpack()` |
| Rspack | `atscript.rspack()` |
| esbuild | `atscript.esbuild()` |
| Farm | `atscript.farm()` |

## VSCode Extension On-Save

The Atscript VSCode extension triggers code generation on every save of a `.as` file. It passes `DEFAULT_FORMAT` to the build pipeline, so every registered plugin that handles `DEFAULT_FORMAT` generates its output automatically.

### How It Works

When you save a `.as` file in VSCode:

1. The extension's language server receives the `textDocument/didSave` notification
2. It opens the document and resolves the `atscript.config`
3. It creates a `BuildRepo` for just the saved file
4. It calls `bld.write({ format: DEFAULT_FORMAT })` — triggering all plugins' primary output

This means your plugin's `render()` hook fires on every save, as long as it handles `DEFAULT_FORMAT`. The TypeScript plugin generates `.d.ts` files, a hypothetical Python plugin could generate `.pyi` stubs, and your custom plugin generates whatever it needs — all from the same save event.

### What Not to Generate On-Save

On-save generation should be fast and produce only what's needed for the development experience. Avoid handling `DEFAULT_FORMAT` for:

- Expensive computations (full bundled runtime code)
- Large aggregate outputs (project-wide manifests)
- Outputs that don't affect the editing experience

For those, provide a separate named format that users trigger via `npx asc -f myformat`.

## Package Distribution

When publishing your plugin as an npm package:

### Package Structure

```
my-atscript-plugin/
  src/
    plugin.ts          # Plugin factory function
    index.ts           # Re-export
  dist/
    index.mjs          # ESM build
    index.cjs          # CJS build
    index.d.ts         # Type declarations
  package.json
```

### package.json

```json
{
  "name": "atscript-plugin-myformat",
  "version": "1.0.0",
  "main": "dist/index.cjs",
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts",
  "peerDependencies": {
    "@atscript/core": ">=0.1.0"
  },
  "devDependencies": {
    "@atscript/core": "^0.1.0",
    "vitest": "^2.0.0"
  }
}
```

### Key Points

- Declare `@atscript/core` as a **peer dependency** — users must install it alongside your plugin
- Export a **factory function** (not a plugin instance) so users call `myPlugin()` in their config
- Use `createAtscriptPlugin()` for type safety
- Follow the naming convention: `atscript-plugin-*` or `@scope/atscript-plugin-*`

### User Configuration

Users add your plugin to their `atscript.config.ts`:

```typescript
import { defineConfig } from '@atscript/core'
import { tsPlugin } from '@atscript/typescript'
import { myPlugin } from 'atscript-plugin-myformat'

export default defineConfig({
  rootDir: 'src',
  plugins: [tsPlugin(), myPlugin()],
})
```

And run generation:

```bash
# All plugins' default output
npx asc

# Only your specific format
npx asc -f myformat
```

## Summary

| Feature | CLI | Build Tools | VSCode |
| --- | --- | --- | --- |
| `DEFAULT_FORMAT` | When no `-f` flag | No | On save |
| Custom formats | Any (`-f` flag) | `'js'` only | No |
| Primitives & annotations | Active | Active | Active |
| Diagnostics | Via `--noEmit` | On error | Real-time |
| File watching | Via external tools | Built-in (HMR) | On save |
| Output writing | Automatic | In-memory (bundled) | Automatic |

Your plugin's primitives and annotations work everywhere — the editor provides IntelliSense and validation regardless of which formats your plugin generates. Code generation is triggered differently depending on the tool, but the `render()` hook works identically in all cases.

## Next Steps

- [Overview](/plugin-development/) — back to the guide start
- [Building a Code Generator](/plugin-development/code-generation) — the render() hook in detail
- [Testing Plugins](/plugin-development/testing-plugins) — verify everything works before publishing

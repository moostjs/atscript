# Configuration

The VSCode extension does not have its own settings. Instead, it uses the same `atscript.config.*` file as the rest of the Atscript toolchain.

## Config File

The extension looks for a configuration file named `atscript.config` with one of these extensions (checked in this order):

- `.js`, `.mjs`, `.cjs`
- `.ts`, `.mts`, `.cts`

The config file is resolved by walking up the directory tree from the `.as` file's location. This means different subdirectories in a monorepo can have different configurations.

### Minimal Example

```js
// atscript.config.js
import { defineConfig } from '@atscript/core'

export default defineConfig({
  // your configuration here
})
```

For full configuration options, see the [Configuration reference](/packages/typescript/configuration).

## What Configuration Affects

The config file controls what the extension knows about your project:

- **Annotations** — which annotations are available for completions and validation
- **Primitives** — which primitive types are recognized
- **Plugins** — extensions that add custom annotations and primitives (e.g., `@atscript/mongo`)

Without a config file, the extension uses the default set of annotations and primitives from `@atscript/core`.

## Config Reloading

The extension watches for changes to `atscript.config.*` files. When you modify your config, the language server reloads automatically — no need to restart VSCode.

If a config file fails to load (syntax error, missing dependency, etc.), the extension falls back to defaults and will retry when the file is fixed.

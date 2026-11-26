# Configuration

The VSCode extension does not have its own settings. Instead, it uses the same `atscript.config.*` file as the rest of the Atscript toolchain.

## Config File

The extension looks for a configuration file named `atscript.config` with one of these extensions:

- `.js`, `.mjs`, `.cjs`, `.ts`, `.mts`, `.cts`

JS variants are checked before TS variants in each directory. The config file is resolved by walking up the directory tree from the `.as` file's location. This means different subdirectories in a monorepo can have different configurations.

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
- **Plugins** — extensions that add custom annotations and primitives (e.g., `@atscript/db-mongo`)

Without a config file, the extension uses the default set of annotations and primitives from `@atscript/core`.

## Config Reloading

The extension watches `atscript.config.*` files in any format and re-checks the affected `.as` files — no need to restart VSCode:

- **Edited** — the files under the config use its new content. A `.ts` / `.mts` / `.cts` config is bundled with the files it imports by a relative path, so an edit of those is seen when the config reloads (saving only such a file does not reload it). A module that a `.js` / `.mjs` / `.cjs` config imports by a relative path is loaded once: after editing it, run **"Atscript: Restart Language Server"**.
- **Created** — a config closer to a `.as` file than the one it used takes over for the files under its folder.
- **Deleted** — those files use the next config up the directory tree again, or the built-in defaults.

If a config file fails to load (syntax error, missing dependency, etc.), the extension logs the error once and falls back to defaults until the config file changes or the editor restarts. After installing or building a missing dependency, save the config file (or run **"Atscript: Restart Language Server"**).

A package the config imports (a plugin from `node_modules` or a workspace package) is loaded once per language server. After rebuilding a plugin package the config already loaded, run **"Atscript: Restart Language Server"**.

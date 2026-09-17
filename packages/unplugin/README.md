<p align="center">
  <img src="https://atscript.dev/logo.svg" alt="Atscript" width="120" />
</p>

<h1 align="center">unplugin-atscript</h1>

<p align="center">
  <strong>Define your models once</strong> — get TypeScript types, runtime validation, and DB metadata from a single <code>.as</code> model.
</p>

<p align="center">
  <a href="https://atscript.dev">Documentation</a> · <a href="https://atscript.dev/packages/typescript/build-setup">Build Setup Guide</a>
</p>

---

Build tool plugin that compiles `.as` files during development. Works with Vite, Webpack, Rollup, Rolldown, esbuild, Rspack, and Farm via [Unplugin](https://unplugin.unjs.io/).

## Installation

```bash
pnpm add -D unplugin-atscript @atscript/typescript @atscript/core
```

## Quick Start

```ts
// vite.config.ts
import atscript from 'unplugin-atscript/vite'
export default { plugins: [atscript()] }

// rollup.config.js
import atscript from 'unplugin-atscript/rollup'
export default { plugins: [atscript()] }

// webpack.config.js
const atscript = require('unplugin-atscript/webpack')
module.exports = { plugins: [atscript()] }
```

Also available: `unplugin-atscript/esbuild`, `unplugin-atscript/rolldown`, `unplugin-atscript/rspack`, `unplugin-atscript/farm`.

## Options

Same options on every bundler entry:

| Option   | Type      | Default             | Effect                                                                                 |
| -------- | --------- | ------------------- | -------------------------------------------------------------------------------------- |
| `strict` | `boolean` | `true`              | Fail the build on parse/diagnostic **errors**. `false` = log errors but keep building. |
| `root`   | `string`  | bundler root or cwd | Directory `atscript.config.*` is discovered from. Absolute, or relative to the cwd.    |

Vite picks the root up automatically (from `configResolved`); other bundlers need `root` when the working directory is not the project root.

## Features

- Universal bundler support via dedicated entry points
- Automatic `atscript.config.*` loading
- Strict validation — build fails on `.as` errors by default (`strict: false` to disable)
- Tree-shaking aware — marks non-mutating modules as side-effect-free
- On Vite, prebundles `@atscript/typescript/utils` so the first `.as`-backed route does not trigger a dep re-optimization reload

## Documentation

- [Build Setup Guide](https://atscript.dev/packages/typescript/build-setup)
- [Full Documentation](https://atscript.dev)

## License

MIT

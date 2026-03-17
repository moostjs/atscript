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

## Features

- Universal bundler support via dedicated entry points
- Automatic `atscript.config.*` loading
- Strict validation — build fails on `.as` errors by default (`strict: false` to disable)
- Tree-shaking aware — marks non-mutating modules as side-effect-free

## Documentation

- [Build Setup Guide](https://atscript.dev/packages/typescript/build-setup)
- [Full Documentation](https://atscript.dev)

## License

MIT

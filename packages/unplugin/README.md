# Atscript Unplugin

An Unplugin for processing `.as` files using [Atscript](https://github.com/moostjs/atscript). This plugin enables seamless integration of Atscript into modern build tools like Vite and Rollup. Thanks to Unplugin, it also supports Webpack and other bundlers.

## Features

- Supports `.as` file resolution and transformation
- Loads and processes `.as` files with Atscript
- Generates JavaScript output
- Compatible with Vite, Rollup, Rolldown, Webpack, Rspack, esbuild, and Farm
- Separate entry point for each bundler — import only what you need

## Installation

```sh
npm install -D unplugin-atscript @atscript/typescript
```

or

```sh
yarn add --dev unplugin-atscript @atscript/typescript
```

or

```sh
pnpm add -D unplugin-atscript @atscript/typescript
```

## Usage

### Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import atscript from 'unplugin-atscript/vite'

export default defineConfig({
  plugins: [atscript()],
})
```

### Rollup

```ts
// rollup.config.js
import atscript from 'unplugin-atscript/rollup'

export default {
  input: 'src/main.ts',
  output: {
    dir: 'dist',
    format: 'esm',
  },
  plugins: [atscript()],
}
```

### Webpack

```js
// webpack.config.js
const atscript = require('unplugin-atscript/webpack')

module.exports = {
  plugins: [atscript()],
}
```

### esbuild

```js
import atscript from 'unplugin-atscript/esbuild'
import { build } from 'esbuild'

build({
  plugins: [atscript()],
})
```

### Rolldown

```js
import atscript from 'unplugin-atscript/rolldown'

export default {
  plugins: [atscript()],
}
```

### Rspack / Farm

Use `unplugin-atscript/rspack` or `unplugin-atscript/farm` respectively — same pattern as above.

## How It Works

1. Resolves `.as` files in the project.
2. Loads the Atscript configuration.
3. Uses `@atscript/core` and `@atscript/typescript` to parse and transform `.as` files into JavaScript.
4. Outputs the generated JavaScript for further processing.

## Configuration

The plugin automatically loads the Atscript configuration from your project. You can define additional options in your Atscript configuration file (`atscript.config.{js,mjs,cjs,ts,mts,cts}`).

### Plugin Options

| Option   | Type      | Default | Description                                                        |
| -------- | --------- | ------- | ------------------------------------------------------------------ |
| `strict` | `boolean` | `true`  | When `true`, throws an error if any `.as` document has diagnostics |

## License

ISC

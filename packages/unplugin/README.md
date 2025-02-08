# Atscript Unplugin

An Unplugin for processing `.as` files using [Atscript](https://github.com/moostjs/atscript). This plugin enables seamless integration of Atscript into modern build tools like Vite and Rollup. Thanks to Unplugin, it also supports Webpack and other bundlers.

## Features

- Supports `.as` file resolution and transformation
- Loads and processes `.as` files with Atscript
- Generates JavaScript output
- Compatible with Vite, Rollup, and other Unplugin-supported bundlers

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
import atscript from 'unplugin-atscript'

export default defineConfig({
  plugins: [atscript.vite()],
})
```

### Rollup

```ts
// rollup.config.js
import atscript from 'unplugin-atscript'

export default {
  input: 'src/main.ts',
  output: {
    dir: 'dist',
    format: 'esm',
  },
  plugins: [atscript.rollup()],
}
```

## How It Works

1. Resolves `.as` files in the project.
2. Loads the Atscript configuration.
3. Uses `@atscript/core` to parse and transform `.as` files into JavaScript.
4. Outputs the generated JavaScript for further processing.

## Configuration

The plugin automatically loads the Atscript configuration from your project. You can define additional options in your Atscript configuration file (`atscript.config.js` or `atscript.config.ts`).

## License

MIT

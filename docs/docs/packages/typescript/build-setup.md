# Build Setup

Integrate Atscript into your build process using `unplugin-atscript`. This plugin automatically compiles `.as` files during the build, using your [configuration file](/packages/typescript/configuration).

## Installation

```bash
npm install -D unplugin-atscript
```

## Vite — Node.js Library

The most common setup: build a Node.js library with external dependencies. The plugin compiles `.as` files while Vite handles bundling.

```javascript
// vite.config.js
import { defineConfig } from 'vite'
import atscript from 'unplugin-atscript/vite'

export default defineConfig({
  plugins: [atscript()],
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
    },
    rollupOptions: {
      external: [/node_modules/],
    },
  },
})
```

## Vite — UI Application

For frontend projects (e.g. Vue, React), add the Atscript plugin alongside your framework plugin:

```javascript
// vite.config.js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import atscript from 'unplugin-atscript/vite'

export default defineConfig({
  plugins: [atscript(), vue()],
})
```

This lets you import `.as` types directly in your components — for example, to drive form rendering from metadata or validate user input against your type definitions.

## Other Bundlers

`unplugin-atscript` supports all major bundlers. Import from the bundler-specific entry point:

::: code-group

```javascript [Rollup]
// rollup.config.js
import atscript from 'unplugin-atscript/rollup'

export default {
  plugins: [atscript()],
}
```

```javascript [esbuild]
// build.js
import { build } from 'esbuild'
import atscript from 'unplugin-atscript/esbuild'

build({
  plugins: [atscript()],
  entryPoints: ['src/index.ts'],
  bundle: true,
  outdir: 'dist',
})
```

```javascript [Rolldown]
// rolldown.config.js
import atscript from 'unplugin-atscript/rolldown'

export default {
  plugins: [atscript()],
}
```

:::

## How It Works

1. **Config Discovery** — the plugin finds your `atscript.config.js` by searching upward from each `.as` file
2. **Plugin Execution** — runs all plugins defined in your configuration
3. **File Generation** — generates JavaScript output for the bundler (ignores `format` setting)
4. **Import Resolution** — allows importing `.as` files directly in TypeScript/JavaScript

In development, the plugin compiles on-demand with hot module replacement. In production, it pre-compiles during the build for optimal performance.

## Next Steps

- [Configuration](/packages/typescript/configuration) — config file options
- [CLI](/packages/typescript/cli) — build from the command line

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

```javascript [Webpack]
// webpack.config.js
import atscript from 'unplugin-atscript/webpack'

export default {
  plugins: [atscript()],
}
```

```javascript [Rspack]
// rspack.config.js
import atscript from 'unplugin-atscript/rspack'

export default {
  plugins: [atscript()],
}
```

```javascript [Farm]
// farm.config.js
import atscript from 'unplugin-atscript/farm'

export default {
  plugins: [atscript()],
}
```

:::

## Options

The plugin takes the same options on every bundler entry. There is just one:

| Option   | Type      | Default | Effect                                                                                     |
| -------- | --------- | ------- | ------------------------------------------------------------------------------------------ |
| `strict` | `boolean` | `true`  | Fail the build on parse/diagnostic **errors**. `false` = log errors but keep building.     |

```javascript
atscript({ strict: false }) // warn-only — useful mid-refactor or in CI pre-flight
```

With `strict: false`, a `.as` file that fails to compile yields an empty module (`module.exports = {}`), so anything importing it will likely break at runtime — keep `strict: true` for normal builds.

Everything else (primitives, annotations, plugins, `include`/`exclude`) lives in [`atscript.config.*`](/packages/typescript/configuration), which the plugin auto-discovers. The plugin only intercepts `*.as` imports; per-file filtering is delegated to the bundler.

## How It Works

1. **Config Discovery** — the plugin finds your `atscript.config.*` by searching upward from each `.as` file
2. **Plugin Execution** — runs the plugins defined in your configuration
3. **Runtime JS** — for each imported `.as` it emits the runtime metadata module (the same output as `asc -f js`)
4. **Import Resolution** — lets you import `.as` files directly in TypeScript/JavaScript

In development the plugin compiles on demand with hot module replacement (native on Vite/Webpack/Rspack/Farm; via watch mode on Rollup/Rolldown). In production it pre-compiles during the build.

::: warning Types are not emitted by the bundler plugin
`unplugin-atscript` produces **runtime JS only** — it never writes `.as.d.ts` or the project-level `atscript.d.ts`. For type checking and IDE support, generate types with the [CLI](/packages/typescript/cli): `asc -f dts` (e.g. as a `postinstall` and pre-build step), or let the [VSCode extension](/packages/vscode/) regenerate them on save.
:::

## Bundling for Production

`@atscript/typescript` ships two entries: the default `tsPlugin()` factory (build-time only) and `@atscript/typescript/utils` (runtime helpers like `Validator`, `ValidatorError`, `isAnnotatedType`). If you externalize `@atscript/typescript` to keep build-time code out of your bundle, you **must also externalize `@atscript/typescript/utils`** — otherwise the runtime helpers get inlined into your bundle while downstream consumers (`@atscript/moost-validator`, plugins, your own code) import them from `node_modules`. Two copies of `ValidatorError` means `instanceof` returns `false`, error interceptors silently miss validation errors, and they escape as 500s.

The simplest fix is to externalize the whole namespace so every subpath comes along:

```typescript
// rollup / rolldown / esbuild / rspack config
export default {
  external: [/^@atscript\//],
}
```

The same applies to subpath imports from any other `@atscript/*` package.

## Next Steps

- [Configuration](/packages/typescript/configuration) — config file options
- [CLI](/packages/typescript/cli) — build from the command line

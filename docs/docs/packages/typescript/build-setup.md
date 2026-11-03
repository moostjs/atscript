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

Three things happen automatically on Vite:

- **Project root** — the plugin adopts Vite's own `root`, so `atscript.config.*` is discovered from the directory Vite builds, not from the directory the process happened to start in (`pnpm -C`, editor-launched dev servers). On other bundlers pass [`root`](#options) yourself when the two differ.
- **Dependency prebundling** (since `0.1.90`) — the generated `.as` module imports `@atscript/typescript/utils`, which Vite's static scanner cannot see because the module body only exists after the plugin compiles it. The plugin adds the entry to `optimizeDeps.include` so Vite prebundles it up front, instead of discovering it on the first `.as`-backed route and interrupting a client-side navigation with `optimized dependencies changed. reloading`. Adding that entry manually is no longer needed.
- **Watch invalidation** (since `0.1.92`) — on a file change the plugin drops the changed `.as` file from its document cache and, on every compile, registers each transitive `.as` import as a watch file. A dependant is therefore re-checked against the new definition on the next reload, and it is invalidated even when the import leaves no JS import behind (an unused symbol, or a type only read through `extends`/annotation chains). Before `0.1.92`, a referenced model that changed type or moved to another file could stay stale in a long-running dev server — the dependant kept failing to reload until the server was restarted.

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

The plugin takes the same options on every bundler entry:

| Option   | Type      | Default             | Effect                                                                                 |
| -------- | --------- | ------------------- | -------------------------------------------------------------------------------------- |
| `strict` | `boolean` | `true`              | Fail the build on parse/diagnostic **errors**. `false` = log errors but keep building. |
| `root`   | `string`  | bundler root or cwd | Directory `atscript.config.*` is discovered from. Absolute, or relative to the cwd.    |
| `compileValidators` | `boolean \| 'ssr'` | from `atscript.config` | Overrides [`compileValidators`](/packages/typescript/configuration#compilevalidators) for the modules this plugin compiles. `'ssr'` compiles only Vite's server (SSR) build. See [Compiled Validators](/packages/typescript/compiled-validators#per-build-override-in-unplugin-atscript). |
| `loadCheck` | `boolean` | auto | The build's load check (see [Import cycles](#import-cycles-need-native-es-modules)): `true` checks every build of this plugin, `false` none. Unset: one-shot Vite, Rollup and Rolldown builds check; watch builds (`vite build --watch`, `rollup -w`, `rolldown --watch`), the dev server and HMR do not; esbuild, webpack, Rspack and Farm do not (they do not report a build apart from a watch). |

```javascript
atscript({ strict: false }) // warn-only — useful mid-refactor or in CI pre-flight
atscript({ root: __dirname }) // non-Vite bundler started from another directory
atscript({ compileValidators: 'ssr' }) // Vite SSR app: compiled checks on the server only
atscript({ loadCheck: true }) // esbuild / webpack / Rspack / Farm production build: check the loads too
```

Vite fills `root` in itself (from `configResolved`), so you only need it on the other bundlers — and only when the working directory is not the project root. A wrong root means the config is never found: plugin-provided annotations (`@db.*`, `@ui.*`, …) then show up as "Unknown annotation" errors.

With `strict: false`, a `.as` file that fails to compile yields an empty module (`module.exports = {}`), so anything importing it will likely break at runtime — keep `strict: true` for normal builds.

Everything else (primitives, annotations, plugins, `include`/`exclude`) lives in [`atscript.config.*`](/packages/typescript/configuration), which the plugin auto-discovers. The plugin only intercepts `*.as` imports; per-file filtering is delegated to the bundler.

## How It Works

1. **Config Discovery** — the plugin finds your `atscript.config.*` by searching upward from the project root (Vite's `root`, the `root` option, or the working directory)
2. **Plugin Execution** — runs the plugins defined in your configuration
3. **Runtime JS** — for each imported `.as` it emits the runtime metadata module (the same output as `asc -f js`)
4. **Import Resolution** — lets you import `.as` files directly in TypeScript/JavaScript

In development the plugin compiles on demand with hot module replacement (native on Vite/Webpack/Rspack/Farm; via watch mode on Rollup/Rolldown). In production it pre-compiles during the build. With Vite, editing an `.as` file also re-generates the `.as` modules importing it, directly or not, whose generated code can depend on it (those reading its definitions, and all of them when its imports changed), and reloads those whose generated code changed — in the client and the SSR environments, with or without HMR (for example a server-side module runner that re-imports the app). Modules that only reference its types keep their code, so an edit stays fast in large projects. Deleting an `.as` file and creating it again reloads the modules importing it.

**Editing a module with `annotate` blocks reloads the page in full.** A mutating block writes into its target type when its module loads, and there is no undo, so the plugin does not hot-update such a module: a change to a file that has (or had) mutating `annotate` blocks, or to a file whose re-evaluation would run blocks on types it does not re-evaluate, triggers a full page reload, and every module is loaded fresh. Ordinary type edits still hot-update.

### Import cycles need native ES modules

The generated `.as.js` modules are ES modules. `.as` files that import each other (an import cycle) work under native ESM — Vite, Rollup, Rolldown, Node.js `import`. A bundler or test runner that rewrites the generated code to CommonJS (`require`) handles `.as` modules without import cycles only; for a cycle, keep the generated modules ESM. `@atscript/typescript/utils` itself ships both ESM and CommonJS builds.

A module of an import cycle builds its types once the modules it reads are evaluated. A production build checks this before it emits: it loads every generated module once, and every import cycle from each of its modules, and fails with "the generated code fails to load … — an internal code generation error, please report it" when any load throws (a statement that could never run, one that throws, a module that throws). That is a bug in atscript's code generation, not in your schema: please report it with the files.

Where the check runs:

- one-shot `vite build`, Rollup and Rolldown builds, and the `asc` CLI build (with or without a config file);
- esbuild, webpack, Rspack and Farm builds only with the plugin option `loadCheck: true` (these bundlers do not report a build apart from a watch); `loadCheck` forces the check on or off on any bundler;
- not in watch builds (`vite build --watch`, `rollup -w`, `rolldown --watch`), on the dev server or in hot updates, unless the plugin option `loadCheck: true` forces it; never in the editor.

In the programmatic API, `build(…).generate()` and `.write()` do not check. Wrap them in `withLoadCheck` from `@atscript/typescript` to check:

```ts
import { build } from '@atscript/core'
import { tsPlugin, withLoadCheck } from '@atscript/typescript'

const repo = await build({ rootDir: 'src', plugins: [tsPlugin()] })
await withLoadCheck(() => repo.write({ format: 'js' })) // throws when a generated module fails to load
```

::: warning Type artifacts are not written by the bundler plugin
`unplugin-atscript` never writes `.as.d.ts` or the project-level `atscript.d.ts` to disk. For type checking and IDE support, generate types with the [CLI](/packages/typescript/cli): `asc -f dts` (e.g. as a `postinstall` and pre-build step), or let the [VSCode extension](/packages/vscode/) regenerate them on save. (Declaration *bundling* in library builds is a separate concern — see [below](#library-builds-with-declaration-bundling).)
:::

## Library Builds with Declaration Bundling

If you build a **library** whose TypeScript entries re-export `.as` symbols and bundle declarations with `rolldown-plugin-dts` (used by `tsdown`) or `rollup-plugin-dts`, the plugin serves type declarations to the declaration pass automatically: when the declaration bundler resolves an `.as` import from a generated declaration module, `unplugin-atscript` responds with the same declarations `asc -f dts` would produce, rendered fresh from the `.as` source. Re-exported symbols stay fully typed in the bundled `.d.ts`.

```typescript
// src/index.ts — a library entry re-exporting an Atscript model
export { User } from './models/user.as'
```

```typescript
// tsdown.config.ts
import { defineConfig } from 'tsdown'
import atscript from 'unplugin-atscript/rolldown'

export default defineConfig({
  entry: ['src/index.ts'],
  dts: true,
  plugins: [atscript()],
})
```

The only requirement is that `atscript()` is present in the plugin list of the build that bundles declarations — the same plugin instance covers both the runtime and declaration passes.

**Symptom of a missing plugin:** a re-exported `.as` symbol works as a *value* but loses all properties in a *type* position, and the emitted declaration imports it from a JS chunk:

```typescript
// dist/index.d.mts — broken: no declaration exists for the .mjs chunk
import { t as User } from './user-ABC123.mjs'
```

If you see this, the plugin was not wired into the declaration build (or you are on an `unplugin-atscript` version that predates declaration support).

## Packages Built with an Earlier Version

Generated `.as.js` modules are built against the runtime of the version that generated them. **Rebuild `.as` packages built with atscript 0.1.110 or earlier** before using them with this version: their modules call builder methods the runtime no longer has (`refTo`, `cloneRefProp`). Rebuild every package you depend on that ships generated `.as` code; there is no compatibility mode.

The same goes for code of your own that builds types by hand: `defineAnnotatedType().refTo(…)` and `cloneRefProp` are removed from `@atscript/typescript/utils`. Reference a type with `defineAnnotatedType().ref(Target)` (or `.ref(Target, ['field'])` for a chain reference): the node reads its structure and annotations from `Target`.

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

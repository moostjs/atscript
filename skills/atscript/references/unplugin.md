# Build integration — `unplugin-atscript`

Hooks `.as` compilation into the build so no separate CLI step is needed; live regeneration during dev.

## Bundler entries

One package, per-bundler entry:

- `unplugin-atscript/vite`
- `unplugin-atscript/rollup`
- `unplugin-atscript/rolldown`
- `unplugin-atscript/webpack`
- `unplugin-atscript/esbuild`
- `unplugin-atscript/rspack`
- `unplugin-atscript/farm`

Same options shape across all.

## Install

```bash
npm install -D unplugin-atscript @atscript/typescript @atscript/core
```

## Usage

**Vite:**

```ts
import { defineConfig } from 'vite'
import atscript from 'unplugin-atscript/vite'

export default defineConfig({
  plugins: [atscript({ strict: true })],
})
```

**Webpack:**

```js
const atscript = require('unplugin-atscript/webpack').default

module.exports = {
  plugins: [atscript({ strict: true })],
}
```

**Rollup / Rolldown / esbuild / Rspack / Farm:** identical — import the matching entry, add to `plugins`.

## Options

| Option   | Type      | Default | Effect                                                                                |
| -------- | --------- | ------- | ------------------------------------------------------------------------------------- |
| `strict` | `boolean` | `true`  | Fail build on parse/diagnostic errors. `false` = warn-only (useful during refactors). |

That is the entire surface. Atscript config (primitives, annotations, plugins) lives in `atscript.config.*`, auto-discovered by walking up from `process.cwd()`. The unplugin is a thin bridge between the bundler and the atscript pipeline; per-file `include`/`exclude` is delegated to the bundler's own resolution (only `*.as` is intercepted).

## Behavior

Per matching `.as`:

1. `resolveId` — resolves `.as` imports (incl. relative without extension).
2. `load` / `transform` — parses, runs configured plugins, returns generated JS (= `asc -f js` output).
3. Tags the module `moduleSideEffects: false` where appropriate for tree-shaking.
4. **Declaration bundling**: when the importer is a declaration module (`.d.ts`/`.d.mts`/`.d.cts` — the dts graph of `rolldown-plugin-dts`/`tsdown` or `rollup-plugin-dts`), serves the type declaration (= `asc -f dts` output, rendered fresh) instead of JS, so `.as` symbols re-exported through TS entries stay typed in bundled declarations.

`.as.d.ts` files and the project-level `atscript.d.ts` are **not written to disk** by the unplugin. Run `asc -f dts` (manually or in a pre-dev / pre-build script) to keep IDE/typecheck types in sync. VSCode extension regenerates `.d.ts` on save.

## Library builds that re-export `.as` symbols

| # | Rule |
| - | ---- |
| 1 | A TS entry doing `export { Model } from './model.as'` + declaration bundling (tsdown / rolldown-plugin-dts / rollup-plugin-dts) requires `atscript()` in the **declaration build's** plugin list — same plugin, no extra option. |
| 2 | Symptom of missing plugin (or pre-declaration-support version): emitted `.d.mts` imports the symbol from a JS chunk (`import { t as Model } from './chunk-XYZ.mjs'`) — value works, type position collapses to no properties. |
| 3 | Bare `.as` specifiers from other packages (`my-lib/model.as`) are left to package `exports` resolution — the dependency must ship a `types` condition on its `.as` subpath. |

## HMR

- **Vite / Webpack / Rspack** — native HMR. Editing a `.as` reloads dependents; the pipeline re-runs for just that file.
- **Rollup / Rolldown** — no HMR in pure Rollup; watch mode (`-w`) picks up changes.
- **esbuild** — HMR delegated to the host framework (Next, Vite-with-esbuild, etc.).
- **Farm** — HMR works.

HMR respects `@atscript/core`'s `AtscriptRepo` dependency graph — editing a type propagates to all referrers.

## Strict vs non-strict

- `strict: true` (default) — parse/diagnostic **errors** fail the build; warnings still log.
- `strict: false` — errors log red but build proceeds. Failing `.as` yields `module.exports = {}` — consumers likely blow up at runtime. Use for refactors / CI pre-flight.

## Combining with the CLI

```json
{
  "scripts": {
    "postinstall": "asc -f dts",
    "dev": "vite",
    "build": "asc -f dts && vite build",
    "check": "asc --noEmit",
    "gen:types": "asc -f dts"
  }
}
```

- `dev` — unplugin handles runtime JS on demand; VSCode extension handles `.d.ts`.
- `build` — `asc -f dts` first (materializes types + `atscript.d.ts`), then bundler.

## Bundling for production

`@atscript/typescript` ships two entries:

- main: `tsPlugin()` factory — build-time only.
- `/utils`: runtime helpers (`Validator`, `ValidatorError`, `isAnnotatedType`, `forAnnotatedType`, `defineAnnotatedType`, …).

When bundling your app (Rolldown, Rollup, esbuild, Rspack, …) and externalizing `@atscript/typescript` to keep build-time code out of the bundle, you **must also** externalize `@atscript/typescript/utils`. Otherwise the runtime helpers get inlined while downstream consumers (`@atscript/moost-validator`, plugins, your own code) import them from `node_modules` — two copies of `ValidatorError`, `instanceof` returns `false`, error interceptors silently fail, validation errors escape as 500s.

Recommended: regex-externalize the whole namespace so every subpath comes along.

```ts
// rolldown.config.ts (same shape for rollup, esbuild, rspack)
export default defineConfig({
  external: [/^@atscript\//],
})
```

The same applies if you subpath-import from any other `@atscript/*` package (`@atscript/core`, `@atscript/db`, etc.).

## Troubleshooting

- **"Cannot find atscript.config"** — ensure the config lives at/above `process.cwd()`.
- **Type errors on `.as` imports** — runtime is fine, `.d.ts` is stale. Run `asc -f dts`.
- **`.as` changes not picked up** — HMR depends on the bundler's watcher. Verify the bundler sees the file at all.
- **Re-exported `.as` symbol untyped in a consumer / dist `.d.mts` imports it from a `.mjs` chunk** — see [Library builds that re-export `.as` symbols](#library-builds-that-re-export-as-symbols).

## See also

- [config.md](config.md) — resolved config shape.
- [asc-cli.md](asc-cli.md) — manual generation.
- [vscode.md](vscode.md) — editor-side generation.

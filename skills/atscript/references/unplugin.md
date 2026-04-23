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

| Option       | Type            | Default                | Effect                                                                                                            |
| ------------ | --------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `strict`     | `boolean`       | `true`                 | Fail build on parse/diagnostic errors. `false` = warn-only (useful during refactors).                             |
| `configPath` | `string`        | auto-discovered        | Specific `atscript.config.*`. Default: walk up from project root.                                                 |
| `include`    | `FilterPattern` | `**/*.as`              | Files to transform.                                                                                               |
| `exclude`    | `FilterPattern` | `node_modules`, `dist` | Files to skip.                                                                                                    |

Configure actual atscript behavior (primitives, annotations, plugins) in `atscript.config.*`. The unplugin only bridges the bundler to the atscript pipeline.

## Behavior

Per matching `.as`:

1. `resolveId` — resolves `.as` imports (incl. relative without extension).
2. `load` / `transform` — parses, runs configured plugins, returns generated JS (= `asc -f js` output).
3. Tags the module `moduleSideEffects: false` where appropriate for tree-shaking.

`.d.ts` outputs and the project-level `atscript.d.ts` are **not** produced by the unplugin — only runtime JS. Run `asc -f dts` (manually or in a pre-dev / pre-build script) to keep types in sync. VSCode extension regenerates `.d.ts` on save.

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

## Troubleshooting

- **"Cannot find atscript.config"** — pass `configPath` explicitly, or ensure the config lives at/above `process.cwd()`.
- **Type errors on `.as` imports** — runtime is fine, `.d.ts` is stale. Run `asc -f dts`.
- **`.as` changes not picked up** — HMR depends on the bundler's watcher. Check `include`/`exclude`.

## See also

- [config.md](config.md) — resolved config shape.
- [asc-cli.md](asc-cli.md) — manual generation.
- [vscode.md](vscode.md) — editor-side generation.

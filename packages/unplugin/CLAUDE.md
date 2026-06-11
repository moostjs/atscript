# unplugin-atscript

Build tool plugin that integrates `.as` file compilation into modern bundlers via [Unplugin](https://unplugin.unjs.io/).

## Source Files

- `src/index.ts` -- Plugin factory (`unpluginFactory`) with `resolveId` and `load` hooks for `.as` file transformation
- `src/vite.ts` -- Vite entry point
- `src/rollup.ts` -- Rollup entry point
- `src/rolldown.ts` -- Rolldown entry point
- `src/webpack.ts` -- Webpack entry point
- `src/esbuild.ts` -- esbuild entry point
- `src/rspack.ts` -- Rspack entry point
- `src/farm.ts` -- Farm entry point

## Public API

Each bundler has a dedicated entry point with a default export:

```ts
// Vite
import atscript from 'unplugin-atscript/vite'
plugins: [atscript()]

// Rollup
import atscript from 'unplugin-atscript/rollup'
plugins: [atscript()]

// Webpack, esbuild, Rspack, Rolldown, Farm — same pattern
```

Main entry (`unplugin-atscript`) exports:

- `unpluginFactory` -- Raw factory function for creating bundler-specific plugins
- `unplugin` (default export) -- `UnpluginInstance` with all bundler adapters
- `asPlugin` -- Deprecated alias for `unplugin`
- `atscriptPluginOptions` -- Config interface: `{ strict?: boolean }` (default: `true`, throws on validation errors)

## Supported Build Tools

Vite, Rollup, Rolldown, Webpack, esbuild, Rspack, Farm (via Unplugin 2.x)

## How It Works

1. **resolveId** -- Resolves relative `.as` file imports. When the importer is a
   declaration module (`.d.ts`/`.d.mts`/`.d.cts` — the dts graph of
   rolldown-plugin-dts/tsdown or rollup-plugin-dts), resolves to a `<file>.as.d.ts`
   id instead, so re-exported `.as` symbols stay typed in bundled declarations
2. **load** -- For each `.as` file (or `.as.d.ts` id from the dts graph):
   - Reads Atscript config via `@atscript/core`
   - Creates `AtscriptRepo` instance
   - Loads and validates the document
   - Renders output via `doc.render('js')` (or `doc.render('dts')` for `.as.d.ts`
     ids, with the `/// <reference path>` directive stripped)
   - Handles diagnostics (errors in strict mode, warnings always logged)
   - Returns JS with proper `moduleSideEffects` flag

## Key commands

```bash
pnpm test    # Run all tests from repo root
pnpm build   # Build all packages
```

## Dependencies

- **Peer**: `@atscript/core`, `@atscript/typescript`
- **Runtime**: `unplugin ^2.1.2`

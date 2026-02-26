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

1. **resolveId** -- Resolves relative `.as` file imports
2. **load** -- For each `.as` file:
   - Reads Atscript config via `@atscript/core`
   - Creates `AtscriptRepo` instance
   - Loads and validates the document
   - Renders output to JavaScript via `doc.render('js')`
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

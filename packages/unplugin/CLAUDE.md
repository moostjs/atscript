# unplugin-atscript

Build tool plugin that integrates `.as` file compilation into modern bundlers via [Unplugin](https://unplugin.unjs.io/).

## Source Files

- `src/index.ts` -- Single source file. Plugin factory with `resolveId` and `load` hooks for `.as` file transformation.

## Public API

- `asPlugin` (default export) -- `UnpluginInstance` configurable for different bundlers
- `atscriptPluginOptions` -- Config interface: `{ strict?: boolean }` (default: `true`, throws on validation errors)

Usage:

```ts
// Vite
plugins: [atscript.vite()]
// Rollup
plugins: [atscript.rollup()]
// Webpack, esbuild, Rspack — via unplugin's universal interface
```

## Supported Build Tools

Vite, Rollup, Webpack, esbuild, Rspack (via Unplugin 2.1.2)

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

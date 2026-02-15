# Installation

## Package

::: code-group

```bash [npm]
npm install @atscript/typescript @atscript/core
```

```bash [pnpm]
pnpm add @atscript/typescript @atscript/core
```

```bash [yarn]
yarn add @atscript/typescript @atscript/core
```

:::

`@atscript/core` is a peer dependency that provides the parser, plugin system, and config utilities.

## What Gets Installed

- **`@atscript/typescript`** — the code generation plugin and the `asc` CLI binary
- **`@atscript/typescript/utils`** — runtime utilities (Validator, JSON Schema, serialization, type traversal)

## Bundler Integration

If you're using a build tool (Vite, Webpack, Rollup, esbuild), install `unplugin-atscript` to compile `.as` files on the fly:

::: code-group

```bash [npm]
npm install -D unplugin-atscript
```

```bash [pnpm]
pnpm add -D unplugin-atscript
```

:::

See the [Build Setup](/guide/build-setup) guide for bundler-specific configuration.

## VSCode Extension

The [Atscript VSCode extension](https://marketplace.visualstudio.com/items?itemName=moost.atscript-as) provides syntax highlighting, IntelliSense, and automatic `.d.ts` generation on save. It picks up your `atscript.config.js` automatically.

## Next Steps

- [Configuration](/packages/typescript/configuration) — set up your config file
- [Quick Start](/guide/quick-start) — create your first `.as` file

# Installation

::: info
This installation guide is specific to TypeScript/JavaScript. Support for other languages is planned through community-contributed plugins.
:::

## Prerequisites

- Node.js 16 or higher
- npm, pnpm, yarn, or bun package manager

## Install Atscript

To use Atscript in your project, install the core packages:

::: code-group

```bash [npm]
npm install -D @atscript/core @atscript/typescript
```

```bash [pnpm]
pnpm add -D @atscript/core @atscript/typescript
```

```bash [yarn]
yarn add -D @atscript/core @atscript/typescript
```

```bash [bun]
bun add -D @atscript/core @atscript/typescript
```

:::

## Package Overview

### Core Packages

- **@atscript/core** - Core parser, AST, and plugin system
- **@atscript/typescript** - TypeScript/JavaScript code generation and CLI (`asc` command)

### Optional Packages

- **@atscript/mongo** - MongoDB integration with index syncing
- **@atscript/moost-mongo** - Moost framework MongoDB integration
- **@atscript/moost-validator** - Moost framework validation integration
- **@atscript/unplugin** - Build tool integrations (Vite, Webpack, Rollup, etc.)

## Verify Installation

After installation, verify that the `asc` compiler is available:

::: code-group

```bash [npx]
npx asc --help
```

```bash [pnpm]
pnpm exec asc --help
```

```bash [yarn]
yarn asc --help
```

```bash [bunx]
bunx asc --help
```

:::

You should see the available command options:
```
Options:
  -c, --config <path>    Path to config file
  -f, --format <format>  Output format (dts or js)
  --help                 Show help
```

## VSCode Extension (Recommended)

For the best development experience, install the [Atscript VSCode extension](https://marketplace.visualstudio.com/items?itemName=moost.atscript-as):

1. Open VSCode
2. Go to Extensions (Cmd/Ctrl + Shift + X)
3. Search for "Atscript"
4. Install the extension by Moost

Or install directly from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=moost.atscript-as).

The extension provides:
- Syntax highlighting for `.as` files
- IntelliSense support
- Error checking
- Auto-formatting

## Next Steps

- [Quick Start](/guide/quick-start) - Create your first .as file
- [Why Atscript?](/guide/why-atscript) - Understand the motivation
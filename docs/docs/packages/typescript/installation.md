# Installation

::: info
This installation guide is specific to TypeScript/JavaScript. Support for other languages is planned through community-contributed plugins.
:::

## Prerequisites

- Node.js 16 or higher
- npm, pnpm, yarn, or bun package manager

## Install Atscript

::: code-group

```bash [npm]
npm install @atscript/typescript
npm install -D @atscript/core
```

```bash [pnpm]
pnpm add @atscript/typescript
pnpm add -D @atscript/core
```

```bash [yarn]
yarn add @atscript/typescript
yarn add -D @atscript/core
```

```bash [bun]
bun add @atscript/typescript
bun add -D @atscript/core
```

:::

### What Gets Installed

- **`@atscript/core`** — parser, AST, and plugin system (dev dependency — build-time only)
- **`@atscript/typescript`** — TypeScript/JavaScript code generation, the `asc` CLI, and runtime utilities (Validator, JSON Schema, serialization, type traversal)

### Optional Packages

- **`unplugin-atscript`** — Build tool integration (Vite, Webpack, Rollup, esbuild). See [Build Setup](/packages/typescript/build-setup).
- **`@atscript/mongo`** — MongoDB integration with index syncing. See [MongoDB](/packages/mongo/).
- **`@atscript/moost-mongo`** — Moost framework MongoDB integration
- **`@atscript/moost-validator`** — Moost framework validation integration

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

The extension provides:

- Syntax highlighting for `.as` files
- IntelliSense support
- Error checking
- Auto-generation of `.d.ts` files on save

## AI Agent Skills

`@atscript/typescript` ships an AI agent skill for Claude Code, Cursor, Windsurf, Codex, and other compatible agents. The skill teaches your agent the library's APIs, patterns, and best practices so it can help you write correct code without hallucinating.

**Install the skill into your agent:**

```bash
# Project-local (recommended — version-locked, commits with your repo)
npx @atscript/typescript setup-skills

# Global (available across all your projects)
npx @atscript/typescript setup-skills --global
```

Restart your agent after installing.

**Auto-update on install** — to keep the skill in sync whenever you upgrade the package, add this to your project's `package.json`:

```jsonc
{
  "scripts": {
    "postinstall": "npx @atscript/typescript setup-skills --postinstall"
  }
}
```

## Next Steps

- [Quick Start](/packages/typescript/quick-start) — Create your first .as file
- [Configuration](/packages/typescript/configuration) — Set up the config file

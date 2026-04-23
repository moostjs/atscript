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

- **`unplugin-atscript`** — Build tool integration (Vite, Webpack, Rollup, esbuild, Rolldown, Rspack, Farm). See [Build Setup](/packages/typescript/build-setup).
- **`@atscript/moost-validator`** — Moost framework validation integration. See [Moost Validator](/packages/moost-validator/).
- **Database integrations** — `@atscript/db`, `@atscript/db-sqlite`, `@atscript/db-mongo`, `@atscript/db-mysql`, `@atscript/moost-db`, etc. live in a [separate repo](https://db.atscript.dev) and are installed alongside `@atscript/typescript` when needed.

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
  --noEmit               Only run diagnostics, no file output
  --skipDiag             Skip diagnostics, always emit
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

## AI Agent Skill

Atscript ships a unified skill for AI coding agents (Claude Code, Cursor, Windsurf, Codex, etc.) covering every `@atscript/*` package with progressive-disclosure reference docs.

```bash
npx skills add moostjs/atscript
```

Restart your agent after installing. Learn more about AI agent skills at [skills.sh](https://skills.sh).

## Next Steps

- [Quick Start](/packages/typescript/quick-start) — Create your first .as file
- [Configuration](/packages/typescript/configuration) — Set up the config file

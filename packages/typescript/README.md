# @atscript/typescript

TypeScript language extension for [Atscript](https://atscript.moost.org). Compiles `.as` files into `.d.ts` type declarations and `.js` runtime modules with full metadata, validation, and JSON Schema support.

## Installation

```bash
pnpm add @atscript/typescript @atscript/core
```

For build-tool integration (Vite, Webpack, Rollup, esbuild, Rspack), also add:

```bash
pnpm add unplugin-atscript
```

## AI Agent Skills

This package ships with structured skill files for AI coding agents (Claude Code, Cursor, Windsurf, Codex, etc.).

```bash
# Project-local (recommended — version-locked, commits with your repo)
npx atscript-typescript-skill

# Global (available across all your projects)
npx atscript-typescript-skill --global
```

To keep skills automatically up-to-date, add a postinstall script to your `package.json`:

```json
{
  "scripts": {
    "postinstall": "atscript-typescript-skill --postinstall"
  }
}
```

## Features

- **Type declarations** — `.d.ts` files from `.as` interfaces and types
- **Runtime metadata** — `.js` files with full metadata for validators and serializers
- **JSON Schema** — Build, parse, and merge JSON schemas from annotated types
- **Validation** — Validate data against types with plugin support
- **Serialization** — JSON-safe round-trip serialization/deserialization
- **CLI** — `asc` command for compiling `.as` files

## Documentation

Full documentation: [atscript.moost.org](https://atscript.moost.org)

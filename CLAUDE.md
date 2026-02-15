# Atscript

A universal type and metadata description language. Atscript unifies data model definitions, metadata, and data constraints into a single source of truth (`.as` files) that can be shared across languages, stacks, and frontend/backend boundaries.

## Project Vision

Full-stack developers face a recurring problem: data models, metadata (labels, types, indexed fields), and constraints (regexp, sizes, required/optional) are scattered across multiple places. Atscript solves this by providing a single `.as` definition that covers format, types, metadata, validation constraints, DB-related metadata (indexes, key fields), and UI-related metadata (labels, component names, visibility) — all shareable across languages and stacks.

## Monorepo Structure

```
packages/
  core/           - Parser, AST, plugin system, diagnostics, dependency tracking
  typescript/     - TypeScript language extension (codegen + runtime utils + CLI)
  mongo/          - MongoDB metadata/primitives extension and MongoCollection classes
  moost-mongo/    - Moost framework integration for MongoDB collections (REST, validation)
  moost-validator/ - Moost framework integration for automatic .as-based data validation
  unplugin/       - Build tool plugin (Vite, Webpack, Rollup, esbuild, Rspack)
  vscode/         - VSCode extension (syntax highlighting, LSP, diagnostics, go-to-definition)
docs/             - VitePress documentation site
explorations/     - Sandbox/playground for testing features
```

## Dependency Chain

```
@atscript/core (foundation)
  └─ @atscript/typescript (language extension)
       ├─ @atscript/mongo (metadata extension, + peer: mongodb)
       │    └─ @atscript/moost-mongo (+ peer: moost)
       ├─ @atscript/moost-validator (+ peer: moost)
       └─ unplugin-atscript (build integration)
@atscript/vscode (depends on core only)
```

## Key Commands

- `pnpm build` — Build all packages (runs before-build hooks, then Rolldown/Rollup)
- `pnpm test` — Run all tests (Vitest)
- `pnpm test:watch` — Watch mode
- `pnpm --filter <package> test` — Test a specific package
- `pnpm --filter <package> exec vitest run` — Run vitest for a package
- `pnpm lint` — Run oxlint + eslint
- `pnpm release` — Build, test, version sync, publish all packages

## Build System

- **Bundler**: Rolldown (primary), Rollup (fallback)
- **Transpiler**: SWC via unplugin-swc
- **Types**: rollup-plugin-dts for .d.ts generation
- **Testing**: Vitest with snapshot testing
- **Linting**: oxlint + eslint
- **TypeScript**: 5.9.x, strict mode, experimental decorators

## Code Conventions

- All packages export ESM (`.mjs`) + CJS (`.cjs`) + types (`.d.ts`)
- Package entry points: `dist/index.mjs` / `dist/index.d.ts`
- Tests: `*.spec.ts` files, colocated with source or in `__test__/` directories
- Snapshot tests: `__snapshots__/` directories
- `.as` files compile to `.as.d.ts` (type declarations) and `.as.js` (runtime)

## Documentation

- **Site**: VitePress at `docs/`
- **Published**: https://atscript.moost.org
- **Style**: Progressive complexity — beginner-friendly for guides, increasingly technical for advanced/plugin topics
- **Structure**: guide/ (complete), packages/ concepts/ examples/ integrations/ advanced/ api/ (mostly stubs needing content)
- **Multi-language architecture**: Docs are split into shared/language-agnostic content (guide/, concepts/) and language-specific "worlds" (packages/typescript/, future: packages/python/, etc.). Each language extension should have a self-contained docs section. Never merge language-specific content into the shared guide.

## Agents

Six domain expert agents exist in `.claude/agents/`:
- `atscript-core-expert` — Core parser, AST, plugin system
- `atscript-typescript-expert` — TypeScript compilation pipeline
- `atscript-mongo-expert` — MongoDB plugin and annotations
- `moost-atscript-expert` — Moost framework integration
- `vscode-extension-expert` — VSCode extension
- `vitepress-docs-architect` — Documentation site architecture

## Important Patterns

- Atscript is designed to be **language-agnostic** — `@atscript/typescript` is the first language extension; others (Python, Java, etc.) can follow the same pattern
- Plugins extend the core by adding annotations, primitives, and metadata — they don't modify the parser
- The core provides AST + utilities (annotation merging, type unwinding) that language extensions and LSPs consume
- Moost integrations (`moost-mongo`, `moost-validator`) demonstrate how .as types flow into a real framework

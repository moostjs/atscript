# Atscript

A universal type and metadata description language. Atscript unifies data model definitions, metadata, and data constraints into a single source of truth (`.as` files) that can be shared across languages, stacks, and frontend/backend boundaries.

## Project Vision

Full-stack developers face a recurring problem: data models, metadata (labels, types, indexed fields), and constraints (regexp, sizes, required/optional) are scattered across multiple places. Atscript solves this by providing a single `.as` definition that covers format, types, metadata, validation constraints, DB-related metadata (indexes, key fields), and UI-related metadata (labels, component names, visibility) — all shareable across languages and stacks.

## Monorepo Structure

```
packages/
  core/           - Parser, AST, plugin system, diagnostics, dependency tracking
  typescript/     - TypeScript language extension (codegen + runtime utils + CLI)
  db/             - Generic DB abstraction layer (AtscriptDbTable, BaseDbAdapter, embedded object flattening)
                    Sub-entries: /plugin (annotations), /rel (relations), /agg (aggregation), /sync (schema sync), /shared (helpers)
  db-sqlite/      - SQLite adapter (better-sqlite3 / node:sqlite driver, filter-to-SQL translation)
  db-mongo/       - MongoDB adapter (MongoAdapter) and metadata/primitives extension
  db-mysql/       - MySQL adapter (WIP)
  db-sql-tools/   - Shared SQL builder utilities (used by db-sqlite, db-mysql)
  moost-db/       - Generic Moost framework database controller (works with any adapter)
  moost-validator/ - Moost framework integration for automatic .as-based data validation
  unplugin/       - Build tool plugin (Vite, Webpack, Rollup, esbuild, Rspack)
  vscode/         - VSCode extension (syntax highlighting, LSP, diagnostics, go-to-definition)
docs/             - VitePress documentation site
explorations/     - Sandbox/playground for testing features
```

## Dependency Chain

```
@atscript/core (foundation)
  ├─ @atscript/typescript (language extension)
  │    ├─ @atscript/db-mongo (metadata extension, + peer: mongodb)
  │    ├─ @atscript/moost-validator (+ peer: moost)
  │    └─ unplugin-atscript (build integration)
  └─ @atscript/db (generic DB abstraction)
       ├── /plugin — dbPlugin() registers all @db.* annotations
       ├── /rel — relation loading + nested writes (dynamic import)
       ├── /agg — aggregation validation (dynamic import)
       ├── /sync — schema sync, dev-time only (dynamic import)
       ├── /shared — annotation helpers for adapter plugins
       ├─ @atscript/moost-db (generic Moost controller, + peer: moost)
       ├─ @atscript/db-sqlite (SQLite adapter, + peer: better-sqlite3)
       ├─ @atscript/db-mysql (MySQL adapter, + peer: mysql2)
       ├─ @atscript/db-sql-tools (shared SQL builder)
       └─ @atscript/db-mongo (MongoDB adapter + @db.mongo.* plugin, + peer: mongodb)
@atscript/vscode (depends on core only)
```

## Key Commands

- `pnpm build` — Build all packages (runs before-build hooks, then Rolldown/Rollup)
- `pnpm test` — Run all tests (Vitest)
- `pnpm test:watch` — Watch mode
- `pnpm --filter <package> test` — Test a specific package
- `pnpm --filter <package> exec vitest run` — Run vitest for a package
- `pnpm lint` — Run oxlint
- `pnpm fmt` — Format with oxfmt
- `pnpm fmt:check` — Check formatting
- `pnpm release` — Build, test, version sync, publish all packages

## Build System

- **Bundler**: Rolldown (primary), Rollup (fallback)
- **Transpiler**: SWC via unplugin-swc
- **Types**: rollup-plugin-dts for .d.ts generation
- **Testing**: Vitest with snapshot testing
- **Linting**: oxlint
- **Formatting**: oxfmt
- **TypeScript**: 5.9.x, strict mode, experimental decorators

## Build & Testing

Before reporting TypeScript errors or trying to fix type issues, always rebuild the project first (`pnpm build` or equivalent). Stale dist files and stale diagnostics have caused false error chasing in multiple sessions.

### Test fixtures: use `.as` files, not `$()` builder

When tests need Atscript types (annotated types with `@db.*`, `@meta.id`, etc.), always use `.as` fixture files compiled via `prepareFixtures()` from `test-utils.ts`. **Do not** hand-write `defineAnnotatedType` (`$()`) builder chains — the builder API is designed for generated code and has subtle behaviors (e.g. `$('object', Class)` resets the type, metadata propagation differs from compiled output, lazy flatten timing) that make hand-written types unreliable in tests.

Pattern:
1. Create `.as` files in `__test__/fixtures/` (e.g. `rel-task.as`)
2. Call `await prepareFixtures()` in `beforeAll` — this compiles all `.as` files in the fixtures directory to `.as.js` + `.as.d.ts`
3. Import compiled types: `const { Task } = await import('./fixtures/rel-task.as.js')`
4. The `.as.js` files are committed (generated once, updated by `prepareFixtures()` when `.as` files change)

## Package Naming Convention

All packages under `packages/` follow a strict naming convention:

| Category | Pattern | Examples |
|----------|---------|----------|
| **DB-related** | `db-*` | `db`, `db-sqlite`, `db-mongo`, `db-mysql`, `db-sql-tools` |
| **DB sub-entries** | `db/<feature>` | `db/plugin`, `db/rel`, `db/agg`, `db/sync`, `db/shared` |
| **DB adapters** | `db-<engine>` | `db-sqlite`, `db-mongo`, `db-mysql` |
| **Moost integrations** | `moost-*` | `moost-db`, `moost-validator` |
| **Non-DB packages** | descriptive name | `core`, `typescript`, `unplugin`, `vscode` |

Key rules:
- Every DB-related package starts with `db-` (except `db` itself, the primary DB package)
- `db` features are exposed as sub-entries (`/plugin`, `/rel`, `/agg`, `/sync`, `/shared`), not separate packages
- Adapter packages use `db-<engine>` (e.g. `db-mongo`, not `mongo`)
- Moost framework integrations use `moost-*` prefix

## Code Conventions

- All packages export ESM (`.mjs`) + CJS (`.cjs`) + types (`.d.ts`)
- Package entry points: `dist/index.mjs` / `dist/index.d.ts`
- Tests: `*.spec.ts` files, colocated with source or in `__test__/` directories
- Snapshot tests: `__snapshots__/` directories
- `.as` files compile to `.as.d.ts` (type declarations) and `.as.js` (runtime)

## Documentation

- **Site**: VitePress at `docs/`
- **Published**: https://atscript.moost.org
- **Style**: Progressive complexity — beginner-friendly in language guides, increasingly technical for plugin development
- **Navigation**: TypeScript dropdown (Guide, MongoDB, Moost) | VSCode | Plugin Development
- **Structure**: packages/typescript/ (complete, 18 pages), plugin-development/ (16 stubs), other package sections (stubs)
- **Multi-language architecture**: Each language extension gets a self-contained docs section using shared `_fragments/` for common content. The TypeScript guide is the reference implementation. Future languages (Python, Java) follow the same pattern.

## Agents

Six domain expert agents exist in `.claude/agents/`:

- `atscript-core-expert` — Core parser, AST, plugin system
- `atscript-typescript-expert` — TypeScript compilation pipeline
- `atscript-db-mongo-expert` — MongoDB plugin and annotations
- `moost-atscript-expert` — Moost framework integration
- `vscode-extension-expert` — VSCode extension
- `vitepress-docs-architect` — Documentation site architecture

## Problem Solving

When fixing bugs, always investigate and fix the root cause first. Do not implement workarounds, getters, or shims unless explicitly asked. If the fix seems indirect, ask before proceeding.

## Important Patterns

- Atscript is designed to be **language-agnostic** — `@atscript/typescript` is the first language extension; others (Python, Java, etc.) can follow the same pattern
- Plugins extend the core by adding annotations, primitives, and metadata — they don't modify the parser
- The core provides AST + utilities (annotation merging, type unwinding) that language extensions and LSPs consume
- Moost integrations (`moost-db`, `moost-validator`) demonstrate how .as types flow into a real framework
- **`@db.*` annotations** are provided by `@atscript/db/plugin` via `dbPlugin()`. All annotations registered unconditionally; runtime dynamically imports `/rel` and `/agg` only when table metadata requires them. Core ships NO db annotations. TypeScript codegen detects annotations by string key presence — no dependency on annotation specs
- **Primitive `annotations` map** — primitives use a generic `annotations: Record<string, TPrimitiveAnnotationValue>` to apply any annotation (the old hardcoded `expect` property was removed). The `applyAnnotations()` method is spec-aware: it resolves annotation specs, respects `multiple` flags, and maps object values by spec argument names
- **`@meta.isKey` was renamed to `@expect.array.key`** — it's a validation constraint, not semantic metadata
- **`@meta.id` takes no arguments** — multiple fields annotated with `@meta.id` form a composite primary key

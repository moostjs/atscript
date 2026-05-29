# Atscript

A universal type and metadata description language. Atscript unifies data model definitions, metadata, and data constraints into a single source of truth (`.as` files) that can be shared across languages, stacks, and frontend/backend boundaries.

## AI agents

The canonical agent skill lives at [skills/atscript/](skills/atscript/) (a lean `SKILL.md` index + progressive-disclosure `references/*.md`). Agents pull it in via `npx skills add moostjs/atscript`. Load the relevant reference file for the domain being edited — do not load the whole tree.

## Project Vision

Full-stack developers face a recurring problem: data models, metadata (labels, types, indexed fields), and constraints (regexp, sizes, required/optional) are scattered across multiple places. Atscript solves this by providing a single `.as` definition that covers format, types, metadata, validation constraints, DB-related metadata (indexes, key fields), and UI-related metadata (labels, component names, visibility) — all shareable across languages and stacks.

## Monorepo Structure

This repo is the **language core + TypeScript ecosystem**. The DB layer and UI layer live in separate sibling repos (see below).

```
packages/
  core/            - Parser, AST, plugin system, diagnostics, dependency tracking
  typescript/      - TypeScript language extension (codegen + runtime utils + asc CLI)
  unplugin/        - Build tool plugin (Vite, Webpack, Rollup, Rolldown, esbuild, Rspack, Farm)
  moost-validator/ - Moost framework integration for automatic .as-based data validation
  vscode/          - VSCode extension (syntax highlighting, LSP, diagnostics, go-to-definition)
docs/              - VitePress documentation site (https://atscript.dev)
explorations/      - Sandbox/playground for testing features
```

### Sibling repos (not in this monorepo)

- **`../atscript-db`** — DB layer: `@atscript/db` (generic abstraction + `/plugin` `/rel` `/agg` `/sync` `/shared` sub-entries), `db-sqlite`, `db-mongo`, `db-mysql`, `db-sql-tools`, `moost-db`, all `@db.*` annotations. Docs: https://db.atscript.dev. Skill: `moostjs/atscript-db`.
- **`../atscript-ui`** — UI layer: `@atscript/ui`, `vue-form`, `vue-table`, Moost workflow, `@ui.*` annotations. Docs: https://ui.atscript.dev. Skill: `moostjs/atscript-ui`.

The two layers consume `@atscript/core` + `@atscript/typescript` as published dependencies. The `asc db sync` CLI subcommand still ships in `@atscript/typescript` (it imports `@atscript/db/sync`) but drives the external adapters — its full semantics are documented in `atscript-db`, not here.

## Dependency Chain

```
@atscript/core (foundation: parser, AST, plugin system, diagnostics)
  ├─ @atscript/typescript (language extension: codegen + runtime + asc CLI)
  │    ├─ @atscript/moost-validator (+ peer: moost, @moostjs/event-http)
  │    └─ unplugin-atscript (build integration: Vite/Rollup/Rolldown/Webpack/esbuild/Rspack/Farm)
  └─ @atscript/vscode (LSP, syntax, completions, go-to-def — depends on core only)
```

Downstream (separate repos): the DB layer (`@atscript/db` + adapters + `moost-db`) and the UI layer (`@atscript/ui` + form/table/workflow) build on `@atscript/typescript`.

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

When tests need Atscript types (annotated types with `@meta.*`, `@expect.*`, etc.), always use `.as` fixture files compiled via `prepareFixtures()` from `@atscript/typescript/test-utils`. **Do not** hand-write `defineAnnotatedType` (`$()`) builder chains — the builder API is designed for generated code and has subtle behaviors (e.g. `$('object', Class)` resets the type, metadata propagation differs from compiled output, lazy flatten timing) that make hand-written types unreliable in tests.

Pattern:

1. Create `.as` files in `__test__/fixtures/` (e.g. `user.as`)
2. Call `await prepareFixtures({ rootDir, entries: ['user.as'] })` in `beforeAll` — this compiles the selected `.as` files to `.as.js` + `.as.d.ts` on every test run. `tsPlugin()` is auto-injected; pass only extra plugins.
3. Import compiled types: `const { User } = await import('./fixtures/user.as.js')`
4. Fixture artifacts (`.as.js`, `.as.d.ts`) are gitignored and regenerated on every test run — they are not committed.

```ts
import { prepareFixtures } from '@atscript/typescript/test-utils'

beforeAll(() => prepareFixtures({ rootDir, entries: ['user.as'] }))
```

### Project `.as` vs test `.as` fixtures

Atscript consumer projects typically contain two kinds of `.as` files, each with its own lifecycle:

1. **Production `.as`** (under `src/`): configure `atscript.config.ts` with `include: ['src/**/*.as']` and add a `postinstall: "asc"` script to `package.json` so `.as.d.ts` artifacts exist for lint/build/IDE tooling on fresh install.
2. **Test fixtures** (under `**/test/**`, `**/__test__/**`, `**/__tests__/**`): exclude those directories from `atscript.config.ts`. Compile them via `prepareFixtures()` from `@atscript/typescript/test-utils` in test-setup hooks, using whatever plugin set the tests require (feature-flag or WIP plugins would break a production `asc` run).

Both `.as.js` and `.as.d.ts` for fixtures are gitignored (`*.as.js`, `*.as.d.ts`) and produced only at test time. `@atscript/typescript` itself has no production `.as` in its `src/`, so it ships no `postinstall`.

## Package Naming Convention

Packages in this repo:

| Category               | Pattern          | Examples                              |
| ---------------------- | ---------------- | ------------------------------------- |
| **Moost integrations** | `moost-*`        | `moost-validator`                     |
| **Build integration**  | `unplugin-*`     | `unplugin-atscript`                   |
| **Core/language**      | descriptive name | `core`, `typescript`, `vscode`        |

Key rules:

- Moost framework integrations use the `moost-*` prefix
- The DB layer's own conventions (`db-*` packages, `db/<feature>` sub-entries, `db-<engine>` adapters) live with that code in the `atscript-db` repo

## Code Conventions

- All packages export ESM (`.mjs`) + CJS (`.cjs`) + types (`.d.ts`)
- Package entry points: `dist/index.mjs` / `dist/index.d.ts`
- Tests: `*.spec.ts` files, colocated with source or in `__test__/` directories
- Snapshot tests: `__snapshots__/` directories
- `.as` files compile to `.as.d.ts` (type declarations) and `.as.js` (runtime)

### Annotation metadata types: use `atscript.d.ts`, never cast to `any`

Each package that reads annotation metadata has a generated `atscript.d.ts` declaring the global `AtscriptMetadata` interface. This gives `metadata.get('meta.label')` a precise return type (e.g. `string | undefined`) — no manual type casts needed.

**Do:**

```typescript
const label = metadata.get('meta.label')   // string | undefined — correctly typed
const isId = metadata.get('meta.id')        // boolean — true if this node is a @meta.id member
```

**Don't:**

```typescript
const label = metadata.get('meta.label') as any // loses type safety
const label = metadata.get('meta.label') as AtscriptMetadata['meta.label'] | undefined // redundant
```

If `atscript.d.ts` is stale (missing new annotations), regenerate it with `npx asc -f dts` from the package directory. The only valid cast is narrowing a broad type to a stricter union when the consuming API requires it.

## Documentation

- **Site**: VitePress at `docs/`
- **Published**: https://atscript.dev
- **Style**: Progressive complexity — beginner-friendly in language guides, increasingly technical for plugin development
- **Navigation**: TypeScript | Database (external → db.atscript.dev) | UI (external → ui.atscript.dev) | Ecosystem | VSCode | Moost Validator | Plugin Dev (Early)
- **Structure**: packages/typescript/ (18 pages, complete), packages/moost-validator/ (4 pages), packages/vscode/ (4 pages), plugin-development/ (9 pages, labeled "Early"), _fragments/ (7 shared snippets)
- **Three doc surfaces kept in sync** via the `/docs-authoring` skill: the docs site (`docs/`), the agent skill (`skills/atscript/`), and the `moost` kb wiki. DB/UI docs live in their own repos — link out, don't duplicate.
- **Multi-language architecture**: Each language extension gets a self-contained docs section using shared `_fragments/` for common content. The TypeScript guide is the reference implementation. Future languages (Python, Java) follow the same pattern.

## Problem Solving

When fixing bugs, always investigate and fix the root cause first. Do not implement workarounds, getters, or shims unless explicitly asked. If the fix seems indirect, ask before proceeding.

## Important Patterns

- Atscript is designed to be **language-agnostic** — `@atscript/typescript` is the first language extension; others (Python, Java, etc.) can follow the same pattern
- Plugins extend the core by adding annotations, primitives, and metadata — they don't modify the parser
- The core provides AST + utilities (annotation merging, type unwinding) that language extensions and LSPs consume
- `@atscript/moost-validator` demonstrates how `.as` types flow into a real framework (the DB-side `moost-db` lives in the `atscript-db` repo)
- **Core ships only `@meta.*`, `@expect.*`, `@emit.*`.** All other namespaces (`@db.*`, `@ui.*`) come from plugins in their own repos. TypeScript codegen detects annotations by string-key presence — it has **no dependency on annotation specs**, so it emits `@db.*`/`@ui.*` metadata correctly without those plugins being installed here
- **Primitive `annotations` map** — primitives use a generic `annotations: Record<string, TPrimitiveAnnotationValue>` to apply any annotation (the old hardcoded `expect` property was removed). The `applyAnnotations()` method is spec-aware: it resolves annotation specs, respects `multiple` flags, and maps object values by spec argument names
- **`@meta.isKey` was renamed to `@expect.array.key`** — it's a validation constraint, not semantic metadata
- **`@meta.id` takes no arguments** — multiple fields annotated with `@meta.id` form a composite primary key

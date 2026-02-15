# Atscript Documentation Site

VitePress-based documentation site published at https://atscript.moost.org

## Commands

- `pnpm dev` — Start dev server (from `docs/` directory)
- `pnpm build` — Build static site
- `pnpm serve` — Preview built site

## Structure

```
docs/docs/
├── .vitepress/
│   ├── config.ts          — Main config: nav, sidebar, Atscript grammar, search, theme
│   └── theme/             — Custom theme (index.ts, style.css, atscript-grammar.ts)
├── _fragments/            — Shared markdown snippets (included via <!--@include: -->)
├── index.md               — Homepage
├── packages/
│   ├── typescript/        — TypeScript Guide (18 pages — self-contained, COMPLETE)
│   ├── mongo/             — MongoDB docs (9 STUB files)
│   ├── moost-mongo/       — Moost MongoDB docs (6 STUB files)
│   ├── moost-validator/   — Moost Validator docs (6 STUB files)
│   └── vscode/            — VSCode extension docs (7 STUB files)
├── plugin-development/    — Plugin Development Guide (16 STUB files)
└── public/                — Static assets (logo, images)
```

## Navigation Structure

```
TypeScript ▾              VSCode        Plugin Development
├── Guide                 (top-level)   (top-level)
├── MongoDB
└── Moost
    ├── Moost MongoDB
    └── Moost Validator
```

## Current Coverage

| Section | Status | Pages |
|---------|--------|-------|
| packages/typescript/ | COMPLETE | 18 pages with full content (uses fragments) |
| packages/mongo/ | STUBS | 9 files, needs content |
| packages/moost-mongo/ | STUBS | 6 files, needs content |
| packages/moost-validator/ | STUBS | 6 files, needs content |
| packages/vscode/ | STUBS | 7 files, needs content |
| plugin-development/ | STUBS | 16 files, needs content |
| _fragments/ | COMPLETE | 7 shared fragments |

## VitePress Config Key Details

- **Config file**: `docs/docs/.vitepress/config.ts`
- **Custom Atscript syntax highlighting grammar** embedded in config
- **Plugin**: `vitepress-plugin-llmstxt` for LLM-friendly text generation
- **Nav**: TypeScript dropdown (Guide, MongoDB, Moost), VSCode, Plugin Development
- **Sidebar**: Defined for all active sections
- **Edit links**: Point to `https://github.com/moostjs/atscript/edit/main/docs/docs/:path`

## Multi-Language Documentation Architecture

Atscript is **language-agnostic** — `@atscript/typescript` is the first language extension, but Python, Java, and other language extensions are planned. The documentation must reflect this:

### Content Layers

1. **Language-specific "worlds"** (packages/typescript/, future: packages/python/, packages/java/):
   - Each language extension gets a **self-contained section** covering the full journey:
     - Why Atscript, .as syntax basics (via shared fragments)
     - Installation & setup for that language
     - Code generation specifics
     - Runtime utilities (validator, serializer, etc.)
     - CLI usage
     - Integration examples with that language's frameworks
   - A TypeScript user should be able to read packages/typescript/ and have everything they need **without leaving that section**
   - A future Python user should read packages/python/ similarly

2. **Plugin-specific** (packages/mongo/, packages/moost-mongo/, etc.):
   - These are framework/database integrations nested under their language dropdown
   - Currently all TypeScript-ecosystem, but the pattern should allow for language-agnostic plugins too

3. **Plugin Development** (plugin-development/):
   - For plugin/language extension creators
   - Covers core architecture, AST, plugin hooks, code generation, LSP development

### Self-Contained Language Sections via Shared Fragments

Each language-specific section must be **self-contained** — a reader should NOT need to jump to the shared guide to understand common Atscript concepts. To achieve this without duplicating content, use **shared markdown fragments**:

- **Fragment location**: `docs/docs/_fragments/` — shared `.md` snippets covering common Atscript topics (syntax basics, annotation concepts, primitives, etc.)
- **VitePress include syntax**: `<!--@include: ../../_fragments/fragment-name.md-->` — embeds fragment content inline at build time
- **Usage pattern**: Both the shared guide pages and each language-specific section include the same fragments, so content stays in sync automatically. Language-specific pages can wrap the include with additional context or examples specific to that language.

Example:
```
docs/docs/_fragments/
├── annotations-intro.md     — What annotations are, basic syntax
├── primitives-overview.md   — Primitive types and semantic types
├── type-syntax-basics.md    — Interface/type declaration syntax
└── ...
```

A language-specific page (`packages/typescript/annotations.md`) includes `<!--@include: ../../_fragments/annotations.md-->`, then adds TypeScript-specific content below. Future language sections (e.g., `packages/python/annotations.md`) include the same fragment with Python-specific additions.

### Key Principles

- **Language sections are self-contained.** Each language guide covers everything a developer needs — from "why Atscript" to advanced runtime features — using shared fragments for common concepts.
- **Fragments are the single source of truth** for shared concepts. Edit the fragment, and all pages that include it update automatically.
- **No standalone guide section.** The old guide/ section was merged into the TypeScript guide. Future languages follow the same pattern.

## Writing Guidelines

- **Progressive complexity**: Beginner-friendly for getting started, increasingly technical for advanced/plugin topics
- **Target audience varies by section**:
  - packages/typescript/ — TypeScript developers using Atscript (full journey from intro to advanced)
  - packages/mongo/ — MongoDB users (TypeScript-specific)
  - packages/moost-*/ — Moost framework users
  - packages/vscode/ — VSCode extension users
  - plugin-development/ — plugin/language extension developers
- Use code examples liberally, especially `.as` file examples
- Use the `atscript` language tag for `.as` code blocks (custom grammar is registered)
- Keep pages focused — one concept per page
- **Avoid content duplication across pages**: Each topic should have ONE authoritative page. Other pages that touch on the topic should provide a brief mention and link to the dedicated page for details. For example, if JSON Schema has its own page, the Configuration page should reference it rather than repeating the full explanation. When updating docs, check for and eliminate existing duplication.
- When showing language-specific output, clearly label it (e.g., "TypeScript output", "Generated .d.ts")

## Mapping: Source Code → Documentation

| Package Source | Documentation Location |
|---------------|----------------------|
| `packages/core/src/` | `docs/docs/plugin-development/` |
| `packages/typescript/src/` | `docs/docs/packages/typescript/` |
| `packages/mongo/src/` | `docs/docs/packages/mongo/` |
| `packages/moost-mongo/src/` | `docs/docs/packages/moost-mongo/` |
| `packages/moost-validator/src/` | `docs/docs/packages/moost-validator/` |
| `packages/unplugin/src/` | `docs/docs/packages/typescript/build-setup.md` |
| `packages/vscode/` | `docs/docs/packages/vscode/` |

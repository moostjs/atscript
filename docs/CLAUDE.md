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
├── index.md               — Homepage
├── guide/                 — Getting Started (COMPLETE — 10 pages, ~2100 lines)
├── concepts/              — Core Concepts (8 STUB files — needs content)
├── packages/
│   ├── core/              — @atscript/core docs (9 STUB files)
│   ├── typescript/        — @atscript/typescript docs (8 STUB files)
│   ├── mongo/             — @atscript/mongo docs (9 STUB files)
│   ├── moost-mongo/       — @atscript/moost-mongo docs (6 STUB files)
│   ├── moost-validator/   — @atscript/moost-validator docs (6 STUB files)
│   ├── unplugin/          — unplugin-atscript docs (8 STUB files)
│   └── vscode/            — VSCode extension docs (7 STUB files)
├── api/                   — API Reference (6 STUB files)
├── examples/              — Usage Examples (7 STUB files)
├── integrations/          — Framework Integrations (7 STUB files)
├── advanced/              — Advanced Topics (8 STUB files)
└── public/                — Static assets (logo, images)
```

## Current Coverage

| Section | Status | Pages |
|---------|--------|-------|
| guide/ | COMPLETE | 10 pages with full content |
| concepts/ | EMPTY STUBS | 8 files, 0 content |
| packages/*/ | EMPTY STUBS | 53 files across 7 packages, 0 content |
| api/ | EMPTY STUBS | 6 files, 0 content |
| examples/ | EMPTY STUBS | 7 files, 0 content |
| integrations/ | EMPTY STUBS | 7 files, 0 content |
| advanced/ | EMPTY STUBS | 8 files, 0 content |

## VitePress Config Key Details

- **Config file**: `docs/docs/.vitepress/config.ts`
- **Custom Atscript syntax highlighting grammar** embedded in config
- **Plugin**: `vitepress-plugin-llmstxt` for LLM-friendly text generation
- **Nav**: Only "Guide" is active; Concepts, Packages, API, Examples are commented out
- **Sidebar**: Fully defined for all sections (ready to be uncommented when content exists)
- **Edit links**: Point to `https://github.com/moostjs/atscript/edit/main/docs/docs/:path`

## Multi-Language Documentation Architecture

Atscript is **language-agnostic** — `@atscript/typescript` is the first language extension, but Python, Java, and other language extensions are planned. The documentation must reflect this:

### Content Layers

1. **Shared / language-agnostic** (guide/, concepts/):
   - `.as` syntax, annotations, primitives, configuration
   - Core concepts (type system, plugin system, parser/AST)
   - This content applies to ALL language users regardless of their target stack

2. **Language-specific "worlds"** (packages/typescript/, future: packages/python/, packages/java/):
   - Each language extension gets a **self-contained section** covering the full journey:
     - Installation & setup for that language
     - Code generation specifics
     - Runtime utilities (validator, serializer, etc.)
     - CLI usage
     - Integration examples with that language's frameworks
   - A TypeScript user should be able to read guide/ + packages/typescript/ and have everything they need
   - A future Python user should read guide/ + packages/python/ similarly

3. **Plugin-specific** (packages/mongo/, packages/moost-mongo/, etc.):
   - These are framework/database integrations that may be language-specific or cross-language
   - Currently all TypeScript-ecosystem, but the pattern should allow for language-agnostic plugins too

### Key Principle

**Never merge language-specific content into the shared guide section.** The guide teaches `.as` syntax and concepts. Language extensions teach how those concepts materialize in a specific language. This separation ensures the docs scale naturally when new language extensions arrive.

## Writing Guidelines

- **Progressive complexity**: Beginner-friendly for guides/quick-start, increasingly technical for advanced/plugin topics
- **Target audience varies by section**:
  - guide/ — all developers wanting to learn Atscript syntax (language-agnostic)
  - packages/typescript/ — TypeScript developers using Atscript
  - packages/mongo/ — MongoDB users (currently TS-only, but concepts could be shared)
  - advanced/, concepts/ — plugin/extension developers
  - api/ — reference for all audiences
- Use code examples liberally, especially `.as` file examples
- Use the `atscript` language tag for `.as` code blocks (custom grammar is registered)
- Keep pages focused — one concept per page
- When showing language-specific output, clearly label it (e.g., "TypeScript output", "Generated .d.ts")

## Mapping: Source Code → Documentation

| Package Source | Documentation Location |
|---------------|----------------------|
| `packages/core/src/` | `docs/docs/packages/core/` + `docs/docs/concepts/` |
| `packages/typescript/src/` | `docs/docs/packages/typescript/` |
| `packages/mongo/src/` | `docs/docs/packages/mongo/` |
| `packages/moost-mongo/src/` | `docs/docs/packages/moost-mongo/` |
| `packages/moost-validator/src/` | `docs/docs/packages/moost-validator/` |
| `packages/unplugin/src/` | `docs/docs/packages/unplugin/` |
| `packages/vscode/` | `docs/docs/packages/vscode/` |

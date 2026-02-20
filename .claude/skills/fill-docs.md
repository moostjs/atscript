---
name: fill-docs
description: Populate empty documentation stub files with content. Specify a section like 'packages/core' or 'advanced'.
user_invocable: true
---

# Fill Documentation Stubs

You are tasked with populating empty documentation stub files with comprehensive content.

## Documentation Architecture

**Critical**: Atscript is language-agnostic. The TypeScript plugin is the FIRST language extension, but Python, Java, etc. will follow. The docs must reflect this:

1. **Language-specific "worlds"** (packages/typescript/, future: packages/python/) — **self-contained** sections covering the full journey for each target language. Common .as concepts are included via shared fragments.
2. **Plugin-specific** (packages/mongo/, packages/moost-\*/) — framework/database integrations nested under their language in navigation.
3. **Plugin Development** (plugin-development/) — for plugin/language extension creators. Core architecture, AST, hooks, code generation, LSP.

**Navigation**: TypeScript dropdown (Guide, MongoDB, Moost) | VSCode | Plugin Development

When filling docs, clearly label language-specific output (e.g., "TypeScript output", "Generated .d.ts").

### Shared Fragments

To keep language-specific sections self-contained without duplicating content, use **shared markdown fragments**:

- **Location**: `docs/docs/_fragments/` — reusable `.md` snippets for common Atscript concepts
- **Include syntax**: `<!--@include: ../../_fragments/fragment-name.md-->` (adjust relative path based on file location)
- **When to create a fragment**: When the same conceptual content (e.g., annotation syntax, primitive types) needs to appear across multiple language-specific sections
- **Pattern**: Include the fragment, then add section-specific context or examples around it

## Usage

The user will specify which section to fill, e.g.:

- `/fill-docs packages/mongo` -- Fill all stub files in `docs/docs/packages/mongo/`
- `/fill-docs plugin-development` -- Fill all stub files in `docs/docs/plugin-development/`
- `/fill-docs packages/vscode` -- Fill VSCode extension docs
- `/fill-docs packages/moost-mongo` -- Fill Moost MongoDB integration docs

If no section is specified, ask which section to fill.

## Steps

1. **Identify stubs**: Check the target directory for empty or near-empty `.md` files.

2. **Gather source knowledge**: Use the appropriate domain expert agent to deeply understand the package/feature:
   - Read the corresponding `CLAUDE.md` file for quick context
   - Use the domain expert agent for detailed code exploration
   - Read existing documentation in `packages/typescript/` for style reference

3. **Write documentation**: For each stub file, use the `vitepress-docs-architect` agent to write content. Follow these principles:
   - **Progressive complexity**: Match the audience level to the topic
   - **Code examples**: Include practical `.as` file examples and usage examples
   - **Structure**: Use VitePress markdown features (tip/warning/danger containers, code groups, line highlighting)
   - **Cross-references**: Link to related pages within the documentation
   - **No duplication**: If a topic already has a dedicated page, reference it with a brief mention and link rather than repeating the content. Each concept should have ONE authoritative page.
   - **Language awareness**: In language-specific sections, clearly identify the target language. In shared sections, keep content universal.

4. **Check sidebar**: Verify that the VitePress config (`docs/docs/.vitepress/config.ts`) has the sidebar entries for the filled pages. Uncomment nav items if needed.

5. **Report**: List all files populated and any remaining gaps.

## Section-specific guidance

### packages/typescript/ docs (COMPLETE — reference for style)

- This is a **self-contained world** for TypeScript developers — already fully written
- Uses shared fragments from `_fragments/` for common .as concepts
- Use this as the style reference when filling other sections

### packages/mongo/ docs

- TypeScript-specific MongoDB integration
- Cover annotations, collections, indexes, validation
- Separate annotation documentation from runtime classes

### packages/moost-mongo/ and packages/moost-validator/ docs

- Moost framework integrations (TypeScript-specific)
- Cover controllers, decorators, DTOs, validation pipes

### packages/vscode/ docs

- VSCode extension: syntax highlighting, LSP, diagnostics
- Target audience: all Atscript users wanting IDE support

### plugin-development/ docs

- Target plugin/extension developers who want to create new language extensions or LSPs
- Language-agnostic: describes the parser, AST, plugin system, annotation system
- Include complete code examples referencing `@atscript/core` APIs
- Do NOT include TypeScript-specific examples; use generic `.as` examples
- Document the plugin lifecycle and extension points

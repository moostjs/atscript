---
name: fill-docs
description: Populate empty documentation stub files with content. Specify a section like 'packages/core' or 'advanced'.
user_invocable: true
---

# Fill Documentation Stubs

You are tasked with populating empty documentation stub files with comprehensive content.

## Multi-Language Documentation Architecture

**Critical**: Atscript is language-agnostic. The TypeScript plugin is the FIRST language extension, but Python, Java, etc. will follow. The docs must reflect this:

1. **Shared content** (guide/, concepts/) — language-agnostic `.as` syntax and concepts. Applies to ALL users.
2. **Language-specific "worlds"** (packages/typescript/, future: packages/python/) — self-contained sections for each target language. A TypeScript user reads guide/ + packages/typescript/ and has everything.
3. **Plugin-specific** (packages/mongo/, packages/moost-*/) — framework/database integrations.

**Never merge language-specific content into the shared guide section.** When filling docs, clearly label language-specific output (e.g., "TypeScript output", "Generated .d.ts").

## Usage

The user will specify which section to fill, e.g.:
- `/fill-docs packages/core` -- Fill all stub files in `docs/docs/packages/core/`
- `/fill-docs advanced` -- Fill all stub files in `docs/docs/advanced/`
- `/fill-docs packages/typescript` -- Fill TypeScript language extension docs
- `/fill-docs concepts` -- Fill concept pages

If no section is specified, ask which section to fill.

## Steps

1. **Identify stubs**: Check the target directory for empty or near-empty `.md` files.

2. **Gather source knowledge**: Use the appropriate domain expert agent to deeply understand the package/feature:
   - Read the corresponding `CLAUDE.md` file for quick context
   - Use the domain expert agent for detailed code exploration
   - Read existing documentation in the `guide/` section for style reference

3. **Write documentation**: For each stub file, use the `vitepress-docs-architect` agent to write content. Follow these principles:
   - **Progressive complexity**: Match the audience level to the topic
   - **Code examples**: Include practical `.as` file examples and usage examples
   - **Structure**: Use VitePress markdown features (tip/warning/danger containers, code groups, line highlighting)
   - **Cross-references**: Link to related pages within the documentation
   - **Language awareness**: In language-specific sections, clearly identify the target language. In shared sections, keep content universal.

4. **Check sidebar**: Verify that the VitePress config (`docs/docs/.vitepress/config.ts`) has the sidebar entries for the filled pages. Uncomment nav items if needed.

5. **Report**: List all files populated and any remaining gaps.

## Section-specific guidance

### packages/typescript/ docs (Language-Specific World)
- This is a **self-contained world** for TypeScript developers
- Overview: what this extension provides, who it's for
- Cover: installation, codegen pipeline, runtime utilities (validator, serializer, JSON schema), CLI (`asc`)
- Show both `.as` input AND TypeScript output side by side
- Include Moost integration examples if relevant
- A reader should be able to use Atscript with TypeScript after reading guide/ + this section

### packages/core/ docs (Shared Foundation)
- Language-agnostic: describes the parser, AST, plugin system
- Target audience: plugin developers and contributors
- Do NOT include TypeScript-specific examples; use generic `.as` examples

### packages/mongo/ docs
- Currently TypeScript-specific but concepts (annotations) are language-agnostic
- Separate annotation documentation (universal) from runtime classes (TypeScript-specific)

### concepts/ docs
- Explain "why" and "how" at an architectural level
- Keep language-agnostic — describe the `.as` language and its design principles
- Reference source code locations for readers who want to dive deeper

### advanced/ docs
- Target plugin/extension developers who want to create new language extensions
- Include complete code examples
- Document the plugin lifecycle and extension points

### examples/ docs
- Complete, working examples with step-by-step walkthroughs
- Show `.as` file + target language usage + expected output
- Label the target language clearly (currently TypeScript)

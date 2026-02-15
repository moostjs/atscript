---
name: update-docs
description: Analyze recent code changes and update corresponding documentation. Use after modifying source code to keep docs in sync.
user_invocable: true
---

# Update Documentation

You are tasked with analyzing recent code changes and updating the corresponding documentation in the VitePress site.

## Steps

1. **Analyze changes**: Run `git diff --name-only` (or `git diff HEAD~1 --name-only` if already committed) to identify which files changed.

2. **Map changes to docs**: Use this mapping to find affected documentation:
   | Source | Documentation |
   |--------|--------------|
   | `packages/core/src/` | `docs/docs/plugin-development/` |
   | `packages/typescript/src/` | `docs/docs/packages/typescript/` |
   | `packages/mongo/src/` | `docs/docs/packages/mongo/` |
   | `packages/moost-mongo/src/` | `docs/docs/packages/moost-mongo/` |
   | `packages/moost-validator/src/` | `docs/docs/packages/moost-validator/` |
   | `packages/unplugin/src/` | `docs/docs/packages/typescript/build-setup.md` |
   | `packages/vscode/` | `docs/docs/packages/vscode/` |

3. **Identify what changed**: For each changed source file, use the appropriate domain expert agent to understand the nature of the change:
   - `atscript-core-expert` for core changes
   - `atscript-typescript-expert` for typescript changes
   - `atscript-mongo-expert` for mongo changes
   - `moost-atscript-expert` for moost-mongo or moost-validator changes
   - `vscode-extension-expert` for vscode changes

4. **Update documentation**: Use the `vitepress-docs-architect` agent to update the relevant documentation files. For each doc file:
   - If the file is a stub (empty or near-empty), note it in the report but don't fill it (use `/fill-docs` for that)
   - If the file has content, update it to reflect the code changes
   - Update any code examples that reference changed APIs
   - Update any feature descriptions that changed

5. **Update CLAUDE.md if needed**: If the change affects the package's public API, key files, or important patterns, update the corresponding `CLAUDE.md` file too.

6. **Report**: Summarize what was updated and what documentation gaps were found.

## Guidelines

- Follow the project's progressive complexity documentation style
- Use `atscript` language tag for `.as` code examples
- Keep each documentation page focused on a single concept
- Don't modify the VitePress config unless the navigation structure needs to change
- **Avoid content duplication**: When a topic has a dedicated page, other pages should provide a brief mention and link to it for details rather than repeating the same explanation. When updating a page, check related pages for duplicated content and consolidate — keep the detailed content on the authoritative page and replace duplicates with cross-reference links.
- **Use shared fragments for cross-section content**: When common Atscript knowledge needs to appear across language-specific sections, use fragments from `docs/docs/_fragments/` included via `<!--@include: ../../_fragments/fragment-name.md-->`. When updating common concepts, check if a fragment exists and update it there so all including pages stay in sync. If common content is duplicated inline across sections, consider extracting it into a fragment.

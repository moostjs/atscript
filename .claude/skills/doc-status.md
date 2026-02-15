---
name: doc-status
description: Check documentation coverage and identify stale or missing docs across the project.
user_invocable: true
---

# Documentation Status Report

You are tasked with generating a comprehensive documentation coverage report.

## Steps

1. **Scan all doc files**: Check every `.md` file under `docs/docs/` and categorize:
   - **Complete**: Has substantial content (>20 lines of non-empty content)
   - **Stub**: Exists but empty or nearly empty (<20 lines)
   - **Missing**: Referenced in VitePress sidebar config but file doesn't exist

2. **Check staleness**: For documentation files that have content, compare the last-modified date of the doc file against the corresponding source files to identify potentially stale docs:
   - Use `git log -1 --format="%ai" -- <file>` to get last modification dates
   - Flag docs that are significantly older than their source code

3. **Check CLAUDE.md coverage**: Verify each package has a CLAUDE.md and it's reasonably current.

4. **Generate report**: Format as a table:

   ```
   ## Documentation Coverage Report

   ### Summary
   - Total doc files: X
   - Complete: X (X%)
   - Stubs: X (X%)
   - Missing: X

   ### By Section
   | Section | Complete | Stub | Missing | Stale? |
   |---------|----------|------|---------|--------|
   | packages/typescript/ | X/X | ... | ... | ... |
   | packages/mongo/ | ... | ... | ... | ... |
   | packages/moost-mongo/ | ... | ... | ... | ... |
   | packages/moost-validator/ | ... | ... | ... | ... |
   | packages/vscode/ | ... | ... | ... | ... |
   | plugin-development/ | ... | ... | ... | ... |

   ### Language-Specific Worlds
   | Language | Section | Coverage | Self-Contained? | Uses Fragments? |
   |----------|---------|----------|-----------------|-----------------|
   | TypeScript | packages/typescript/ | X% | Yes/No | Yes/No |
   | (future) Python | packages/python/ | N/A | N/A | N/A |

   ### Recommended Actions
   1. [Priority] Fill stubs in plugin-development/ (16 files)
   2. [Priority] Fill stubs in packages/mongo/ (9 files)
   ...
   ```

5. **Check shared fragments**: Scan `docs/docs/_fragments/` for existing fragments and check:
   - Which guide pages and language-specific pages include them
   - Whether common content is duplicated inline across sections instead of using fragments
   - Flag opportunities to extract inline content into shared fragments

6. **Check VitePress nav**: Report the current navigation structure from `.vitepress/config.ts` and verify all sidebar sections have corresponding content.

## Output

Present the report directly to the user. Include actionable recommendations sorted by priority (most impactful sections first).

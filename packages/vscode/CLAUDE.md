# @atscript/vscode

VSCode extension providing syntax highlighting, LSP with go-to-definition, completions, diagnostics, hover, find-references, and rename for `.as` files.

## Key Source Files

### Client (extension host process)

- `client/extension.ts` -- Extension entry point. Activates language server, handles dependency resolution, auto-installs missing deps, sets up file watchers.

### Server (language server process)

- `server/server.ts` -- LSP connection bootstrap. Registers capabilities and instantiates `VscodeAtscriptRepo`.
- `server/repo.ts` -- Core LSP logic. Extends `AtscriptRepo`. Implements all LSP handlers: completion, hover, go-to-definition, find-references, rename, signature help, diagnostics.
- `server/utils.ts` -- Helpers: `addImport`, `createInsertTextRule`, `getItnFileCompletions`.
- `server/utils.spec.ts` -- Unit tests for utils.

### Syntax & Config

- `syntaxes/atscript.tmLanguage.json` -- TextMate grammar (scope: `source.atscript`).
- `language-configuration.json` -- Brackets, comments, folding, indentation rules.

## Features

- **Syntax highlighting**: Annotations, keywords, property names, type references, strings, numbers, comments, operators.
- **Completions**: Context-aware for annotations, imports (identifiers + file paths), type references (with auto-import), annotate-block properties, keywords.
- **Hover**: Documentation for annotations and type references.
- **Go to definition / Find references / Rename**: Cross-file symbol navigation.
- **Signature help**: Annotation argument signatures. Triggers: `,` and space.
- **Diagnostics**: Real-time errors and unused-token hints.
- **Auto-generate `.d.ts`**: On save, builds `.as.d.ts` via `BuildRepo`.
- **Config watching**: Reloads on `atscript.config.*` changes.

## LSP Architecture

- **Two-process model**: Client (`dist/extension.cjs`) in extension host, Server (`dist/server.cjs`) as separate Node process via IPC.
- **`VscodeAtscriptRepo`** extends `AtscriptRepo` with change/revalidate queues (debounced at 100ms).
- **Dependency bootstrap**: Checks local then global `@atscript/core`. Auto-installs if missing.
- **Completion trigger characters**: `@`, `.`, `,`, `{`, `'`, `"`.

## Commands

```bash
pnpm build                              # Build from repo root
cd packages/vscode && pnpm test         # Run unit tests
cd packages/vscode && pnpm run package  # Package as .vsix
pnpm vscode                            # Publish (renames to atscript-as, publishes, reverts)
```

## Important patterns

- **Build output**: Two CJS bundles: `dist/extension.cjs` (client) and `dist/server.cjs` (server).
- **Package naming**: Workspace name `@atscript/vscode`, published as `atscript-as` (publisher: `moost`).
- **Error resilience**: Broken configs fall back to default `PluginManager` so LSP doesn't crash.
- **Queue-based validation**: Changes processed through `changeQueue` and `revalidateQueue` with deduplication.
- **Only runtime dependency**: `@atscript/core` (workspace:^ in dev, pinned on publish).

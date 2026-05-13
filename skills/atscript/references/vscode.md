# VSCode extension

`@atscript/vscode` — syntax highlighting, diagnostics, go-to-def, hover, completions, on-save regen for `.as`.

## Install

Marketplace: search **"Atscript"** (publisher: `moost`, ID `moost.atscript-as`), or:

```
ext install moost.atscript-as
```

No configuration needed — walks up from the open `.as` to find `atscript.config.*`.

## Features

- **Syntax highlighting** — TextMate grammar for annotations, primitives, keywords, regex literals in pattern properties.
- **Diagnostics** — parse errors + plugin messages surface as VSCode problems with file/line/column.
- **Completions**:
  - `@` → every registered annotation namespace (`@meta.*`, `@expect.*`, `@emit.*`, plugin-contributed), with docstrings.
  - `.` in type position → primitive extensions (e.g. `string.` → `email`, `uuid`, `required`, …).
  - Inside `import { … } from ''` → file paths + exported identifiers (auto-import on type references).
  - Annotate-block property completions + context-aware keywords.
- **Hover** — annotation → `AnnotationSpec.description`; type/interface → one-line summary.
- **Go-to-definition** — cross-file.
- **Find-references** — all usages of a type/primitive.
- **Rename** — refactor-safe across all `.as`.
- **Signature help** — inside annotation args, shows expected parameter types. Triggers: `,` and space.
- **Generate on save** — runs `BuildRepo.write({ format: DEFAULT_FORMAT })` whenever a `.as` is saved. The TS plugin treats `DEFAULT_FORMAT` like `'dts'`, so only `.as.d.ts` is written (plus `atscript.d.ts` via `buildEnd`). Runtime `.as.js` is **not** emitted on save — bundlers via `unplugin-atscript` produce that.

## Commands & settings

One command: `Atscript: Restart Language Server` (`atscript.restartServer`), via command palette.

No user-facing settings. Behavior is driven by `atscript.config.*`.

Extension ships `configurationDefaults` that enable file-nesting for `.as` / `.as.d.ts` pairs and tune semantic-highlight colors for doc tokens. These are defaults the user can override in workspace settings — not settings the extension reads.

## Config discovery

Server walks up from each open `.as` toward workspace root for `atscript.config.{ts,mts,cts,js,mjs,cjs}`. Found configs reload on change (or change of any imported file).

- Malformed config → diagnostic on the offending file; server does not crash; default config used until fixed.
- `atscript.config.*` changes trigger re-analyze of open documents.

## LSP architecture

Two processes:

- **Client** — thin extension, forwards events.
- **Server** — long-running Node, wraps `AtscriptRepo` with debounced queues (~100 ms) + incremental diagnostics.

Server extends `AtscriptRepo` from `@atscript/core` with LSP bookkeeping (file URI → `AtscriptDoc`, LSP position → token lookup via `TokensIndex`). Plugin hooks run inside the server, so plugin-contributed annotations appear in completions/hovers automatically.

## Dependency bootstrap

Extension needs `@atscript/core` at runtime. Resolution order:

1. Workspace-local `node_modules/@atscript/core` (any open workspace folder).
2. Extension's own `node_modules/@atscript/core`.

If neither resolves, the extension shows a warning ("`@atscript/core` not found … Retrying in 60s") and re-checks every 60 seconds. No global lookup, no bundled fallback, no auto-install prompt. Install `@atscript/core` in the workspace to enable the LSP.

## Troubleshooting

- **Highlighting works but no diagnostics / completions** — server failed to start. Open _Output → Atscript Language Server_.
- **Completions missing for a new plugin annotation** — run _Atscript: Restart Language Server_.
- **`atscript.d.ts` not regenerating** — run `npx asc -f dts`, or save any `.as` to trigger the built-in on-save build.
- **Wrong config picked up in a monorepo** — server walks up from the open `.as`. Place `atscript.config.*` at the package root, or open the package as the workspace folder; then restart the server.

## See also

- [config.md](config.md) — config shape.
- [asc-cli.md](asc-cli.md) — CLI equivalent of generate-on-save.
- [plugin-development.md](plugin-development.md) — how plugin annotations show in hovers/completions.

# `asc` CLI

Shipped by `@atscript/typescript`. Reads `atscript.config.*`, parses `.as` files, runs plugin `render` + `buildEnd`, writes outputs.

## Invocation

```bash
npx asc [options]
```

Global:

```bash
npm i -g @atscript/typescript
asc --help
```

In `package.json`:

```json
{
  "scripts": {
    "postinstall": "asc -f dts",
    "gen:types": "asc -f dts",
    "gen:runtime": "asc -f js",
    "check": "asc --noEmit"
  }
}
```

## Flags

| Flag           | Shape                         | Effect                                                                                                                                  |
| -------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `-c <path>`    | path                          | Use a specific config. Default: walk up from CWD.                                                                                       |
| `-f <format>`  | `dts` / `js` / plugin-defined | Output format. Omit → `DEFAULT_FORMAT` (each plugin emits its primary output; TS plugin emits `.d.ts`). Pass `-f js` for runtime `.js`. |
| `--noEmit`     | flag                          | Parse + diagnose, write nothing. Exit code mirrors diagnostic severity. Use in CI.                                                      |
| `--skipDiag`   | flag                          | Skip diagnostics, always emit.                                                                                                          |
| `--help`, `-h` | flag                          | Usage.                                                                                                                                  |

**Errors ⇒ nothing is emitted** (since 0.1.90). Any error-severity diagnostic blocks the whole write — previous outputs stay untouched — and `asc` prints `Nothing emitted — previous outputs were left untouched. Fix the errors above, or pass --skipDiag to emit anyway.` before exiting `1`. `--skipDiag` forces the emit; warnings never block. Writes are atomic (temp file + rename), so a watcher never sees a half-written output.

## `db sync` subcommand

`asc db sync` ships in `@atscript/typescript` so one `asc` binary covers both codegen and schema sync. It drives the DB adapters from the **separate** `@atscript/db-*` packages (`@atscript/db` repo) and needs a `db` section in `atscript.config.*` plus an installed adapter to do anything. Flags: `--dry-run`, `--yes` (CI), `--force`, `--safe` (skip drops), `-c <path>`.

CI-grade plan output (all plan-only — never apply):

| Flag                    | Effect                                                                                                                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--check`               | Exit `0` up-to-date, `1` changes needed, `2` destructive changes present. Gate builds / require approval on `2`. (`--dry-run` also never applies but always exits `0` — human preview vs CI gate.) |
| `-f, --format json`     | Structured plan (`status`, `schemaHash`, `destructive`, per-entry column/type/FK diffs) on stdout; decorative logs muted.                                                                          |
| `-f, --format markdown` | Same plan rendered for PR comments.                                                                                                                                                                |
| `--out <file>`          | Write `--format` output to a file (console output stays intact). Composable: `--check --format json --out plan.json`.                                                                              |

**Complete inventory or abort** (since 0.1.90). A model that fails to load looks like a deleted table, so the CLI never plans from a partial set:

- Diagnostics run before compiling; any error prints the messages then `Fix the errors above before syncing.` → exit `1`.
- Each compiled module is imported on its own; failures print as `✖ <file>: <message>` then `Could not load N compiled model module(s); aborting before planning — a partial inventory would propose dropping tables.` → exit `1`, before any adapter connects.
- Compiled models keep their source directory layout, so cross-directory `.as` imports resolve and same-basename files in different folders no longer collide.
- `config.models` (see [config.md](config.md)) adds package-shipped models to the inventory; `Loaded N packaged model(s) from config.models`. A throwing callback exits `1`.

Full sync semantics → https://db.atscript.dev/sync/. Don't document DB-schema behavior here — it lives in the `atscript-db` skill/docs.

## Outputs

Per `foo.as`:

- **`foo.as.d.ts`** — TS types. `declare class Foo` with static `type`, `metadata`, `validator()` (plus a `declare namespace Foo` for type-aliases). JSDoc headers are generated (entity name + `@see`); source comments are not preserved.
- **`foo.as.js`** — runtime metadata (`defineAnnotatedType()` chains). What `import { Foo } from './foo.as'` evaluates to.

Project root (or config-specified location):

- **`atscript.d.ts`** — global ambient decls. `AtscriptMetadata` (return types for `metadata.get(...)`) + `AtscriptPrimitiveTags` (TS shape per primitive). Emitted from each plugin's `buildEnd` — one per config, not per `.as`.

**Never hand-edit** any of these. Overwritten on next run.

## Watch

`asc` has no built-in watcher. Options:

- Bundler — `unplugin-atscript` (Vite/Webpack/Rolldown/…) regenerates on demand with HMR. See [unplugin.md](unplugin.md).
- Editor — VSCode extension runs the parser in-process via LSP; optionally regenerates on save. See [vscode.md](vscode.md).
- File-watcher script — wrap `asc` in `chokidar-cli` / `nodemon` / `watchexec`.

## Exit codes

- `0` — success or warnings only.
- `1` — errors (unless `--skipDiag`, where errors are reported but exit code is unchanged). Nothing is written on `1`.
- `db sync`: `1` also covers error diagnostics, unloadable model modules, and a throwing `config.models`; `--check` adds `2` for destructive changes.

## Troubleshooting

- **No output.** Config has zero plugins. Add `ts()` at least.
- **`Cannot find atscript.config.*`.** Pass `-c <path>` or run from a subdirectory of the project root.
- **`atscript.d.ts` missing annotation keys.** Rerun `asc -f dts` — rewritten from currently-registered specs.
- **Diagnostics on a line you didn't edit.** Usually a transitively-imported broken `.as`. Read full output; `TMessages` includes file paths.

## Programmatic

```ts
import { build } from '@atscript/core'

// build() accepts Partial<TAtscriptConfigInput> — same shape as defineConfig().
const result = await build({
  rootDir: '/abs/path/to/project',
  include: ['**/*.as'],
  plugins: [ts()],
})
```

See [config.md](config.md) for the config shape and [plugin-development.md](plugin-development.md) for plugin hooks.

# CLI

The `asc` command compiles `.as` files using your project's Atscript configuration.

## Usage

```bash
npx asc [options]
```

## Options

| Option                  | Description                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `-c, --config <path>`   | Path to config file. If omitted, auto-detects `atscript.config.{js,mjs,cjs,ts,mts,cts}` walking up from the CWD (JS variants are checked first in each directory). |
| `-f, --format <format>` | Output format (`dts` or `js`). If omitted, the TypeScript plugin emits `.d.ts` (its default branch); pass `-f js` to get `.js` output.                             |
| `--noEmit`              | Run diagnostics only, don't write files                                                                                                                            |
| `--skipDiag`            | Skip diagnostics, always emit files — the only way to emit while errors are present                                                                                |
| `--help`                | Display help                                                                                                                                                       |

## Examples

```bash
# Generate .d.ts files (default)
npx asc

# Generate .js files with runtime metadata
npx asc -f js

# Use a specific config file
npx asc -c path/to/atscript.config.ts

# Validate without writing files (CI/lint check)
npx asc --noEmit

# Emit without running diagnostics
npx asc --skipDiag
```

The CLI logs created files, errors, and warnings with color-coded output. It exits with code `1` if any errors are found (unless `--skipDiag` is set).

::: warning Errors ⇒ nothing is emitted
Since 0.1.90, when diagnostics report at least one error `asc` writes **no** files at all — your previous `.d.ts` / `.js` outputs and the generated `atscript.d.ts` are left untouched, and the run ends with:

```
Nothing emitted — previous outputs were left untouched. Fix the errors above, or pass --skipDiag to emit anyway.
```

This keeps a broken compile from replacing valid artifacts with empty or partial ones. Warnings never block the emit. Pass `--skipDiag` to emit regardless, or `--noEmit` to only check.

Writes are also atomic: each output goes to a temp file that is renamed over the target, so a watching dev server or type checker never reads a half-written file.
:::

::: tip
If no config file is found, the CLI still runs with the TypeScript plugin enabled and emits `.d.ts` — so `npx asc` works out of the box.
:::

## Database Schema Sync

The CLI also includes a `db sync` command for synchronizing your database schema with your `.as` definitions.

::: info
The `db sync` subcommand is bundled with `@atscript/typescript` so that a single `asc` binary covers both codegen and schema sync, but it drives adapters from the separate [`@atscript/db-*`](https://db.atscript.dev) packages — the adapter (`@atscript/db-sqlite`, `@atscript/db-mongo`, …) must be installed and referenced from the config's `db` section for this command to do anything. Full reference at [db.atscript.dev](https://db.atscript.dev/).
:::

```bash
npx asc db sync [options]
```

| Option                  | Description                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `-c, --config <path>`   | Path to config file                                                                   |
| `--dry-run`             | Show planned changes without applying                                                 |
| `--yes`                 | Skip confirmation prompt (for CI/CD)                                                  |
| `--force`               | Re-sync even if schema hash matches                                                   |
| `--safe`                | Skip destructive operations (drops)                                                   |
| `--check`               | Plan only; exit `1` when changes are needed, `2` when destructive changes are present |
| `-f, --format <format>` | Emit the plan as `json` or `markdown` instead of applying (plan-only mode)            |
| `--out <path>`          | Write `--format` output to a file instead of stdout                                   |

```bash
# Preview changes
npx asc db sync --dry-run

# Auto-approve for CI
npx asc db sync --yes

# Safe mode — only additive changes
npx asc db sync --safe

# CI gate — fail the build when the schema has drifted
npx asc db sync --check

# Attach the plan to a PR
npx asc db sync --format markdown --out schema-plan.md

# Machine-readable plan on stdout (decorative logs are muted)
npx asc db sync --format json
```

### The inventory must be complete

A sync plan is a diff between your `.as` models and the live schema — so a model the CLI failed to load looks exactly like a table you deleted, and the plan proposes dropping it. Since 0.1.90 `asc db sync` refuses to plan from a partial inventory:

1. **Diagnostics run first.** Any error-severity message is printed and the command exits `1` with `Fix the errors above before syncing.` Warnings are printed and do not block.
2. **Every compiled model module is imported individually.** Failures are collected rather than ending the loop, then printed one per line as `✖ <file>: <message>`, followed by:

   ```
   Could not load N compiled model module(s); aborting before planning — a partial inventory would propose dropping tables.
   ```

   and exit code `1`. No adapter connection is opened, and no plan is computed.

3. **Nested directories are preserved.** Models compiled for the sync keep their source layout, so `models/order.as` importing `../shared/money.as` resolves, and two `.as` files with the same basename in different folders no longer overwrite each other.

The temp directory used for the compiled models is created under the project root (so bare imports resolve through your `node_modules`) and removed when the command finishes — including when it aborts.

### Models that ship inside packages

At runtime you may register models the CLI never sees, e.g. `syncSchema(db, [...atscriptModels, PackagedModel])`. Declare those in the config so `asc db sync` plans against the same set:

```typescript
export default defineConfig({
  // ...
  models: () => import('some-package/models'),
})
```

The callback may return an array of annotated types, a module namespace object, or any nesting of the two; every export carrying `@db.table` or `@db.view` is added to the inventory and deduplicated by identity. The CLI reports `Loaded N packaged model(s) from config.models`. If the callback throws, the error is printed and the command exits `1` — same rule: never plan from a partial inventory.

### CI usage

`--check` and `--format` never apply changes — both are plan-only modes:

- `--check` exits `0` when the schema is up to date, `1` when changes are needed, and `2` when the pending changes include destructive operations (column/table drops, type changes). Use the distinct codes to require manual approval for destructive migrations only. It differs from `--dry-run`, which also never applies but always exits `0` — `--dry-run` is the human preview, `--check` is the CI gate.
- `--format json` emits a structured plan document (`status`, `schemaHash`, `destructive`, per-entry column/type/FK changes) on stdout; `--format markdown` renders the same plan for PR comments. Combine with `--out <file>` to keep the console output intact and write the document to a file.
- The two compose: `asc db sync --check --format json --out plan.json` gates the build _and_ saves the plan artifact.

This requires a `db` section in your config:

```typescript
export default defineConfig({
  // ...
  db: {
    adapter: '@atscript/db-sqlite',
    connection: './myapp.db',
  },
})
```

See the [Schema Sync guide](https://db.atscript.dev/sync/) for full documentation.

## Next Steps

- [Configuration](/packages/typescript/configuration) — config file options
- [Build Setup](/packages/typescript/build-setup) — bundler integration
- [Schema Sync](https://db.atscript.dev/sync/) — database migration guide

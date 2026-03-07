# CLI

The `asc` command compiles `.as` files using your project's Atscript configuration.

## Usage

```bash
npx asc [options]
```

## Options

| Option                  | Description                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `-c, --config <path>`   | Path to config file. If omitted, auto-detects `atscript.config.js` / `.ts` in the current directory |
| `-f, --format <format>` | Output format: `dts` or `js` (default: `dts`)                                                       |
| `--noEmit`              | Run diagnostics only, don't write files                                                             |
| `--skipDiag`            | Skip diagnostics, always emit files                                                                 |
| `--help`                | Display help                                                                                        |

## Examples

```bash
# Generate .d.ts files (default)
npx asc

# Generate .js files with runtime metadata
npx asc -f js

# Use a specific config file
npx asc -c path/to/atscript.config.js

# Validate without writing files (CI/lint check)
npx asc --noEmit

# Emit without running diagnostics
npx asc --skipDiag
```

The CLI logs created files, errors, and warnings with color-coded output. It exits with code `1` if any errors are found (unless `--skipDiag` is set).

::: tip
If no config file is found, the CLI defaults to `format: 'dts'` with the TypeScript plugin enabled — so `npx asc` works out of the box.
:::

## Database Schema Sync

The CLI also includes a `db sync` command for synchronizing your database schema with your `.as` definitions:

```bash
npx asc db sync [options]
```

| Option | Description |
|--------|-------------|
| `-c, --config <path>` | Path to config file |
| `--dry-run` | Show planned changes without applying |
| `--yes` | Skip confirmation prompt (for CI/CD) |
| `--force` | Re-sync even if schema hash matches |
| `--safe` | Skip destructive operations (drops) |

```bash
# Preview changes
npx asc db sync --dry-run

# Auto-approve for CI
npx asc db sync --yes

# Safe mode — only additive changes
npx asc db sync --safe
```

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

See the [Schema Sync guide](/db-integrations/schema-sync) for full documentation.

## Next Steps

- [Configuration](/packages/typescript/configuration) — config file options
- [Build Setup](/packages/typescript/build-setup) — bundler integration
- [Schema Sync](/db-integrations/schema-sync) — database migration guide

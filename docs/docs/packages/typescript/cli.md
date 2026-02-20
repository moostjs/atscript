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

## Next Steps

- [Configuration](/packages/typescript/configuration) — config file options
- [Build Setup](/packages/typescript/build-setup) — bundler integration

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

| Flag           | Shape                         | Effect                                                                                  |
| -------------- | ----------------------------- | --------------------------------------------------------------------------------------- |
| `-c <path>`    | path                          | Use a specific config. Default: walk up from CWD.                                       |
| `-f <format>`  | `dts` / `js` / plugin-defined | Output format. Default with `ts()`: `.d.ts` only. Pass `-f js` for runtime `.js`.       |
| `--noEmit`     | flag                          | Parse + diagnose, write nothing. Exit code mirrors diagnostic severity. Use in CI.      |
| `--skipDiag`   | flag                          | Skip diagnostics, always emit.                                                          |
| `--help`, `-h` | flag                          | Usage.                                                                                  |
| `--version`, `-v` | flag                       | Version.                                                                                |

## Outputs

Per `foo.as`:

- **`foo.as.d.ts`** — TS types. Companion `namespace` so `Foo.metadata.get(...)` and `Foo.validator()` are typed. Comments → JSDoc.
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
- `1` — errors (unless `--skipDiag`, where errors are reported but exit code is unchanged).

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

# Config

`atscript.config.{ts,mts,cts,js,mjs,cjs}` at project root. Discovered by walking up from any `.as` file.

## `defineConfig`

Types the shape and merges plugin contributions via `defu` (deep merge).

```js
import { defineConfig } from '@atscript/core'
import ts from '@atscript/typescript'

export default defineConfig({
  rootDir: './src',
  include: ['**/*.as'],
  exclude: ['**/node_modules/**'],
  plugins: [ts()],
})
```

TS configs (`.ts` / `.mts` / `.cts`) are bundled with rolldown before load — imports, `__dirname`, and top-level await all work.

## Fields

| Field         | Type                | Notes                                                                                                |
| ------------- | ------------------- | ---------------------------------------------------------------------------------------------------- |
| `rootDir`     | `string`            | Base dir; `include`/`exclude` resolve against it. Default: CWD.                                      |
| `include`     | `string[]`          | Globs of `.as` to parse. Default: `['**/*.as']`.                                                     |
| `exclude`     | `string[]`          | Globs to skip. `node_modules` + `dist` excluded by default.                                          |
| `entries`     | `string[]`          | Explicit entry files (relative to `rootDir`) — replaces glob discovery. Used by `prepareFixtures()`. |
| `outDir`      | `string`            | Where generated outputs go. Default: next to sources.                                                |
| `format`      | `string`            | Default format (`'dts'`, `'js'`, …). CLI `-f` overrides.                                             |
| `plugins`     | `TAtscriptPlugin[]` | Ordered. Empty array parses but generates nothing.                                                   |
| `primitives`  | nested object       | Extend built-in primitives. See [primitives.md](primitives.md).                                      |
| `annotations` | nested object       | Register custom annotations. See [annotations.md](annotations.md).                                   |

## Plugins

Stack in order; `config()` contributions merge via `defu`. Later plugins can refine earlier ones.

```js
export default defineConfig({
  plugins: [ts()],
})
```

With the DB layer (separate repo):

```js
import ts from '@atscript/typescript'
import { dbPlugin } from '@atscript/db/plugin'

export default defineConfig({
  plugins: [ts(), dbPlugin()],
})
```

## Inline primitives/annotations

Small extensions live in the config without a dedicated plugin.

- Custom primitives → `primitives.<base>.extensions`. See [primitives.md](primitives.md#extending-primitives-via-config).
- Custom annotations → `AnnotationSpec` under `annotations`. See [annotations.md](annotations.md#custom-annotations).

```js
export default defineConfig({
  plugins: [ts()],
  primitives: { /* … */ },
  annotations: { /* … */ },
})
```

## Discovery

CLI + unplugin look for `atscript.config.{ts,mts,cts,js,mjs,cjs}` walking up from CWD (or the `.as` file). `asc -c <path>` overrides.

When multiple formats coexist in the same dir, TS variants (`.ts` / `.mts` / `.cts`) load before JS variants (`.js` / `.mjs` / `.cjs`).

- VSCode reloads LSP on `atscript.config.*` changes.
- Unresolvable or throwing config → server falls back to defaults (parsing works, plugins contribute nothing).

## Defaults (no config found)

- Built-in primitives (`string`, `number`, `boolean`, …) with standard extensions.
- Built-in annotation specs (`@meta.*`, `@expect.*`).
- Zero plugins — nothing generated until a plugin is added (usually `ts()`).

## See also

- [asc-cli.md](asc-cli.md) — how `asc` consumes the config.
- [unplugin.md](unplugin.md) — auto-discovery in bundlers.
- [plugin-development.md](plugin-development.md) — plugin-contributed config.

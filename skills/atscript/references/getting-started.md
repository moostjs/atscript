# Getting started

## 1. Install

```bash
npm install @atscript/typescript @atscript/core
```

- `@atscript/core` — parser, plugin system, diagnostics.
- `@atscript/typescript` — codegen, runtime, `asc` CLI.

Verify: `npx asc --help`.

## 2. Minimal `atscript.config.js`

```js
import { defineConfig } from '@atscript/core'
import ts from '@atscript/typescript'

export default defineConfig({
  rootDir: './src',
  plugins: [ts()],
})
```

- `include` defaults to `['**/*.as']` (resolved under `rootDir`).
- `ts()` emits `.d.ts` by default; `-f js` switches to runtime `.js`.
- `.ts`/`.mts`/`.cts` configs also work (bundled via rolldown).

## 3. First `.as` file

```atscript
// src/models/user.as
export interface User {
  @meta.id
  id: string.uuid

  @meta.label 'Full name'
  @expect.minLength 1
  @expect.maxLength 200
  name: string

  @expect.pattern '^[^@]+@[^@]+$'
  email: string.email

  age?: number.int.positive
}
```

## 4. Generate

```bash
npx asc            # .d.ts (default)
npx asc -f dts     # explicit
npx asc -f js      # .js runtime metadata
```

Outputs next to `user.as`:

- `user.as.d.ts` — TS types. `User` is a `declare class` with static `type`, `metadata`, `validator()`.
- `user.as.js` — runtime tree (`defineAnnotatedType()` chains). Only on `-f js`.
- `atscript.d.ts` at project root — global `AtscriptMetadata` + `AtscriptPrimitiveTags`. Emitted by the dts `buildEnd`.

Typical: `asc -f dts` in `postinstall`; let `unplugin-atscript` produce `.js` inside the bundler. Run `-f js` only when runtime metadata is needed outside a bundler.

### When `.as.d.ts` regenerates

After every `.as` edit, the companion `.as.d.ts` must be regenerated for TS to see the change. This happens automatically in:

- the [VSCode extension](vscode.md) on save,
- [`unplugin-atscript`](unplugin.md) at bundle / dev-server time (runtime `.js` only — `.d.ts` is **not** produced by the unplugin, see [unplugin.md](unplugin.md)).

Run `npx asc -f dts` manually when you edit `.as` outside those environments — e.g. running `tsc` standalone, troubleshooting stale type errors on imports of new types, or in CI before type-check. A `"postinstall": "asc -f dts"` script keeps fresh clones / CI runs honest.

## 5. Consume

```ts
import { User } from './models/user.as'

const u: User = { id: '...', name: 'Ada', email: 'ada@example.com' }

const validator = User.validator()
validator.validate(u)            // throws on failure
const ok = validator.validate(u, true)  // safe mode → boolean

import { forAnnotatedType } from '@atscript/typescript/utils'
forAnnotatedType(User, {
  object(node) {
    const nameLabel = node.type.props.get('name')?.metadata.get('meta.label') // 'Full name'
  },
})
```

## 6. Bundler / Moost

- Bundler + HMR → [unplugin.md](unplugin.md)
- Moost request-body validation → [moost-validator.md](moost-validator.md)

## Troubleshooting

- `Cannot find module '*.as'` — install the [VSCode extension](vscode.md); ensure `atscript.config.*` is discoverable.
- `atscript.d.ts` stale / `AtscriptMetadata` missing keys — rerun `npx asc -f dts`.
- TS errors don't match source — ensure `.as.d.ts` / `atscript.d.ts` are up to date; rerun `asc` or your bundler.

## Next

- Authoring → [as-syntax.md](as-syntax.md), [annotations.md](annotations.md), [primitives.md](primitives.md)
- Setup → [config.md](config.md), [asc-cli.md](asc-cli.md)
- Consume → [runtime.md](runtime.md), [validation.md](validation.md)

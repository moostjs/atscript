# Testing with `.as` fixtures

When your tests depend on Atscript-compiled types — annotated interfaces with `@db.*`, `@meta.id`, custom annotations, or anything runtime metadata — compile those fixtures at test time from real `.as` files rather than hand-writing `defineAnnotatedType` (`$()`) builder chains. The builder API is designed for generated code and has subtle behaviors (metadata propagation, lazy flatten timing) that make hand-written fixtures unreliable.

`@atscript/typescript/test-utils` ships a single helper, `prepareFixtures()`, that compiles a set of `.as` files under a directory and writes the generated `.as.js` / `.as.d.ts` artifacts next to their sources.

## Quick start

```ts
import path from 'path'
import { beforeAll, describe, it } from 'vitest'

import { prepareFixtures } from '@atscript/typescript/test-utils'

const fixturesDir = path.join(__dirname, 'fixtures')

beforeAll(() => prepareFixtures({ rootDir: fixturesDir, entries: ['user.as'] }))

it('validates compiled user', async () => {
  const { User } = await import('./fixtures/user.as.js')
  // ...
})
```

`tsPlugin()` is injected for you — pass only the additional plugins your tests need. For example, `dbPlugin()` from [`@atscript/db`](https://db.atscript.dev) (sibling repo — install separately):

```ts
import { dbPlugin } from '@atscript/db/plugin'

await prepareFixtures({
  rootDir: fixturesDir,
  entries: ['order.as'],
  plugins: [dbPlugin()],
})
```

## Signature

```ts
interface PrepareFixturesOptions {
  rootDir: string // absolute path to the fixtures directory
  plugins?: TAtscriptPlugin[] // additional plugins (tsPlugin is auto-injected)
  include?: string[] // glob patterns; default ['**/*.as']
  entries?: string[] // explicit filenames; takes precedence over include
  formats?: Array<'js' | 'dts'> // default ['js', 'dts']
}

function prepareFixtures(options: PrepareFixturesOptions): Promise<void>
```

Defaults applied when the option is omitted:

| Option    | Default         | Notes                                                             |
| --------- | --------------- | ----------------------------------------------------------------- |
| `plugins` | `[]`            | `tsPlugin()` is always injected before any caller-supplied plugin |
| `include` | `['**/*.as']`   | Used only when `entries` is not provided                          |
| `entries` | `undefined`     | When set, narrows compilation to exactly those filenames          |
| `formats` | `['js', 'dts']` | Both formats generated each call; written only when content changed |

Generated `.as.js` / `.as.d.ts` artifacts are intended as test-run outputs — gitignore them (`*.as.js`, `*.as.d.ts`). `prepareFixtures()` recompiles them each run and rewrites only the ones whose content changed, so up-to-date artifacts keep their mtime.

## Production `.as` vs test fixtures

If your project has both production `.as` files (under `src/`) and `.as` test fixtures, separate their lifecycles:

**Production `.as`** — point `atscript.config.ts` at the production globs and add a `postinstall` script so `.as.d.ts` exists on fresh install:

```ts
// atscript.config.ts
import { defineConfig } from '@atscript/core'
import tsPlugin from '@atscript/typescript'

export default defineConfig({
  include: ['src/**/*.as'],
  exclude: ['**/test/**', '**/__test__/**', '**/__tests__/**'],
  plugins: [tsPlugin()],
})
```

```json
// package.json
{
  "scripts": {
    "postinstall": "asc"
  }
}
```

**Test fixtures** — compile in test-setup hooks with whatever plugin set the tests need (often a different set than production — feature-flag plugins, WIP plugins, or test-only mocks):

```ts
// src/__tests__/setup.ts
import path from 'path'

import { prepareFixtures } from '@atscript/typescript/test-utils'
import { dbPlugin } from '@atscript/db/plugin'

beforeAll(() =>
  prepareFixtures({
    rootDir: path.join(__dirname, 'fixtures'),
    plugins: [dbPlugin()],
  })
)
```

## See also

- [Configuration](./configuration) — `atscript.config.ts` shape and include/exclude globs
- [CLI](./cli) — the `asc` command used for production `.as` type generation

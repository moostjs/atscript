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
| `formats` | `['js', 'dts']` | Both formats are generated concurrently via `Promise.all`         |

The two `generate()` calls (`js` and `dts`) run in parallel, not sequentially, so total elapsed time is approximately `max(js_time, dts_time)`.

Every generated file is written with `writeFileSync` — there is no compare-and-skip optimization. Fixture artifacts are treated as test-run outputs whose mtime is expected to advance on every call.

## How fixtures are tracked in git

Fixture artifacts — the generated `.as.js` and `.as.d.ts` that sit next to every `.as` source — are **gitignored** in the Atscript repo:

```
*.as.js
*.as.d.ts
```

`prepareFixtures()` is the single source of both formats on every test run. A fresh clone has no fixture artifacts until the first time a test suite calls `prepareFixtures()` in its `beforeAll` (or Vitest `globalSetup`). The one-time UX cost is a transient window of IDE red squiggles on unrun spec files that reference `./fixtures/foo.as.js` — the first test run regenerates them and the squiggles disappear.

Rationale: `.as.js` and `.as.d.ts` are compilation outputs, not source. Committing them invites silent drift when core or codegen changes — the committed artifact stays frozen while test runs keep passing against stale files. Regenerating on every run guarantees tests always exercise the current codegen.

## Production `.as` vs test fixtures

Consumer projects that have both production `.as` files (under `src/`) and `.as` test fixtures get a clean separation of lifecycles.

**Production `.as` lifecycle** — configure `atscript.config.ts` to target production globs only, and add a `postinstall` script so `.as.d.ts` exists for lint/build/IDE tooling on fresh install:

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

**Test fixture lifecycle** — exclude test directories from the config above (they are already excluded in the example), then compile fixtures in test-setup hooks using whatever plugin set the tests require:

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

Why the split: test fixtures frequently declare different plugin sets than production code — a WIP plugin being developed in isolation, a feature-flag plugin tests enable explicitly, or a mock plugin used only for fixtures. Running `asc` over fixtures with the production config would either fail (missing plugins) or quietly produce wrong codegen.

`@atscript/typescript` itself has no production `.as` in its `src/` — fixtures are the only consumers — so the package ships **no `postinstall`**. `prepareFixtures()` running in test setup is sufficient.

## Parallel js + dts generation

Both output formats are generated concurrently:

```ts
await Promise.all(formats.map(format => repo.generate({ outDir: '.', format })))
```

Since `generate()` is independent per format, this trims roughly half the total time vs. a sequential `await` pair — meaningful when fixtures grow.

## See also

- [Configuration](./configuration) — `atscript.config.ts` shape and include/exclude globs
- [CLI](./cli) — the `asc` command used for production `.as` type generation

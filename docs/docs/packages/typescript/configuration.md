# Configuration

## Config File

Create an `atscript.config.js` (or `.ts`) in your project root:

```javascript
import { defineConfig } from '@atscript/core'
import ts from '@atscript/typescript'

export default defineConfig({
  rootDir: 'src',
  format: 'dts',
  plugins: [ts()],
})
```

### Options

| Option              | Type                                | Default                 | Description                                                                                                                                                                                                                                 |
| ------------------- | ----------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rootDir`           | `string`                            | Config file's directory | Directory containing your `.as` files                                                                                                                                                                                                       |
| `include`           | `string[]`                          | `['**/*.as']`           | Glob patterns for `.as` files to compile. Exclude test-fixture directories (`**/test/**`, `**/__test__/**`, `**/__tests__/**`) — see [Testing Fixtures](/packages/typescript/testing-fixtures) for the dedicated fixture-compilation helper |
| `exclude`           | `string[]`                          | `['node_modules']`      | Glob patterns to ignore                                                                                                                                                                                                                     |
| `format`            | `string`                            | Plugin-dependent        | Default output format for [CLI](/packages/typescript/cli). The TypeScript plugin supports `'dts'` (type declarations) and `'js'` (runtime code); defaults to `dts` when omitted                                                             |
| `unknownAnnotation` | `'error' \| 'warn' \| 'allow'`      | `'error'`               | How to handle annotations not defined in config                                                                                                                                                                                             |
| `plugins`           | `TAtscriptPlugin[]`                 | `[]`                    | Active plugins                                                                                                                                                                                                                              |
| `annotations`       | `object`                            | —                       | Custom annotation definitions (see [Custom Annotations](/packages/typescript/custom-annotations))                                                                                                                                           |
| `models`            | `() => unknown \| Promise<unknown>` | —                       | Extra Atscript models for [`asc db sync`](/packages/typescript/cli#models-that-ship-inside-packages), on top of the compiled `.as` files (since 0.1.90)                                                                                     |

### `models`

`asc db sync` builds its table inventory from your compiled `.as` files. Models that ship inside a package are not on disk in your project, so declare them here — otherwise the CLI plans against a smaller set than your runtime uses and proposes dropping the tables it cannot see.

```typescript
export default defineConfig({
  plugins: [ts()],
  db: { adapter: '@atscript/db-sqlite', connection: './myapp.db' },
  // a module namespace…
  models: () => import('some-package/models'),
  // …an array, or any nesting of the two
  // models: () => [PackagedOrder, PackagedInvoice],
})
```

Every export the callback exposes that is an annotated type carrying `@db.table` or `@db.view` is added to the inventory, deduplicated by identity. It is declared at the top level, so it works with both the declarative and the function form of `db`. Used only by `asc db sync` — it has no effect on codegen.

## Plugin Options

The TypeScript plugin accepts options via `ts({ ... })`:

```javascript
plugins: [ts({ jsonSchema: 'lazy' })]
```

### `jsonSchema`

Controls how JSON Schema support is handled in generated code. On the frontend, pulling in the `buildJsonSchema` function adds unnecessary weight when you don't need it — so Atscript lets you choose the right trade-off for your use case.

| Value               | Import added               | `toJsonSchema()` behavior                           |
| ------------------- | -------------------------- | --------------------------------------------------- |
| `false` _(default)_ | None                       | Throws a runtime error                              |
| `'lazy'`            | `buildJsonSchema` imported | Computed on first call, cached                      |
| `'bundle'`          | None                       | Pre-computed at build time, embedded as static JSON |

```javascript
// Default — no JSON schema overhead (best for frontend)
plugins: [ts()]

// Backend — lazy compute on demand
plugins: [ts({ jsonSchema: 'lazy' })]

// Backend — pre-compute at build time for fastest runtime
plugins: [ts({ jsonSchema: 'bundle' })]
```

Individual interfaces can also opt into build-time embedding via the `@emit.jsonSchema` annotation, regardless of the global setting. See [JSON Schema](/packages/typescript/json-schema) for full usage details, annotation constraints, and examples.

### `exampleData`

Controls whether generated types include a `toExampleData()` static method. When enabled, each generated class gets a method that creates example data using `@meta.example` annotations.

| Value               | `toExampleData()` behavior                                          |
| ------------------- | ------------------------------------------------------------------- |
| `false` _(default)_ | Not rendered in `.js`; `.d.ts` marks it as optional + `@deprecated` |
| `true`              | Calls `createDataFromAnnotatedType(this, { mode: 'example' })`      |

```javascript
// Default — no example data method
plugins: [ts()]

// Enable — each type gets toExampleData()
plugins: [ts({ exampleData: true })]
```

Unlike `toJsonSchema`, there is no caching — `toExampleData()` creates a new data object on each call. This is intentional since it acts as a factory function.

::: tip Manual use is always available
Even with `exampleData: false`, you can import `createDataFromAnnotatedType` from `@atscript/typescript/utils` and call it directly. The config option only affects the _generated_ `.toExampleData()` method.

```typescript
import { createDataFromAnnotatedType } from '@atscript/typescript/utils'
import { Product } from './product.as'

const example = createDataFromAnnotatedType(Product, { mode: 'example' })
```

:::

### `moduleExtension`

Controls the extension the generated `.js` uses for **relative** `.as` imports (since 0.1.91). Bare specifiers (packages, e.g. `some-pkg/models/user.as`) always keep `.as` — they resolve through the package's `exports` map. The `.d.ts` output is not affected.

| Value               | `import { B } from "./b"` renders as |
| ------------------- | ------------------------------------ |
| `'.as'` _(default)_ | `from "./b.as"`                      |
| `'.as.js'`          | `from "./b.as.js"`                   |
| `'.as.mjs'`         | `from "./b.as.mjs"`                  |

```javascript
// Default — bundler / asc-emitted `.as.js` next to the source
plugins: [ts()]

// Load the generated modules straight from Node without a bundler
plugins: [ts({ moduleExtension: '.as.mjs' })]
```

`asc db sync` compiles with `'.as.mjs'` so the models it loads resolve directly in Node.

## The `atscript.d.ts` File

When you run `asc -f dts`, an `atscript.d.ts` file is generated alongside your output. It declares the global `AtscriptMetadata` interface and `AtscriptPrimitiveTags` type — these provide TypeScript IntelliSense for all annotations and semantic type tags used in your project.

Add it to your `tsconfig.json`:

```json
{
  "include": ["src/**/*", "atscript.d.ts"]
}
```

::: warning Re-generate after config changes
Run `npx asc -f dts` whenever you change your `atscript.config` — for example, after adding plugins, custom annotations, or new primitives. This regenerates `atscript.d.ts` so that your IDE picks up the updated annotation types and semantic tags. Without this step, you may see incorrect IntelliSense or missing type information when working with `.metadata` and `.type.tags`.
:::

## Next Steps

- [CLI](/packages/typescript/cli) — build from the command line
- [Testing Fixtures](/packages/typescript/testing-fixtures) — compile `.as` files in tests with `prepareFixtures()`
- [Build Setup](/packages/typescript/build-setup) — bundler integration
- [Custom Annotations](/packages/typescript/custom-annotations) — define your own annotation types
- [Custom Primitives](/packages/typescript/custom-primitives) — define your own primitive extensions

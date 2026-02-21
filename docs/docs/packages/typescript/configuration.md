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

| Option              | Type                           | Default   | Description                                                                                                    |
| ------------------- | ------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------- |
| `rootDir`           | `string`                       | `'.'`     | Directory containing your `.as` files                                                                          |
| `format`            | `'dts' \| 'js'`                | `'dts'`   | Default output format for [CLI](/packages/typescript/cli) (`dts` for type declarations, `js` for runtime code) |
| `unknownAnnotation` | `'error' \| 'warn' \| 'allow'` | `'error'` | How to handle annotations not defined in config                                                                |
| `plugins`           | `TAtscriptPlugin[]`            | `[]`      | Active plugins                                                                                                 |
| `annotations`       | `object`                       | —         | Custom annotation definitions (see [Custom Annotations](/packages/typescript/custom-annotations))              |

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
| `true`              | Calls `createDataFromAnnotatedType(this, { mode: 'example' })`     |

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
- [Build Setup](/packages/typescript/build-setup) — bundler integration
- [Custom Annotations](/packages/typescript/custom-annotations) — define your own annotation types
- [Custom Primitives](/packages/typescript/custom-primitives) — define your own primitive extensions

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

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `rootDir` | `string` | `'.'` | Directory containing your `.as` files |
| `format` | `'dts' \| 'js'` | `'dts'` | Default output format (see [Code Generation](/packages/typescript/code-generation)) |
| `unknownAnnotation` | `'error' \| 'warn' \| 'allow'` | `'error'` | How to handle annotations not defined in config |
| `plugins` | `TAtscriptPlugin[]` | `[]` | Active plugins |
| `annotations` | `object` | — | Custom annotation definitions (see [Annotations](/guide/annotations)) |

## Plugin Options

The TypeScript plugin accepts one option:

```javascript
plugins: [ts({ preRenderJsonSchema: true })]
```

- **`preRenderJsonSchema`** — when `true`, JSON schemas are computed at build time and embedded in the generated `.js` output. By default, `.toJsonSchema()` is lazy-computed at runtime on first call.

## The `atscript.d.ts` File

When you run `asc -f dts` (or save in VSCode with the extension), an `atscript.d.ts` file is generated alongside your output. It declares the global `AtscriptMetadata` interface and `AtscriptPrimitiveTags` type — these provide TypeScript IntelliSense for all annotations and semantic type tags used in your project.

Add it to your `tsconfig.json`:

```json
{
  "include": [
    "src/**/*",
    "atscript.d.ts"
  ]
}
```

::: tip
Re-run `asc -f dts` whenever you add new annotation types to your config. The `atscript.d.ts` file will update with the new type definitions.
:::

## Next Steps

- [Code Generation](/packages/typescript/code-generation) — understand the two output formats
- [CLI](/packages/typescript/cli) — build from the command line

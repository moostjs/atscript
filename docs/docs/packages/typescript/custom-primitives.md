# Custom Primitives

You can extend the built-in primitive types with your own semantic extensions via `atscript.config.js`. Custom primitives work exactly like built-in ones — they appear in IntelliSense, carry validation constraints, and generate appropriate type tags.

## Defining Custom Extensions

Add custom extensions under the `primitives` key in your config:

```javascript
import { defineConfig } from '@atscript/core'
import ts from '@atscript/typescript'

export default defineConfig({
  rootDir: 'src',
  plugins: [ts()],
  primitives: {
    string: {
      extensions: {
        url: {
          type: 'string',
          documentation: 'URL format',
          expect: {
            pattern: ['^https?://.+$', '', 'Invalid URL'],
          },
        },
        slug: {
          type: 'string',
          documentation: 'URL-safe slug',
          expect: {
            pattern: ['^[a-z0-9-]+$', '', 'Invalid slug'],
          },
        },
      },
    },
    number: {
      extensions: {
        percentage: {
          type: 'number',
          documentation: 'Percentage value (0–100)',
          expect: {
            min: 0,
            max: 100,
          },
        },
      },
    },
  },
})
```

Each extension object supports:

| Field | Description |
|-------|-------------|
| `type` | The base TypeScript type (`'string'`, `'number'`, `'boolean'`) |
| `documentation` | Description shown in IntelliSense |
| `expect` | Implicit validation constraints — same keys as `@expect.*` annotations |

## Using Custom Primitives

Once defined, use them in `.as` files with dot notation:

```atscript
export interface Page {
    url: string.url
    slug: string.slug
    completeness: number.percentage
}
```

The validator will automatically enforce the constraints defined in your config — no `@expect.*` annotations needed.

::: tip Re-generate after config changes
Run `npx asc -f dts` after adding custom primitives to regenerate `atscript.d.ts`. This updates IntelliSense with your new type tags. See [Configuration](/packages/typescript/configuration) for details.
:::

## Next Steps

- [Primitives](/packages/typescript/primitives) — built-in primitive types and semantic extensions
- [Custom Annotations](/packages/typescript/custom-annotations) — define custom annotation types
- [Configuration](/packages/typescript/configuration) — full config file reference

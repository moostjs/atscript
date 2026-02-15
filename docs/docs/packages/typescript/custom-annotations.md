# Custom Annotations

You can define your own annotation types in `atscript.config.js`. Custom annotations get full IntelliSense support, type checking, and are available in runtime metadata — just like the built-in `@meta.*` and `@expect.*` annotations.

## Allowing Unknown Annotations

By default, Atscript reports an error for annotations not defined in config. You can relax this:

```javascript
import { defineConfig } from '@atscript/core'
import ts from '@atscript/typescript'

export default defineConfig({
  rootDir: 'src',
  plugins: [ts()],
  unknownAnnotation: 'allow',  // 'error' (default) | 'warn' | 'allow'
})
```

This is useful for quick prototyping, but for production projects, define your annotations explicitly for better tooling support.

## Defining Custom Annotations

Add annotations under the `annotations` key using `AnnotationSpec`:

```javascript
import { defineConfig, AnnotationSpec } from '@atscript/core'
import ts from '@atscript/typescript'

export default defineConfig({
  rootDir: 'src',
  plugins: [ts()],
  annotations: {
    ui: {
      hidden: new AnnotationSpec({
        description: 'Hide field in UI',
        nodeType: ['prop'],
      }),
      column: new AnnotationSpec({
        description: 'Table column width',
        argument: {
          name: 'width',
          type: 'number',
        },
      }),
      tag: new AnnotationSpec({
        description: 'UI display tag',
        multiple: true,
        mergeStrategy: 'append',
        argument: {
          name: 'value',
          type: 'string',
        },
      }),
    },
  },
})
```

### AnnotationSpec Options

| Option | Type | Description |
|--------|------|-------------|
| `description` | `string` | Shown in IntelliSense hover |
| `nodeType` | `string[]` | Where annotation can be applied: `'interface'`, `'type'`, `'prop'` |
| `argument` | `object` | Argument definition: `{ name, type, optional? }` |
| `multiple` | `boolean` | Whether the annotation can appear more than once on the same node |
| `mergeStrategy` | `'replace' \| 'append'` | How values combine during [annotation inheritance](/packages/typescript/annotations#annotation-inheritance). Default: `'replace'` |

## Using Custom Annotations

Once defined, use them in `.as` files:

```atscript
export interface User {
    @ui.hidden
    internalId: string

    @ui.column 200
    @ui.tag 'primary'
    @ui.tag 'searchable'
    name: string
}
```

Custom annotations appear in runtime metadata alongside built-in ones:

```typescript
import { User } from './user.as'

const nameProp = User.type.props.get('name')
nameProp?.metadata.get('ui.column')  // 200
nameProp?.metadata.get('ui.tag')     // ['primary', 'searchable']
```

::: tip Re-generate after config changes
Run `npx asc -f dts` after adding custom annotations to regenerate `atscript.d.ts`. This updates IntelliSense with your new annotation types. See [Configuration](/packages/typescript/configuration) for details.
:::

## Next Steps

- [Annotations](/packages/typescript/annotations) — built-in annotation types and inheritance rules
- [Custom Primitives](/packages/typescript/custom-primitives) — define custom primitive extensions
- [Configuration](/packages/typescript/configuration) — full config file reference

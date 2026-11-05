# Custom Annotations

You can define your own annotation types in `atscript.config.ts`. Custom annotations get full IntelliSense support, type checking, and are available in runtime metadata — just like the built-in `@meta.*`, `@expect.*`, and `@ui.*` annotations. For the full `AnnotationSpec` API — argument shapes, merge strategies, parse-time validation, AST-modifying hooks — see [Custom Annotations — Plugin Development](/plugin-development/annotation-system).

## Allowing Unknown Annotations

By default, Atscript reports an error for annotations not defined in config. You can relax this:

```javascript
import { defineConfig } from '@atscript/core'
import ts from '@atscript/typescript'

export default defineConfig({
  rootDir: 'src',
  plugins: [ts()],
  unknownAnnotation: 'allow', // 'error' (default) | 'warn' | 'allow'
})
```

This is useful for quick prototyping, but for production projects, define your annotations explicitly for better tooling support.

Without a spec, nothing says what an argument means, so the runtime metadata keeps it as written: strings, numbers, `true` / `false` / `null` / `undefined` as such, and any other name (`@ui.ref User`, `@ui.ref User.email`) or backtick argument as the string of its source (`'User'`, `'User.email'`). An argument left empty (`@ui.hint , 'x'`) is `undefined`. Give the annotation a spec with a `ref` argument to get a reference to the type itself.

## Quick Example

Add annotations under the `annotations` key using `AnnotationSpec`:

```javascript
import { defineConfig, AnnotationSpec } from '@atscript/core'
import ts from '@atscript/typescript'

export default defineConfig({
  rootDir: 'src',
  plugins: [ts()],
  annotations: {
    grid: {
      hidden: new AnnotationSpec({
        description: 'Hide column in data grid',
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
        description: 'Display tag',
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

Then use them in `.as` files:

```atscript
export interface User {
    @grid.hidden
    internalId: string

    @grid.column 200
    @grid.tag 'primary'
    @grid.tag 'searchable'
    name: string
}
```

Custom annotations appear in runtime metadata alongside built-in ones:

```typescript
import { User } from './user.as'

const nameProp = User.type.props.get('name')
nameProp?.metadata.get('grid.column') // 200
nameProp?.metadata.get('grid.tag') // ['primary', 'searchable']
```

## AnnotationSpec Options

| Option          | Type                    | Description                                                                                                                       |
| --------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `description`   | `string`                | Shown in IntelliSense hover                                                                                                       |
| `nodeType`      | `string[]`              | Where annotation can be applied: `'interface'`, `'type'`, `'prop'`                                                                |
| `argument`      | `object \| object[]`    | Argument definition(s): `{ name, type, optional?, description?, values?, userText? }`. `type` must be one of `'string' \| 'number' \| 'boolean' \| 'value' \| 'ref' \| 'query' \| 'expr' \| 'order'` ([literal values](/plugin-development/annotation-system#literal-values-value), [backtick argument types](/plugin-development/annotation-system#expression-and-order-arguments)); `userText: true` (or `'expression'` for function source) marks [user-facing text](/plugin-development/annotation-system#user-facing-text-usertext) |
| `multiple`      | `boolean`               | Whether the annotation can appear more than once on the same node                                                                 |
| `mergeStrategy` | `'replace' \| 'append'` | How values combine during [annotation inheritance](/packages/typescript/annotations-reference#annotation-inheritance). Default: `'replace'` |
| `defType`       | `string[]`              | Restrict to the underlying definition type. Valid values: `'string'`, `'number'`, `'boolean'`, `'decimal'`, `'phantom'`, `'null'`, `'void'`, `'never'`, `'object'`, `'array'`, `'union'`, `'intersection'`                                |
| `validate`      | `function`              | Custom validation function for complex checks                                                                                     |
| `modify`        | `function`              | Hook to modify the AST after annotation is parsed                                                                                 |

## Next Steps

- [Annotations](/packages/typescript/annotations) — built-in annotation types and inheritance rules
- [Custom Primitives](/packages/typescript/custom-primitives) — define custom primitive extensions
- [Configuration](/packages/typescript/configuration) — full config file reference

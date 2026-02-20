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
  unknownAnnotation: 'allow', // 'error' (default) | 'warn' | 'allow'
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

| Option          | Type                    | Description                                                                                                                       |
| --------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `description`   | `string`                | Shown in IntelliSense hover                                                                                                       |
| `nodeType`      | `string[]`              | Where annotation can be applied: `'interface'`, `'type'`, `'prop'`                                                                |
| `argument`      | `object \| object[]`    | Argument definition(s): `{ name, type, optional?, description?, values? }`                                                        |
| `multiple`      | `boolean`               | Whether the annotation can appear more than once on the same node                                                                 |
| `mergeStrategy` | `'replace' \| 'append'` | How values combine during [annotation inheritance](/packages/typescript/annotations#annotation-inheritance). Default: `'replace'` |
| `defType`       | `string[]`              | Restrict to specific value types: `'string'`, `'number'`, `'boolean'`, `'array'`, `'object'`, etc.                                |
| `validate`      | `function`              | Custom validation function for complex checks (see [below](#custom-validation))                                                   |
| `modify`        | `function`              | Hook to modify the AST after annotation is parsed                                                                                 |

## Custom Validation {#custom-validation}

For cases where simple type and argument checks aren't enough, you can provide a `validate` function that runs custom logic at parse time. This gives you full access to the annotation token, its arguments, and the document — so you can inspect the parent node, check the field's type definition, or enforce any domain-specific rules.

### Signature

```typescript
validate(mainToken: Token, args: Token[], doc: AtscriptDoc): TMessages | undefined
```

| Parameter   | Description                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------- |
| `mainToken` | The annotation token (e.g. `@ui.color`). Access the parent node via `mainToken.parentNode`. |
| `args`      | Array of argument tokens. Each has `.text` (the raw value), `.type`, and `.range`.          |
| `doc`       | The `AtscriptDoc` instance — use it to resolve types, unwind references, etc.               |

Return an array of diagnostic messages to report errors/warnings, or `undefined` / empty array if validation passes. Each message has:

```typescript
{ severity: 1 | 2 | 3 | 4, message: string, range: { start, end } }
```

Severities: `1` = Error, `2` = Warning, `3` = Info, `4` = Hint.

### Example: Validate a Color Format

This annotation accepts a CSS hex color and validates the format at parse time:

```javascript
import { defineConfig, AnnotationSpec } from '@atscript/core'
import ts from '@atscript/typescript'

export default defineConfig({
  rootDir: 'src',
  plugins: [ts()],
  annotations: {
    ui: {
      color: new AnnotationSpec({
        description: 'CSS hex color for the field',
        nodeType: ['prop'],
        argument: { name: 'value', type: 'string' },
        validate(mainToken, args) {
          if (!args[0]) return
          const value = args[0].text
          if (!/^#[\da-f]{3,8}$/i.test(value)) {
            return [
              {
                severity: 1,
                message: `Invalid hex color "${value}". Expected format: #RGB, #RRGGBB, or #RRGGBBAA.`,
                range: args[0].range,
              },
            ]
          }
        },
      }),
    },
  },
})
```

Now `@ui.color '#ff0000'` passes, but `@ui.color 'red'` shows an error in the editor.

### Example: Check the Field's Type

You can inspect the parent node's type definition. For example, an annotation that only makes sense on `string` or `number` fields:

```javascript
import { defineConfig, AnnotationSpec } from '@atscript/core'
import { isPrimitive, isRef } from '@atscript/core/nodes'
import ts from '@atscript/typescript'

export default defineConfig({
  rootDir: 'src',
  plugins: [ts()],
  annotations: {
    ui: {
      sortable: new AnnotationSpec({
        description: 'Mark field as sortable in tables',
        nodeType: ['prop'],
        validate(mainToken, args, doc) {
          const field = mainToken.parentNode
          if (!field) return

          let definition = field.getDefinition()
          // Resolve references to their actual types
          if (isRef(definition)) {
            definition = doc.unwindType(definition.id, definition.chain)?.def || definition
          }

          if (!isPrimitive(definition) || !['string', 'number'].includes(definition.type)) {
            return [
              {
                severity: 1,
                message: '@ui.sortable can only be applied to string or number fields.',
                range: mainToken.range,
              },
            ]
          }
        },
      }),
    },
  },
})
```

### Example: Cross-field Validation

Validate that an annotation's argument references an existing sibling property:

```javascript
import { defineConfig, AnnotationSpec } from '@atscript/core'
import { isInterface } from '@atscript/core/nodes'
import ts from '@atscript/typescript'

export default defineConfig({
  rootDir: 'src',
  plugins: [ts()],
  annotations: {
    ui: {
      dependsOn: new AnnotationSpec({
        description: 'This field depends on another field',
        nodeType: ['prop'],
        argument: { name: 'fieldName', type: 'string' },
        validate(mainToken, args) {
          if (!args[0]) return
          const fieldName = args[0].text
          const parent = mainToken.parentNode?.parent
          if (isInterface(parent) && !parent.props.has(fieldName)) {
            return [
              {
                severity: 1,
                message: `Field "${fieldName}" does not exist in this interface.`,
                range: args[0].range,
              },
            ]
          }
        },
      }),
    },
  },
})
```

::: tip Validation runs at parse time
Custom `validate` functions execute during document parsing — errors appear immediately in the editor as red/yellow squiggles, just like built-in annotation errors.
:::

### Restricting by Value Type with `defType`

As a simpler alternative to a full `validate` function, use `defType` to restrict which value types an annotation can be applied to. Atscript will automatically report an error if the annotation is used on a field with an incompatible type.

```javascript
annotations: {
  ui: {
    precision: new AnnotationSpec({
      description: 'Decimal precision for numeric display',
      defType: ['number'],  // only allow on number fields
      argument: { name: 'digits', type: 'number' },
    }),
  },
}
```

Available `defType` values include: `'string'`, `'number'`, `'boolean'`, `'array'`, `'object'`, `'union'`, `'intersection'`.

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
nameProp?.metadata.get('ui.column') // 200
nameProp?.metadata.get('ui.tag') // ['primary', 'searchable']
```

::: tip Re-generate after config changes
Run `npx asc -f dts` after adding custom annotations to regenerate `atscript.d.ts`. This updates IntelliSense with your new annotation types. See [Configuration](/packages/typescript/configuration) for details.
:::

## Next Steps

- [Annotations](/packages/typescript/annotations) — built-in annotation types and inheritance rules
- [Custom Primitives](/packages/typescript/custom-primitives) — define custom primitive extensions
- [Configuration](/packages/typescript/configuration) — full config file reference

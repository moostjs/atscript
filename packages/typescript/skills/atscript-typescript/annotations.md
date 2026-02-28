# Annotations & Primitives — @atscript/typescript

> All built-in annotations, their arguments, and how to define custom annotations and primitives.

## Built-in Annotations

### `@meta.*` — Metadata Annotations

| Annotation            | Arguments                  | Description                                                        |
| --------------------- | -------------------------- | ------------------------------------------------------------------ |
| `@meta.label`         | `text: string`             | Human-readable label for UI, logs, documentation                   |
| `@meta.id`            | _(none)_                   | Mark field as unique identifier; multiple fields form composite PK |
| `@meta.description`   | `text: string`             | Detailed description of a field or entity                          |
| `@meta.documentation` | `text: string`             | Multi-line docs (Markdown). Multiple allowed — each appends        |
| `@meta.sensitive`     | _(none)_                   | Mark as sensitive (passwords, API keys). Strips from serialization |
| `@meta.readonly`      | _(none)_                   | Mark as read-only                                                  |
| `@meta.required`      | `message?: string`         | Required field. Strings: non-whitespace. Booleans: must be `true`  |
| `@meta.default`       | `value: string`            | Default value (strings as-is, others parsed as JSON)               |
| `@meta.example`       | `value: string`            | Example value (strings as-is, others parsed as JSON)               |
| `@expect.array.key`   | _(none)_                   | Mark field as key inside array (string/number types only)          |

### `@expect.*` — Validation Constraints

| Annotation          | Arguments                                               | Applies To    | Description                                            |
| ------------------- | ------------------------------------------------------- | ------------- | ------------------------------------------------------ |
| `@expect.minLength` | `length: number`, `message?: string`                    | string, array | Minimum length                                         |
| `@expect.maxLength` | `length: number`, `message?: string`                    | string, array | Maximum length                                         |
| `@expect.min`       | `minValue: number`, `message?: string`                  | number        | Minimum value                                          |
| `@expect.max`       | `maxValue: number`, `message?: string`                  | number        | Maximum value                                          |
| `@expect.int`       | _(none)_                                                | number        | Must be integer                                        |
| `@expect.pattern`   | `pattern: string`, `flags?: string`, `message?: string` | string        | Regex validation. **Multiple allowed** (all must pass) |

### `@ui.*` — UI / Presentation Hints

| Annotation        | Arguments                      | Description                                    |
| ----------------- | ------------------------------ | ---------------------------------------------- |
| `@ui.placeholder` | `text: string`                 | Input placeholder text                         |
| `@ui.component`   | `name: string`                 | UI component hint (`"select"`, `"datepicker"`) |
| `@ui.hidden`      | _(none)_                       | Hide from UI forms/tables                      |
| `@ui.group`       | `name: string`                 | Group fields into form sections                |
| `@ui.order`       | `order: number`                | Display order (lower = first)                  |
| `@ui.width`       | `width: string`                | Layout hint (`"half"`, `"full"`, `"third"`)    |
| `@ui.icon`        | `name: string`                 | Icon hint                                      |
| `@ui.hint`        | `text: string`                 | Help text / tooltip                            |
| `@ui.disabled`    | _(none)_                       | Non-interactive field                          |
| `@ui.type`        | `type: string`                 | Input type (`"textarea"`, `"password"`, etc.)  |
| `@ui.attr`        | `key: string`, `value: string` | Arbitrary attribute (**multiple**, append)      |
| `@ui.class`       | `names: string`                | CSS class names (**multiple**, append)          |
| `@ui.style`       | `css: string`                  | Inline CSS styles (**multiple**, append)        |

### `@emit.*` — Build-time Directives

| Annotation         | Applies To | Description                                     |
| ------------------ | ---------- | ----------------------------------------------- |
| `@emit.jsonSchema` | interface  | Pre-compute and embed JSON Schema at build time |

## Custom Annotations

Define custom annotations in `atscript.config.ts` using `AnnotationSpec`:

```ts
import { defineConfig, AnnotationSpec } from '@atscript/core'
import tsPlugin from '@atscript/typescript'

export default defineConfig({
  plugins: [tsPlugin()],
  annotations: {
    // Namespaced annotations use nested objects
    grid: {
      // @grid.column 200
      column: new AnnotationSpec({
        argument: { name: 'width', type: 'number' },
        description: 'Table column width in data grid',
      }),

      // @grid.hidden (no arguments — boolean flag)
      hidden: new AnnotationSpec({
        description: 'Hide column in data grid',
      }),

      // @grid.sortable
      sortable: new AnnotationSpec({
        description: 'Allow sorting by this column',
      }),
    },

    // @tag "important" (multiple allowed, each appended)
    tag: new AnnotationSpec({
      multiple: true,
      mergeStrategy: 'append',
      argument: { name: 'value', type: 'string' },
    }),

    // Annotation with multiple named arguments
    // @api.endpoint "/users" "GET"
    api: {
      endpoint: new AnnotationSpec({
        argument: [
          { name: 'path', type: 'string' },
          { name: 'method', type: 'string', optional: true },
        ],
      }),
    },
  },
})
```

### `AnnotationSpec` Options

```ts
new AnnotationSpec({
  // Single argument
  argument: { name: 'value', type: 'string' },

  // Or multiple arguments
  argument: [
    { name: 'first', type: 'string' },
    { name: 'second', type: 'number', optional: true },
  ],

  // Allow multiple instances on the same target
  multiple: true, // default: false

  // How duplicates merge: 'replace' (last wins) or 'append' (collect into array)
  mergeStrategy: 'append', // default: 'replace'

  // Human-readable description
  description: 'What this annotation does',

  // Restrict to specific node types
  nodeType: ['interface', 'type', 'prop'],

  // Custom validation function
  validate: (mainToken, args, doc) => {
    // Return array of diagnostic messages, or undefined
  },
})
```

### Argument Types

Each argument accepts:

| Field         | Type                                | Description                                 |
| ------------- | ----------------------------------- | ------------------------------------------- |
| `name`        | `string`                            | Argument name (used in metadata object key) |
| `type`        | `'string' \| 'number' \| 'boolean'` | Expected type                               |
| `optional`    | `boolean`                           | Whether the argument can be omitted         |
| `description` | `string`                            | Human-readable description                  |
| `values`      | `string[]`                          | Allowed values (enum-like constraint)       |

### How Annotations Map to Runtime Metadata

- **Single argument** → metadata value is the argument value directly
- **Multiple named arguments** → metadata value is an object with argument names as keys
- **No arguments** → metadata value is `true`
- **`multiple: true`** → metadata value is an array

Example: `@api.endpoint "/users" "GET"` becomes:

```ts
metadata.get('api.endpoint') // → { path: "/users", method: "GET" }
```

## Custom Primitives

Define custom primitive types in `atscript.config.ts`:

```ts
export default defineConfig({
  primitives: {
    // Simple alias with built-in validation
    currency: {
      type: 'string',
      tags: ['string'],
      expect: {
        pattern: /^\d+\.\d{2}$/,
        message: 'Must be in format 0.00',
      },
    },

    // Primitive with extensions (subtypes)
    url: {
      type: 'string',
      tags: ['string'],
      expect: {
        pattern: /^https?:\/\/.+/,
      },
      extensions: {
        // url.https — only HTTPS
        https: {
          expect: {
            pattern: /^https:\/\/.+/,
          },
        },
        // url.relative — relative URLs
        relative: {
          expect: {
            pattern: /^\/.+/,
          },
        },
      },
    },

    // Object-shaped primitive
    point: {
      type: {
        kind: 'object',
        props: {
          x: 'number',
          y: 'number',
        },
      },
    },
  },
})
```

### `TPrimitiveConfig` Options

| Field           | Type                                        | Description                                                                                      |
| --------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `type`          | `TPrimitiveTypeDef`                         | Base type: `'string'`, `'number'`, `'boolean'`, `'void'`, `'null'`, `'phantom'`, or complex type |
| `tags`          | `string[]`                                  | Custom tags for categorization                                                                   |
| `documentation` | `string`                                    | Documentation string                                                                             |
| `expect`        | object                                      | Built-in validation constraints                                                                  |
| `extensions`    | `Record<string, Partial<TPrimitiveConfig>>` | Sub-types accessible via dot notation                                                            |

### `expect` Validation on Primitives

| Field       | Applies To      | Description                      |
| ----------- | --------------- | -------------------------------- |
| `min`       | number          | Minimum value                    |
| `max`       | number          | Maximum value                    |
| `int`       | number          | Must be integer                  |
| `minLength` | string, array   | Minimum length                   |
| `maxLength` | string, array   | Maximum length                   |
| `pattern`   | string          | Regex pattern(s)                 |
| `required`  | string, boolean | Non-empty / must be true         |
| `message`   | any             | Custom error message for pattern |

### Usage in `.as` Files

After defining custom primitives/annotations, use them directly:

```as
interface Product {
  @meta.label "Price"
  price: currency

  @ui.component "UrlInput"
  website: url.https

  @tag "featured"
  @tag "new"
  featured: boolean
}
```

# Annotations & Primitives — @atscript/typescript

> All built-in annotations, their arguments, and how to define custom annotations and primitives.

## Built-in Annotations

### `@meta.*` — Metadata Annotations

| Annotation | Arguments | Description |
|------------|-----------|-------------|
| `@meta.label` | `text: string` | Human-readable label for UI, logs, documentation |
| `@meta.id` | `name?: string` (optional) | Mark field as unique identifier; optional custom name |
| `@meta.description` | `text: string` | Detailed description of a field or entity |
| `@meta.documentation` | `text: string` | Multi-line docs (Markdown). Multiple allowed — each appends |
| `@meta.placeholder` | `text: string` | Placeholder for UI input fields (props/types only) |
| `@meta.sensitive` | *(none)* | Mark as sensitive (passwords, API keys). Strips from serialization |
| `@meta.readonly` | *(none)* | Mark as read-only |
| `@meta.required` | `message?: string` | Required field. Strings: non-whitespace. Booleans: must be `true` |
| `@meta.default` | `value: string` | Default value (strings as-is, others parsed as JSON) |
| `@meta.example` | `value: string` | Example value (strings as-is, others parsed as JSON) |
| `@meta.isKey` | *(none)* | Mark field as key inside array (string/number types only) |

### `@expect.*` — Validation Constraints

| Annotation | Arguments | Applies To | Description |
|------------|-----------|-----------|-------------|
| `@expect.minLength` | `length: number`, `message?: string` | string, array | Minimum length |
| `@expect.maxLength` | `length: number`, `message?: string` | string, array | Maximum length |
| `@expect.min` | `minValue: number`, `message?: string` | number | Minimum value |
| `@expect.max` | `maxValue: number`, `message?: string` | number | Maximum value |
| `@expect.int` | *(none)* | number | Must be integer |
| `@expect.pattern` | `pattern: string`, `flags?: string`, `message?: string` | string | Regex validation. **Multiple allowed** (all must pass) |

### `@emit.*` — Build-time Directives

| Annotation | Applies To | Description |
|------------|-----------|-------------|
| `@emit.jsonSchema` | interface | Pre-compute and embed JSON Schema at build time |

## Custom Annotations

Define custom annotations in `atscript.config.ts` using `AnnotationSpec`:

```ts
import { defineConfig, AnnotationSpec } from '@atscript/core'
import tsPlugin from '@atscript/typescript'

export default defineConfig({
  plugins: [tsPlugin()],
  annotations: {
    // Namespaced annotations use nested objects
    ui: {
      // @ui.component "DatePicker"
      component: new AnnotationSpec({
        argument: { name: 'name', type: 'string' },
        description: 'UI component to render this field',
      }),

      // @ui.hidden (no arguments — boolean flag)
      hidden: new AnnotationSpec({
        description: 'Hide this field in the UI',
      }),

      // @ui.order 5
      order: new AnnotationSpec({
        argument: { name: 'position', type: 'number' },
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
  multiple: true,               // default: false

  // How duplicates merge: 'replace' (last wins) or 'append' (collect into array)
  mergeStrategy: 'append',      // default: 'replace'

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

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Argument name (used in metadata object key) |
| `type` | `'string' \| 'number' \| 'boolean'` | Expected type |
| `optional` | `boolean` | Whether the argument can be omitted |
| `description` | `string` | Human-readable description |
| `values` | `string[]` | Allowed values (enum-like constraint) |

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

| Field | Type | Description |
|-------|------|-------------|
| `type` | `TPrimitiveTypeDef` | Base type: `'string'`, `'number'`, `'boolean'`, `'void'`, `'null'`, `'phantom'`, or complex type |
| `tags` | `string[]` | Custom tags for categorization |
| `documentation` | `string` | Documentation string |
| `expect` | object | Built-in validation constraints |
| `extensions` | `Record<string, Partial<TPrimitiveConfig>>` | Sub-types accessible via dot notation |

### `expect` Validation on Primitives

| Field | Applies To | Description |
|-------|-----------|-------------|
| `min` | number | Minimum value |
| `max` | number | Maximum value |
| `int` | number | Must be integer |
| `minLength` | string, array | Minimum length |
| `maxLength` | string, array | Maximum length |
| `pattern` | string | Regex pattern(s) |
| `required` | string, boolean | Non-empty / must be true |
| `message` | any | Custom error message for pattern |

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

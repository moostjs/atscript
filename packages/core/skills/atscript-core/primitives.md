# Primitives Reference — @atscript/core

> Built-in primitive types, their extensions, and how to define custom primitives.

## Built-in Primitives

### `string`

Base type for textual data. Extensions accessed via dot notation in `.as` files.

| Primitive          | Description                                   | Validation                          |
| ------------------ | --------------------------------------------- | ----------------------------------- |
| `string`           | Plain text                                    | —                                   |
| `string.email`     | Email address                                 | Pattern: `^[^\s@]+@[^\s@]+\.[^\s@]+$` |
| `string.phone`     | Phone number                                  | Pattern: `^\+?[0-9\s-]{10,15}$`    |
| `string.date`      | Date string (multiple formats)                | YYYY-MM-DD, MM/DD/YYYY, etc.       |
| `string.isoDate`   | ISO 8601 date                                 | UTC and timezone variants           |
| `string.uuid`      | UUID                                          | Standard UUID format (case-insensitive) |
| `string.required`  | Non-empty string                              | `@meta.required` applied            |

### `number`

Base type for numeric data.

| Primitive                  | Description                   | Validation                |
| -------------------------- | ----------------------------- | ------------------------- |
| `number`                   | Any number                    | —                         |
| `number.positive`          | >= 0                          | `@expect.min 0`           |
| `number.negative`          | <= 0                          | `@expect.max 0`           |
| `number.int`               | Integer                       | `@expect.int`             |
| `number.int.positive`      | Positive integer              | `@expect.int` + `@expect.min 0` |
| `number.int.negative`      | Negative integer              | `@expect.int` + `@expect.max 0` |
| `number.single`            | Single-precision float        | —                         |
| `number.double`            | Double-precision float        | —                         |
| `number.timestamp`         | Timestamp (integer)           | `@expect.int`             |
| `number.timestamp.created` | Auto-set on creation          | `@db.default.fn "now"`, tag: `created` |
| `number.timestamp.updated` | Auto-updated on write         | tag: `updated`            |

### `boolean`

| Primitive           | Description              |
| ------------------- | ------------------------ |
| `boolean`           | true/false               |
| `boolean.required`  | Must be `true`           |
| `boolean.true`      | Literal `true`           |
| `boolean.false`     | Literal `false`          |

### Other

| Primitive   | Description                                                           |
| ----------- | --------------------------------------------------------------------- |
| `null`      | NULL value                                                            |
| `void`      | No value                                                              |
| `undefined` | No value (alias for `void`)                                           |
| `never`     | Impossible type                                                       |
| `phantom`   | Non-data type. Excluded from validation/schema but discoverable at runtime |

## Custom Primitives

Define in `atscript.config.ts` under `primitives`:

```ts
import { defineConfig } from '@atscript/core'

export default defineConfig({
  primitives: {
    // Simple: string with validation
    currency: {
      type: 'string',
      tags: ['string'],
      documentation: 'Currency amount (e.g., "12.50")',
      annotations: {
        'expect.pattern': { pattern: '^\\d+\\.\\d{2}$', message: 'Must be format 0.00' },
      },
    },

    // With extensions: url.https, url.relative
    url: {
      type: 'string',
      tags: ['string'],
      annotations: {
        'expect.pattern': { pattern: '^https?://.+' },
      },
      extensions: {
        https: {
          annotations: { 'expect.pattern': { pattern: '^https://.+' } },
        },
        relative: {
          annotations: { 'expect.pattern': { pattern: '^/.+' } },
        },
      },
    },

    // Object-shaped primitive
    point: {
      type: {
        kind: 'object',
        props: { x: 'number', y: 'number' },
      },
    },
  },
})
```

### `TPrimitiveConfig` Options

| Field           | Type                                        | Description                                          |
| --------------- | ------------------------------------------- | ---------------------------------------------------- |
| `type`          | `string \| TPrimitiveTypeDef`               | Base type: `'string'`, `'number'`, `'boolean'`, `'void'`, `'null'`, `'phantom'`, or complex |
| `tags`          | `string[]`                                  | Semantic tags (available at runtime via `type.tags`)  |
| `documentation` | `string`                                    | Documentation shown in IDE                           |
| `annotations`   | `Record<string, TPrimitiveAnnotationValue>` | Annotations auto-applied when this primitive is used |
| `extensions`    | `Record<string, Partial<TPrimitiveConfig>>` | Sub-types via dot notation (e.g., `string.email`)    |

### Primitive Annotations

Primitives use a generic `annotations` map to apply any registered annotation. The `applyAnnotations()` method resolves annotation specs, respects `multiple` flags, and maps object values by spec argument names.

```ts
// Single value — maps to the first argument
annotations: { 'expect.min': 0 }

// Object — maps keys to named arguments
annotations: { 'expect.pattern': { pattern: '^\\d+$', message: 'Numbers only' } }

// Array of objects — for multiple: true + append annotations
annotations: {
  'expect.pattern': [
    { pattern: '^\\d{4}-\\d{2}-\\d{2}$', message: 'YYYY-MM-DD' },
    { pattern: '^\\d{2}/\\d{2}/\\d{4}$', message: 'MM/DD/YYYY' },
  ],
}

// Boolean true — flag annotation
annotations: { 'meta.required': true }
```

## Usage in `.as` Files

```atscript
export interface User {
    id: string.uuid
    email: string.email
    age: number.int.positive
    createdAt: number.timestamp.created
    bio?: string
    loginLink: phantom   // non-data UI element
}
```

## Best Practices

- Set `tags` to match the base type (e.g., `tags: ['string']`) so runtime type checks work correctly
- Use `extensions` for sub-types rather than creating separate top-level primitives
- Use `annotations` to encode validation rules — they flow into validators and JSON Schema automatically
- Keep `documentation` concise — it appears in IDE hover

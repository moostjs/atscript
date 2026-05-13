# Custom Primitives

Primitives are the fundamental scalar types in Atscript — `string`, `number`, `boolean`, `decimal`, and their semantic extensions like `string.email` or `number.int`. Plugins can add new primitive types and extensions that work identically to built-in ones: they appear in IntelliSense, carry constraint annotations, and generate appropriate type tags at runtime.

For a first plugin, keep the scope small:

- start with one scalar extension like `geo.latitude`
- attach validation through built-in `@expect.*` annotations via the primitive's `annotations` map
- only reach for object, tuple, or phantom primitives when your plugin really needs them

## What Primitives Are

A primitive in Atscript has:

- An underlying **type** — one of the final scalar types (`string`, `number`, `boolean`, `decimal`, `void`, `null`, `phantom`) or a complex type definition
- Optional **documentation** — shown in hover tooltips in the editor
- Optional **annotations** — applied automatically to every use of the primitive (e.g., `expect.min: 0`)
- Optional **semantic tags** — string identifiers for runtime type discrimination
- Optional **extensions** — sub-primitives accessed via dot notation (e.g., `string.email`)

When a primitive has extensions, it becomes a namespace. `string` is a usable type on its own, and `string.email` is a more specific variant that inherits everything from `string` plus its own annotations.

## The TPrimitiveConfig Interface

Primitives are defined with `TPrimitiveConfig`:

```typescript
interface TPrimitiveConfig {
  type?: TPrimitiveTypeDef
  documentation?: string
  tags?: string[]
  isContainer?: boolean
  annotations?: Record<string, TPrimitiveAnnotationValue>
  extensions?: Record<string, Partial<TPrimitiveConfig>>
}
```

| Field           | Type                                       | Description                                                                                  |
| --------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `type`          | `TPrimitiveTypeDef`                        | Underlying scalar or complex type. Inherited from parent if omitted.                         |
| `documentation` | `string`                                   | Markdown text shown in IntelliSense. Inherited from parent if omitted.                       |
| `tags`          | `string[]`                                 | Semantic tags for runtime discrimination (e.g., `['email']`).                                |
| `isContainer`   | `boolean`                                  | If `true`, the primitive itself cannot be used — one of its extensions must be chosen.       |
| `annotations`   | `Record<string, TPrimitiveAnnotationValue>` | Annotations applied automatically wherever this primitive is used. Merged with parent's map. |
| `extensions`    | `Record<string, Partial<TPrimitiveConfig>>` | Sub-primitives accessible via dot notation.                                                  |

### The `annotations` Map

Each entry maps a fully-qualified annotation name (the same name used in `.as` files) to its value. The value shape matches the annotation's argument list:

```typescript
type TPrimitiveAnnotationArg = string | number | boolean
type TPrimitiveAnnotationArgs = Record<string, TPrimitiveAnnotationArg>
type TPrimitiveAnnotationValue =
  | boolean                              // no-arg annotation (e.g., 'expect.int': true)
  | string                               // single string arg
  | number                               // single number arg (e.g., 'expect.min': 0)
  | TPrimitiveAnnotationArgs             // multi named args (e.g., { pattern: '...', message: '...' })
  | (TPrimitiveAnnotationArg | TPrimitiveAnnotationArgs)[] // multiple occurrences (with multiple: true)
```

Annotations declared in a primitive's `annotations` map are **identical** to writing the same annotation in `.as` source on every field that uses the primitive. They participate in normal validation and inheritance.

## The Final Scalar Types

`TPrimitiveTypeFinal` is the set of underlying scalar kinds a primitive can resolve to:

```typescript
type TPrimitiveTypeFinal =
  | 'string'
  | 'number'
  | 'boolean'
  | 'decimal'
  | 'void'
  | 'null'
  | 'phantom'
```

- `string`, `number`, `boolean` — the standard scalars
- `decimal` — string-backed arbitrary-precision numeric (`^[+-]?\d+(\.\d+)?$`). See [Validation Specification](/plugin-development/validation-spec#decimal-format-check).
- `void`, `null` — terminal value types
- `phantom` — non-data primitive used for runtime-discoverable metadata fields (see [Phantom Primitives](#phantom-primitives))

`never` is also a valid primitive name (no `type` field — represents the impossible type).

## Adding Primitives via config()

Register primitives in your plugin's `config()` hook:

```typescript
import { createAtscriptPlugin } from '@atscript/core'

export const geoPlugin = () =>
  createAtscriptPlugin({
    name: 'geo',
    config() {
      return {
        primitives: {
          geo: {
            isContainer: true,
            documentation: 'Geographic data types',
            extensions: {
              latitude: {
                type: 'number',
                documentation: 'Latitude coordinate (-90 to 90)',
                tags: ['latitude'],
                annotations: { 'expect.min': -90, 'expect.max': 90 },
              },
              longitude: {
                type: 'number',
                documentation: 'Longitude coordinate (-180 to 180)',
                tags: ['longitude'],
                annotations: { 'expect.min': -180, 'expect.max': 180 },
              },
              postalCode: {
                type: 'string',
                documentation: 'Postal/ZIP code',
                tags: ['postalCode'],
                annotations: {
                  'expect.pattern': {
                    pattern: '^[A-Z0-9 -]{3,10}$',
                    flags: 'i',
                    message: 'Invalid postal code format',
                  },
                },
              },
            },
          },
        },
      }
    },
  })
```

Usage in `.as` files:

```atscript
export interface Location {
    @meta.label "Latitude"
    lat: geo.latitude

    @meta.label "Longitude"
    lng: geo.longitude

    @meta.label "ZIP Code"
    zip: geo.postalCode
}
```

### Real-World Example: Built-In `string.email`

The built-in `string` primitive ships with several extensions, including `string.email`:

```typescript
// Shape used by Atscript's built-in primitives (excerpt)
primitives: {
  string: {
    type: 'string',
    documentation: 'Represents textual data.',
    extensions: {
      email: {
        documentation: 'Represents an email address.',
        annotations: {
          'expect.pattern': {
            pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
            message: 'Invalid email format.',
          },
        },
      },
      uuid: {
        documentation: 'Represents a UUID.',
        annotations: {
          'expect.pattern': {
            pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
            flags: 'i',
            message: 'Invalid UUID format.',
          },
        },
      },
    },
  },
}
```

::: tip Pattern strings, not regex literals
`expect.pattern` accepts the pattern as a **string** (matching how `.as` source writes it), with an optional `flags` field. JavaScript `RegExp` literals are not the wire form — write `pattern: '^[A-Z]+$'`, not `/^[A-Z]+$/`.
:::

## Complex Type Definitions

The `type` field accepts `TPrimitiveTypeDef`, which can be:

### Scalar Types

A plain string for simple types:

```typescript
type: 'string'   // textual data
type: 'number'   // numeric data
type: 'boolean'  // true/false
type: 'decimal'  // arbitrary-precision string-backed numeric
type: 'void'     // no value
type: 'null'     // null value
type: 'phantom'  // metadata-only (excluded from generated types and validation)
```

### Array Type

An array of a given element type:

```typescript
type: { kind: 'array', of: 'number' }   // number[]
type: { kind: 'array', of: 'string' }   // string[]
```

### Union Type

One of several possible types:

```typescript
type: {
  kind: 'union',
  items: ['string', 'number'],          // string | number
}
```

### Intersection Type

A combination of types:

```typescript
type: {
  kind: 'intersection',
  items: ['string', 'number'],          // string & number
}
```

### Tuple Type

A fixed-length array with typed positions:

```typescript
type: {
  kind: 'tuple',
  items: ['number', 'number'],          // [number, number]
}
```

### Object Type

A structured type with named properties:

```typescript
type: {
  kind: 'object',
  props: {
    x: 'number',
    y: 'number',
    label: { kind: 'final', value: 'string', optional: true },
  },
  propsPatterns: {},
}
```

### Optional Wrapper

Any final scalar can be wrapped as optional:

```typescript
type: { kind: 'final', value: 'string', optional: true }  // string | undefined
```

### Composing Complex Types

Complex types nest arbitrarily. For example, a GeoJSON point:

```typescript
geo: {
  extensions: {
    point: {
      type: {
        kind: 'object',
        props: {
          type: 'string',                  // "Point"
          coordinates: {
            kind: 'tuple',
            items: ['number', 'number'],   // [longitude, latitude]
          },
        },
        propsPatterns: {},
      },
      documentation: 'GeoJSON Point with [longitude, latitude] coordinates',
    },
  },
}
```

## Annotation-Backed Validation

Primitives don't run validation themselves. Instead, they declare annotations in their `annotations` map, and the runtime validator enforces those annotations exactly as if they had been written in `.as` source.

The built-in `@expect.*` and `@meta.*` annotations cover the common cases:

### For String Types

```typescript
annotations: {
  'expect.pattern': { pattern: '^[a-z0-9-]+$', message: 'Invalid format' },
  'expect.minLength': 1,
  'expect.maxLength': 255,
  'meta.required': true,             // non-empty, non-whitespace
}
```

Multiple patterns are expressed as an array — the value must match **at least one**:

```typescript
annotations: {
  'expect.pattern': [
    { pattern: '^\\d{4}-\\d{2}-\\d{2}$', message: 'Invalid date format' },
    { pattern: '^\\d{2}/\\d{2}/\\d{4}$', message: 'Invalid date format' },
  ],
}
```

### For Number Types

```typescript
annotations: {
  'expect.min': 0,
  'expect.max': 100,
  'expect.int': true,
}
```

### For Boolean Types

```typescript
annotations: {
  'meta.required': true,             // must be true (e.g. "accept terms" checkbox)
}
```

For full semantics (evaluation order, error formats, partial mode, etc.) see [Validation Specification](/plugin-development/validation-spec).

## Container Primitives and Inheritance

When `isContainer: true`, the primitive itself can't be used directly — only its extensions can. This is useful for creating namespaces:

```typescript
config() {
  return {
    primitives: {
      color: {
        isContainer: true,
        documentation: 'Color value types',
        extensions: {
          hex: {
            type: 'string',
            documentation: 'Hex color (#RGB or #RRGGBB)',
            annotations: {
              'expect.pattern': {
                pattern: '^#[\\da-f]{3,8}$',
                flags: 'i',
              },
            },
          },
          rgb: {
            type: { kind: 'tuple', items: ['number', 'number', 'number'] },
            documentation: 'RGB color as [r, g, b]',
          },
          name: {
            type: 'string',
            documentation: 'Named CSS color',
          },
        },
      },
    },
  }
}
```

Using `color` directly produces a compiler error:

```atscript
// Error: 'color' is a container — use color.hex, color.rgb, or color.name
background: color

// OK
background: color.hex
```

### Inheritance Rules

Extensions inherit from their parent:

- **`type`** — inherited if not specified (so `string.email` has `type: 'string'`)
- **`documentation`** — inherited if not specified
- **`annotations`** — merged with parent's map (child entries are added on top)
- **`tags`** — inherited from parent

This means you can define a base type once and specialize it:

```typescript
primitives: {
  id: {
    type: 'string',
    documentation: 'An identifier string',
    annotations: { 'expect.minLength': 1 },
    extensions: {
      uuid: {
        documentation: 'UUID v4 identifier',
        annotations: {
          'expect.pattern': {
            pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
            flags: 'i',
          },
        },
        // inherits type: 'string' and expect.minLength: 1
      },
      slug: {
        documentation: 'URL-safe slug',
        annotations: {
          'expect.pattern': { pattern: '^[a-z0-9-]+$' },
          'expect.maxLength': 100,
        },
        // inherits type: 'string' and expect.minLength: 1
      },
    },
  },
}
```

### Nested Extensions

Extensions can have their own extensions, creating multi-level hierarchies:

```typescript
primitives: {
  number: {
    type: 'number',
    extensions: {
      int: {
        annotations: { 'expect.int': true },
        extensions: {
          positive: { annotations: { 'expect.min': 0 } },
          negative: { annotations: { 'expect.max': 0 } },
        },
      },
    },
  },
}
```

This gives you `number.int`, `number.int.positive`, and `number.int.negative` — each inheriting and accumulating annotations from the levels above.

## Semantic Tags

Tags are string identifiers attached to primitive instances. They give runtime code a way to discriminate between primitives that share the same underlying scalar type. For example, `string.email` and `string.uuid` both have `type: 'string'` — but their tags (`['email']` vs `['uuid']`) let runtime code tell them apart without inspecting the primitive name.

```typescript
primitives: {
  currency: {
    type: 'number',
    tags: ['currency'],
    documentation: 'A monetary value',
    extensions: {
      usd: { tags: ['usd'], documentation: 'US Dollars' },
      eur: { tags: ['eur'], documentation: 'Euros' },
    },
  },
}
```

Tags are inherited — `currency.usd` carries both the `'currency'` tag from its parent and its own `'usd'` tag. Your code generator should make these tags available at runtime so that consuming code can query them (e.g., to choose a currency formatter based on the tag).

## Phantom Primitives

Primitives with `type: 'phantom'` represent **non-data properties** — fields that carry metadata and annotations but do not contribute to the data shape of a structure. They exist for runtime discovery (e.g., a form renderer or code generator can find them in the type tree) but they are not part of the actual data model.

### Purpose and Intent

The core idea: a structure can contain fields that describe **UI elements, layout hints, or actions** alongside real data fields. These phantom fields:

- **Should not appear in the data type** — they don't represent actual data that gets stored, transmitted, or validated. A language plugin should exclude them from the generated type/class shape (or mark them as non-data in whatever way the target language supports).
- **Should be skipped by validation** — since they carry no data, validators should ignore them.
- **Should be discoverable at runtime** — the whole point is that code walking the type tree can find these fields and their annotations. A form renderer, for example, can use them to insert dividers, headings, or action buttons between real data fields.

### How to Handle Phantom Types in Your Plugin

When building a code generator, you need to decide how your target language handles phantom fields. The key principle: **phantom fields must not affect the data contract**. Some approaches:

- **Exclude from the generated type entirely** — the simplest approach. The field exists only in the runtime type metadata, not in the language-level type.
- **Include but mark as non-data** — in languages with richer type systems, you might use a special marker type, a decorator, or a comment to indicate the field is phantom.
- **Separate data type from metadata type** — generate two representations: a clean data type without phantom fields, and a full metadata type that includes them.

The important thing is that serialization, deserialization, and validation of real data should never encounter phantom fields.

### Example

```typescript
primitives: {
  ui: {
    type: 'phantom',
    isContainer: true,
    documentation: 'Non-data UI elements for form rendering',
    extensions: {
      divider:   { documentation: 'Visual divider between sections' },
      paragraph: { documentation: 'Informational text block' },
      action:    { documentation: 'Interactive element (button, link)' },
    },
  },
}
```

```atscript
export interface RegistrationForm {
    @meta.label "Full Name"
    name: string.required

    @meta.label "By signing up you agree to our terms."
    terms: ui.paragraph

    @meta.label "Submit"
    @ui.component "primary-button"
    submit: ui.action
}
```

Here `terms` and `submit` are phantom — they describe UI elements, not data. The actual data shape of `RegistrationForm` has only one field: `name`. But a form renderer walking the full type tree finds all three fields in source order and can render a text block and a button alongside the input field.

You can detect phantom types in your code generator by checking if a property's resolved type is a primitive with `type: 'phantom'`. Use `doc.unwindType()` to resolve references, then inspect the primitive config.

## Next Steps

- [Custom Annotations](/plugin-development/annotation-system) — define your own annotation specs with validation
- [Building a Code Generator](/plugin-development/code-generation) — generate output files from your custom types

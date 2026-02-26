# Custom Primitives

Primitives are the fundamental scalar types in Atscript — `string`, `number`, `boolean`, and their semantic extensions like `string.email` or `number.int`. Plugins can add new primitive types and extensions that work identically to built-in ones: they appear in IntelliSense, carry validation constraints, and generate appropriate type tags at runtime.

## What Primitives Are

A primitive in Atscript has:

- An underlying **type** — one of the scalar types (`string`, `number`, `boolean`, `void`, `null`, `phantom`) or a complex type definition
- Optional **documentation** — shown in hover tooltips in the editor
- Optional **validation constraints** (`expect`) — automatically enforced at runtime
- Optional **semantic tags** — string identifiers for runtime type discrimination
- Optional **extensions** — sub-primitives accessed via dot notation (e.g., `string.email`)

When a primitive has extensions, it becomes a namespace. `string` is a usable type on its own, but `string.email` is a more specific variant that inherits everything from `string` and adds its own constraints.

## The TPrimitiveConfig Interface

Primitives are defined using `TPrimitiveConfig`:

```typescript
interface TPrimitiveConfig {
  type?: TPrimitiveTypeDef
  documentation?: string
  tags?: string[]
  isContainer?: boolean
  expect?: {
    min?: number // for number types
    max?: number // for number types
    int?: boolean // for number types
    minLength?: number // for string or array types
    maxLength?: number // for string or array types
    pattern?: string | RegExp | (string | RegExp)[] // for string types
    required?: boolean // for string or boolean types
    message?: string // custom error message
  }
  extensions?: Record<string, Partial<TPrimitiveConfig>>
}
```

| Field           | Type                  | Description                                                                              |
| --------------- | --------------------- | ---------------------------------------------------------------------------------------- |
| `type`          | `TPrimitiveTypeDef`   | Underlying scalar or complex type. Inherited from parent if omitted.                     |
| `documentation` | `string`              | Markdown text shown in IntelliSense. Inherited from parent if omitted.                   |
| `tags`          | `string[]`            | Semantic tags for runtime discrimination (e.g., `['email']`).                            |
| `isContainer`   | `boolean`             | If `true`, the primitive itself can't be used — one of its extensions must be chosen.    |
| `expect`        | `object`              | Validation constraints automatically enforced at runtime. Merged with parent's `expect`. |
| `extensions`    | `Record<string, ...>` | Sub-primitives accessible via dot notation.                                              |

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
                expect: { min: -90, max: 90 },
              },
              longitude: {
                type: 'number',
                documentation: 'Longitude coordinate (-180 to 180)',
                tags: ['longitude'],
                expect: { min: -180, max: 180 },
              },
              postalCode: {
                type: 'string',
                documentation: 'Postal/ZIP code',
                tags: ['postalCode'],
                expect: {
                  pattern: /^[A-Z0-9 -]{3,10}$/i,
                  message: 'Invalid postal code format',
                },
              },
            },
          },
        },
      }
    },
  })
```

Now `.as` files can use these types:

```atscript
export interface Location {
    @label "Latitude"
    lat: geo.latitude

    @label "Longitude"
    lng: geo.longitude

    @label "ZIP Code"
    zip: geo.postalCode
}
```

### Real-World Example: MongoDB Plugin

The `@atscript/mongo` plugin adds two primitives:

```typescript
// from @atscript/mongo
export const MongoPlugin = () =>
  createAtscriptPlugin({
    name: 'mongo',
    config() {
      return {
        primitives: {
          mongo: {
            extensions: {
              objectId: {
                type: 'string',
                documentation: 'MongoDB ObjectId',
                expect: { pattern: /^[a-fA-F0-9]{24}$/ },
              },
              vector: {
                type: { kind: 'array', of: 'number' },
                documentation: 'Vector embedding array for vector search',
              },
            },
          },
        },
      }
    },
  })
```

Notice how `mongo.vector` uses a complex type definition (`{ kind: 'array', of: 'number' }`) rather than a simple scalar string.

## Complex Type Definitions

The `type` field accepts `TPrimitiveTypeDef`, which can be:

### Scalar Types

A plain string for simple types:

```typescript
type: 'string' // textual data
type: 'number' // numeric data
type: 'boolean' // true/false
type: 'void' // no value
type: 'null' // null value
type: 'phantom' // metadata-only (excluded from generated types and validation)
```

### Array Type

An array of a given element type:

```typescript
type: { kind: 'array', of: 'number' }         // number[]
type: { kind: 'array', of: 'string' }         // string[]
```

### Union Type

One of several possible types:

```typescript
type: {
  kind: 'union',
  items: ['string', 'number']                  // string | number
}
```

### Intersection Type

A combination of types:

```typescript
type: {
  kind: 'intersection',
  items: ['string', 'number']                  // string & number
}
```

### Tuple Type

A fixed-length array with typed positions:

```typescript
type: {
  kind: 'tuple',
  items: ['number', 'number']                  // [number, number]
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
  propsPatterns: {}
}
```

### Optional Wrapper

Any scalar can be made optional:

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
          type: 'string',                      // "Point"
          coordinates: {
            kind: 'tuple',
            items: ['number', 'number'],       // [longitude, latitude]
          },
        },
        propsPatterns: {},
      },
      documentation: 'GeoJSON Point with [longitude, latitude] coordinates',
    },
  },
}
```

## Validation Constraints

The `expect` field defines constraints that are automatically enforced by the runtime validator. You don't need to add `@expect.*` annotations manually — they're built into the primitive.

### For String Types

```typescript
expect: {
  pattern: /^[a-z0-9-]+$/,          // regex pattern (or array of patterns)
  minLength: 1,                      // minimum length
  maxLength: 255,                    // maximum length
  required: true,                    // non-empty, non-whitespace
  message: 'Invalid format',        // custom error message for pattern
}
```

Multiple patterns can be provided as an array — the value must match **at least one**:

```typescript
expect: {
  pattern: [
    /^\d{4}-\d{2}-\d{2}$/,          // YYYY-MM-DD
    /^\d{2}\/\d{2}\/\d{4}$/,        // MM/DD/YYYY
  ],
  message: 'Invalid date format',
}
```

### For Number Types

```typescript
expect: {
  min: 0,                           // minimum value (inclusive)
  max: 100,                         // maximum value (inclusive)
  int: true,                        // must be integer
}
```

### For Boolean Types

```typescript
expect: {
  required: true,                   // must be true (useful for "accept terms" checkboxes)
}
```

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
            expect: { pattern: /^#[\da-f]{3,8}$/i },
          },
          rgb: {
            type: {
              kind: 'tuple',
              items: ['number', 'number', 'number'],
            },
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
- **`expect`** — merged with parent's constraints (child constraints are added, not replaced)
- **`tags`** — inherited from parent

This means you can define a base type once and specialize it:

```typescript
primitives: {
  id: {
    type: 'string',
    documentation: 'An identifier string',
    expect: { minLength: 1 },
    extensions: {
      uuid: {
        documentation: 'UUID v4 identifier',
        expect: {
          pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        },
        // inherits type: 'string' and expect.minLength: 1 from parent
      },
      slug: {
        documentation: 'URL-safe slug',
        expect: {
          pattern: /^[a-z0-9-]+$/,
          maxLength: 100,
        },
        // inherits type: 'string' and expect.minLength: 1 from parent
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
        expect: { int: true },
        extensions: {
          positive: { expect: { min: 0 } },
          negative: { expect: { max: 0 } },
        },
      },
    },
  },
}
```

This gives you `number.int`, `number.int.positive`, and `number.int.negative` — each inheriting and accumulating constraints from the levels above.

## Semantic Tags

Tags are string identifiers attached to primitive instances. They provide a way for runtime code to discriminate between primitives that share the same underlying scalar type. For example, `string.email` and `string.uuid` both have `type: 'string'` — but their tags (`['email']` vs `['uuid']`) let runtime code tell them apart without inspecting the primitive name.

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

Tags are inherited — `currency.usd` would have both the `'currency'` tag from its parent and its own `'usd'` tag. Your code generator should make these tags available at runtime so that consuming code can query them (e.g., to choose a currency formatter based on the tag).

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
    @label "Full Name"
    name: string.required

    @label "By signing up you agree to our terms."
    terms: ui.paragraph

    @label "Submit"
    @component "primary-button"
    submit: ui.action
}
```

Here `terms` and `submit` are phantom — they describe UI elements, not data. The actual data shape of `RegistrationForm` has only one field: `name`. But a form renderer walking the full type tree finds all three fields in source order and can render a text block and a button alongside the input field.

You can detect phantom types in your code generator by checking if a property's resolved type is a primitive with `type: 'phantom'`. Use `doc.unwindType()` to resolve references, then inspect the primitive config.

## Next Steps

- [Custom Annotations](/plugin-development/annotation-system) — define annotation specs with validation and AST modification
- [Building a Code Generator](/plugin-development/code-generation) — generate output files from your custom types

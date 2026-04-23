# Primitives

## Built-ins

| Name        | TS shape    | Notes                                                                             |
| ----------- | ----------- | --------------------------------------------------------------------------------- |
| `string`    | `string`    |                                                                                   |
| `number`    | `number`    | JS float. Use `number.int` for integers.                                          |
| `decimal`   | `string`    | Arbitrary-precision. For money/financial. Maps to SQL `DECIMAL`.                  |
| `boolean`   | `boolean`   |                                                                                   |
| `null`      | `null`      |                                                                                   |
| `undefined` | `undefined` |                                                                                   |
| `void`      | `void`      |                                                                                   |
| `never`     | `never`     |                                                                                   |

## Semantic extensions

Chained via dots. Each narrows the parent with constraints; TS output shape = base primitive.

**`string.*`**
- `string.email` — email format.
- `string.uuid` — UUID (any version; constrain with `@expect.pattern` for v4-only).
- `string.required` — non-empty (`minLength: 1`).

**`number.*`**
- `number.positive` / `number.negative`.
- `number.float` / `number.double` — precision variants, each with `.positive` / `.negative`.
- `number.int` — integer. Rejects floats. Has `.positive` / `.negative`.
- `number.int.int8` / `.int16` / `.int32` / `.int64` — signed ranges (int64 clamped to JS safe-int).
- `number.int.uint8` / `.uint16` / `.uint32` / `.uint64` — unsigned ranges.
- `number.timestamp` — integer timestamp (seconds vs ms is project-decided).

**`boolean.*`**
- `boolean.required` — must be truthy (consent flags, T&Cs).

**`phantom`** — exists at runtime for type-system purposes only. Not serialized/validated. For branded types or metadata-only properties that shouldn't appear in JSON Schema.

## Usage

```atscript
export interface Product {
  id: string.uuid
  price: decimal
  inStock: boolean
  legalAgreement: boolean.required
  quantity: number.int.positive
  updatedAt: number.timestamp
}
```

Primitives merge with per-property `@expect.*`:

```atscript
export interface User {
  @expect.pattern(/^\+[0-9]{7,15}$/)
  phone: string.required
}
```

## Extending via config

Custom extensions under `primitives` in `atscript.config.*`. Identified by dotted name (`string.slug`, `number.int.port`). Declares base type + annotations.

Primitives use generic `annotations: Record<string, TPrimitiveAnnotationValue>` — there is **no** hardcoded `expect` property. Reference full annotation names (`expect.pattern`, `expect.min`, …).

```js
import { defineConfig } from '@atscript/core'
import ts from '@atscript/typescript'

export default defineConfig({
  plugins: [ts()],
  primitives: {
    string: {
      extensions: {
        slug: {
          type: 'string',
          annotations: {
            'expect.pattern': /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
            'expect.minLength': 1,
            'expect.maxLength': 80,
            'meta.description': 'Lowercase, hyphen-separated identifier.',
          },
        },
      },
    },
    number: {
      extensions: {
        int: {
          extensions: {
            port: {
              type: 'number',
              annotations: {
                'expect.min': 1,
                'expect.max': 65535,
                'expect.int': true,
              },
            },
          },
        },
      },
    },
  },
})
```

Use:

```atscript
export interface Site {
  slug: string.slug
  hostPort: number.int.port
}
```

Value shape per `AnnotationSpec`:
- `multiple: true` annotations → array of values.
- No-arg annotations (`@meta.sensitive`) → `true`.
- Object-argument annotations → full object.

## `AtscriptPrimitiveTags`

Generated `atscript.d.ts` also declares `AtscriptPrimitiveTags` — maps each primitive path to its TS shape. Powers typed narrowing in `Validator` and autocompletion for primitive tags. Never hand-edit; regenerate with `npx asc -f dts`.

## See also

- [annotations.md](annotations.md) — `@meta.*` / `@expect.*`, authoring new ones.
- [config.md](config.md) — where `primitives` lives.
- [plugin-development.md](plugin-development.md) — contributing from a plugin.

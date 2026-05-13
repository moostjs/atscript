# Primitives

## Built-ins

| Name        | TS shape    | Notes                                                                             |
| ----------- | ----------- | --------------------------------------------------------------------------------- |
| `string`    | `string`    |                                                                                   |
| `number`    | `number`    | JS float. Use `number.int` for integers.                                          |
| `decimal`   | `string`    | Arbitrary-precision. For money/financial. Maps to SQL `DECIMAL`.                  |
| `boolean`   | `boolean`   |                                                                                   |
| `null`      | `null`      |                                                                                   |
| `undefined` | `void`      |                                                                                   |
| `void`      | `void`      |                                                                                   |
| `never`     | `never`     |                                                                                   |
| `phantom`   | (none)      | Type-system only; not validated/serialized; discoverable via runtime traversal.   |

## Semantic extensions

Chained via dots. Each narrows the parent with annotation-based constraints; TS output shape = base primitive.

### `string.*`

| Extension         | Effect                                                                            |
| ----------------- | --------------------------------------------------------------------------------- |
| `string.email`    | `expect.pattern` for email format.                                                |
| `string.phone`    | `expect.pattern` `^\+?[0-9\s-]{10,15}$`.                                          |
| `string.date`     | `expect.pattern` (multiple): `YYYY-MM-DD` / `MM/DD/YYYY` / `DD-MM-YYYY` / `D Month YYYY`. |
| `string.isoDate`  | `expect.pattern` (multiple): ISO 8601 UTC or with timezone.                       |
| `string.uuid`     | `expect.pattern` UUID (any version, case-insensitive).                            |
| `string.url`      | `expect.pattern` `^https?:\/\/[^\s]+$`.                                           |
| `string.ip`       | `expect.pattern` IPv4 or IPv6.                                                    |
| `string.ipv4`     | `expect.pattern` IPv4 only.                                                       |
| `string.ipv6`     | `expect.pattern` IPv6 only.                                                       |
| `string.char`     | `expect.minLength 1` + `expect.maxLength 1`.                                      |
| `string.required` | `meta.required` — validator rejects whitespace-only strings (`value.trim().length === 0`). NOT `minLength: 1`. |

### `number.*`

| Extension                | Effect                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------- |
| `number.positive`        | `expect.min 0`.                                                                       |
| `number.negative`        | `expect.max 0`.                                                                       |
| `number.single`          | Single-precision float. Has `.positive` / `.negative`.                                |
| `number.double`          | Double-precision float. Has `.positive` / `.negative`.                                |
| `number.int`             | `expect.int true`. Has `.positive` / `.negative`.                                     |
| `number.int.int8`        | tag `int8`, range −128…127.                                                           |
| `number.int.int16`       | tag `int16`, range −32 768…32 767.                                                    |
| `number.int.int32`       | tag `int32`, 32-bit signed range.                                                     |
| `number.int.int64`       | tag `int64`, clamped to JS safe-int range.                                            |
| `number.int.uint8`       | tag `uint8`, range 0…255.                                                             |
| `number.int.uint8.byte`  | tag `byte` — alias for `uint8`.                                                       |
| `number.int.uint16`      | tag `uint16`, range 0…65 535.                                                         |
| `number.int.uint16.port` | tag `port` — network port (alias for `uint16`).                                       |
| `number.int.uint32`      | tag `uint32`, range 0…4 294 967 295.                                                  |
| `number.int.uint64`      | tag `uint64`, clamped to JS safe-int range.                                           |
| `number.timestamp`       | `expect.int true`.                                                                    |
| `number.timestamp.created` | tag `created`. Auto-applies `@db.default.now` (DB layer reads this).                |
| `number.timestamp.updated` | tag `updated`. DB adapters auto-update on every write.                              |

### `boolean.*`

| Extension          | Effect                                                                              |
| ------------------ | ----------------------------------------------------------------------------------- |
| `boolean.required` | `meta.required` — validator requires `true`.                                        |
| `boolean.true`     | Documentation marker for a `true` value (no constraints attached).                  |
| `boolean.false`    | Documentation marker for a `false` value (no constraints attached).                 |

`phantom` exists at runtime for type-system purposes only; not serialized/validated. For branded types or metadata-only properties.

## Usage

```atscript
export interface Product {
  id: string.uuid
  price: decimal
  inStock: boolean
  legalAgreement: boolean.required
  quantity: number.int.positive
  port: number.int.uint16.port
  updatedAt: number.timestamp.updated
}
```

Primitives merge with per-property `@expect.*`:

```atscript
export interface User {
  @expect.pattern '^\\+[0-9]{7,15}$'
  phone: string.required
}
```

## Extending via config

Custom extensions under `primitives` in `atscript.config.*`. Identified by dotted name (`string.slug`, `number.int.port`). Declares base type + annotations.

Primitives use generic `annotations: Record<string, TPrimitiveAnnotationValue>` — no hardcoded `expect` property. Reference full annotation names (`expect.pattern`, `expect.min`, …).

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
            'expect.pattern': { pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
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
            myPort: {
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
  hostPort: number.int.myPort
}
```

Value shape per `AnnotationSpec`:
- `multiple: true` annotations → array of values.
- No-arg annotations (`@meta.sensitive`) → `true`.
- Object-argument annotations → full object.

## `AtscriptPrimitiveTags`

Generated `atscript.d.ts` declares `AtscriptPrimitiveTags` as a **string union type** mapping each primitive tag (e.g. `'int8'`, `'byte'`, `'created'`) to itself. Powers typed `tags: Set<AtscriptPrimitiveTags>` on runtime defs. Never hand-edit; regenerate with `npx asc -f dts`.

## See also

- [annotations.md](annotations.md) — `@meta.*` / `@expect.*` / `@emit.*`, authoring new ones.
- [config.md](config.md) — where `primitives` lives.
- [plugin-development.md](plugin-development.md) — contributing from a plugin.

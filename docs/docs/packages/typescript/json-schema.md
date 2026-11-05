# JSON Schema

Atscript types can be converted to [JSON Schema](https://json-schema.org/) for use with API documentation tools, form generators, or any system that consumes JSON Schema.

## Enabling JSON Schema

By default, JSON Schema support is disabled (`jsonSchema: false`) to keep generated output lightweight. To enable it, set the `jsonSchema` plugin option — see [Configuration — `jsonSchema`](/packages/typescript/configuration#jsonschema) for the available modes and examples.

## Usage

Two ways to get a JSON Schema from an Atscript type:

```typescript
import { Product } from './product.as'
import { buildJsonSchema } from '@atscript/typescript/utils'

// Option 1: from the generated type directly (requires jsonSchema: 'lazy' or 'bundle')
const schema = Product.toJsonSchema()

// Option 2: using the standalone function (always available)
const schema = buildJsonSchema(Product)
```

The `.toJsonSchema()` method on generated types requires the `jsonSchema` plugin option to be set to `'lazy'` or `'bundle'` — otherwise it throws a runtime error. Alternatively, add the [`@emit.jsonSchema`](#per-interface-override-emit-jsonschema) annotation to individual interfaces.

A schema embedded with `'bundle'` reflects the types as the build saw them; changes made at runtime (`metadata.set()`, `annotate()`) are only in `buildJsonSchema()` and `'lazy'` schemas. See [`jsonSchema`](/packages/typescript/configuration#jsonschema).

::: tip Manual use is always available
Even with `jsonSchema: false`, you can import `buildJsonSchema` from `@atscript/typescript/utils` and call it directly. The config option only affects the _generated_ `.toJsonSchema()` method — the standalone function always works.

```typescript
import { buildJsonSchema } from '@atscript/typescript/utils'
import { Product } from './product.as'

const schema = buildJsonSchema(Product) // works regardless of config
```

:::

## Per-Interface Override: `@emit.jsonSchema`

The `@emit.jsonSchema` annotation forces build-time JSON Schema embedding for a specific interface, regardless of the global `jsonSchema` setting. This is useful when you've disabled JSON Schema globally but need it for select types:

```atscript
@emit.jsonSchema
export interface ApiResponse {
    status: string
    @expect.minLength 1
    message: string
}
```

`ApiResponse.toJsonSchema()` will return the pre-computed schema even if `jsonSchema: false` is set in the plugin config. The annotation can only be applied to interfaces (top-level).

## Options

`buildJsonSchema(type, options?)` takes three options. The generated `toJsonSchema()` uses the [`jsonSchemaOptions`](/packages/typescript/configuration#jsonschemaoptions) plugin option and returns the same schema.

| Option        | Default | Effect                                                                                                                                              |
| ------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `annotations` | `true`  | `@meta.description` becomes `description`, `@meta.label` becomes `title`, on the schema of the type or field that carries them                       |
| `enums`       | `true`  | A union of literals (`'a' \| 'b'`, also with `null`) becomes `{ "type": "string", "enum": ["a", "b"] }` instead of an `anyOf` of `const` schemas |
| `closed`      | `false` | Every object schema gets `additionalProperties: false`                                                                                              |

```typescript
import { buildJsonSchema } from '@atscript/typescript/utils'

buildJsonSchema(Order) // annotations and enums on, objects open
buildJsonSchema(Order, { closed: true }) // also rejects undeclared keys
buildJsonSchema(Order, { annotations: false, enums: false }) // the output of 0.2.4 and earlier
```

### Titles and descriptions

A field that refers to a named type keeps the type's own `title` / `description` on its `$defs` entry. When the field carries a description of its own, it goes beside the reference:

```json
{
  "shipTo": { "allOf": [{ "$ref": "#/$defs/Address" }], "description": "Delivery address" }
}
```

An optional field keeps its `title` / `description` beside the `anyOf` that adds `null`. `fromJsonSchema()` reads `title` and `description` back as `@meta.label` and `@meta.description`.

### Enums

A union whose members are all literals (and `null`) is written as one `enum`:

```atscript
export interface Order {
    status: 'active' | 'blocked'
    reason: 'late' | 'damaged' | null
}
```

```json
{
  "status": { "type": "string", "enum": ["active", "blocked"] },
  "reason": { "type": ["string", "null"], "enum": ["late", "damaged", null] }
}
```

A union with any other member (a `string`, an object) keeps `anyOf`; a union of objects with a discriminator keeps `oneOf`.

### Closed objects

With `closed: true` a schema accepts exactly the values the validator accepts with its default `unknownProps: 'error'` (except for the [differences](#differences-from-the-validator) below). It stays off by default because it changes the schemas of existing APIs (Swagger / OpenAPI output included).

## Annotation Constraints

Annotations from `.as` files are translated into JSON Schema constraints:

| Annotation                  | JSON Schema                                       | Notes                                                                                                        |
| --------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `@meta.required`            | `minLength: 1` + `pattern: "\\S"` / `const: true` | For string fields: at least one non-whitespace character; for booleans: `true`                               |
| `@expect.minLength`         | `minLength` / `minItems`                          | `minLength` for strings, `minItems` for arrays                                                               |
| `@expect.maxLength`         | `maxLength` / `maxItems`                          | `maxLength` for strings, `maxItems` for arrays                                                               |
| `@expect.min`               | `minimum`                                         |                                                                                                              |
| `@expect.max`               | `maximum`                                         |                                                                                                              |
| `@expect.exclusiveMin`      | `exclusiveMinimum`                                | Since 0.1.109                                                                                                |
| `@expect.exclusiveMax`      | `exclusiveMaximum`                                | Since 0.1.109                                                                                                |
| `@expect.int`               | `type: 'integer'`                                 | Changes `number` to `integer`                                                                                |
| `@expect.pattern`           | `pattern` / `allOf`                               | Single pattern uses `pattern`, multiple become `allOf` entries; flags are applied to the pattern (see below) |
| `@expect.minKeys`           | `minProperties`                                   | On a union, beside `anyOf` / `oneOf` (applies to its objects); on a named object, `allOf: [{ $ref }]` beside it |
| `@expect.maxKeys`           | `maxProperties`                                   | As `@expect.minKeys`                                                                                         |
| `@expect.array.uniqueItems` | `uniqueItems: true`                               | Not with `@expect.array.key` props on the items (see [Differences](#differences-from-the-validator))         |

On a nullable field (`@expect.max 10` on `number | null`), the constraint goes onto the matching non-null `anyOf` member: `{ anyOf: [{ type: 'number', maximum: 10 }, { type: 'null' }] }` (since 0.1.103). When the member has its own bound, the stricter one is kept.

## What the Validator Accepts

A schema accepts exactly the JSON values the validator accepts with `unknownProps: 'ignore'` (a schema allows keys it does not list; with [`closed: true`](#closed-objects), `unknownProps: 'error'`), except for the [differences](#differences-from-the-validator) below — checked with ajv 8 over the test generators' types and values:

| Type                      | JSON Schema                                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Optional prop `p?: T`     | Also accepts `null` (as the validator does): `{ "type": ["string", "null"] }` for a schema of one `type`, else `{ "anyOf": [<T>, { "type": "null" }] }`. Not with `@meta.required` (`null` is rejected there) |
| Tuple `[A, B]`            | `items: [A, B]`, `additionalItems: false`, `minItems: 2`, `maxItems: 2`                                                                                                                                       |
| `decimal`                 | `{ "type": "string", "pattern": "^[+-]?\\d+(\\.\\d+)?$" }`                                                                                                                                                    |
| `never`                   | `{ "not": {} }` (no value)                                                                                                                                                                                    |
| `unknown`                 | `{}` (any value)                                                                                                                                                                                              |
| Pattern props `[/^k/]: T` | `patternProperties`, each pattern excluding the declared prop names (the validator checks only keys the object does not declare)                                                                              |

`fromJsonSchema()` reads them back: an optional prop's `type: [T, "null"]` as `p?: T`, `patternProperties` as pattern props.

### Differences from the validator

JSON Schema cannot express these, so a schema accepts or rejects a few values the validator does not:

- **Uniqueness by key props.** `@expect.array.uniqueItems` on an array of objects with `@expect.array.key` props compares the key props only; the schema has no `uniqueItems` there (JSON Schema compares whole items), so it accepts items sharing their keys.
- **Key order in unique items.** Without key props, the validator compares items as written: `{ "a": 1, "b": 2 }` and `{ "b": 2, "a": 1 }` are different items; JSON Schema `uniqueItems` ignores the order of keys and rejects them.
- **A key matching several pattern props.** The validator wants it to pass one of them; `patternProperties` wants it to pass all of them.

`fromJsonSchema()` maps `exclusiveMinimum` / `exclusiveMaximum` back to `@expect.exclusiveMin` / `@expect.exclusiveMax`. It also reads the draft-4 boolean form (`minimum: 0, exclusiveMinimum: true`) as `@expect.exclusiveMin 0`.

### Pattern flags

A JSON Schema `pattern` has no flags, so the flags of `@expect.pattern` are written into the pattern, which then matches the strings the validator matches:

| Flag | In the schema's `pattern`                                                                                                                                   |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `i`  | Each character with case variants becomes a class of them: `abc` → `[aA][bB][cC]`, `[a-f]` → `[a-fA-F]` (with `u`, also `ſ` / `K`, which fold to `s` / `k`) |
| `s`  | Each `.` outside a character class becomes `[\s\S]`                                                                                                         |
| `m`  | The pattern is wrapped in a modifier group: `(?m:…)`                                                                                                        |
| `y`  | The pattern is anchored at the start of the value: `^(?:…)`                                                                                                 |
| `g`  | Nothing (it changes nothing for validation)                                                                                                                 |
| `u`  | Nothing: the pattern is written for a JSON Schema validator compiling patterns with `u` (ajv does by default)                                               |

`i` has no flag-free form for a backreference (`(a)\1` matches `aA`), a Unicode property escape (`\p{Lu}` with `iu` matches lowercase letters too), `\b` / `\B` / a `\W` inside a class with `u`, or a range of more than 1024 characters with non-ASCII ones: such a pattern is also wrapped in `(?i:…)`.

Modifier groups (`(?i:…)`, `(?m:…)`) are ES2025: JavaScript engines understand them from 2024 on (Node.js 23+); other regex dialects (.NET, PCRE2, Python 3.6+) have them too, some JSON Schema validators do not. A pattern written without `u` is emitted for a validator compiling it without `u`: compiled with `u` (ajv's default), it may differ on characters outside the Basic Multilingual Plane, and syntax only valid without `u` (`\-`, `a{`, `\p` meaning `p`) is not valid there — add `u` to patterns meant for JSON Schema.

## Example

Given this `.as` file:

```atscript
export interface Product {
    @expect.minLength 3
    @expect.maxLength 100
    name: string

    @expect.min 0
    price: number

    tags: string[]
}
```

`buildJsonSchema(Product)` produces:

```json
{
  "type": "object",
  "properties": {
    "name": { "type": "string", "minLength": 3, "maxLength": 100 },
    "price": { "type": "number", "minimum": 0 },
    "tags": { "type": "array", "items": { "type": "string" } }
  },
  "required": ["name", "price", "tags"]
}
```

## Named Types: `$defs` and `$ref`

Types compiled from `.as` files carry a stable `id` (the type name from the source file). When `buildJsonSchema` encounters named object types nested inside other types (e.g., union items, object properties), it automatically extracts them into `$defs` and references them via `$ref`:

```atscript
interface Cat {
    petType: 'cat'
    name: string
}

interface Dog {
    petType: 'dog'
    breed: string
}

export type CatOrDog = Cat | Dog
```

`buildJsonSchema(CatOrDog)` produces:

```json
{
  "$defs": {
    "Cat": {
      "type": "object",
      "properties": {
        "petType": { "const": "cat", "type": "string" },
        "name": { "type": "string" }
      },
      "required": ["petType", "name"]
    },
    "Dog": {
      "type": "object",
      "properties": {
        "petType": { "const": "dog", "type": "string" },
        "breed": { "type": "string" }
      },
      "required": ["petType", "breed"]
    }
  },
  "oneOf": [{ "$ref": "#/$defs/Cat" }, { "$ref": "#/$defs/Dog" }],
  "discriminator": {
    "propertyName": "petType",
    "mapping": {
      "cat": "#/$defs/Cat",
      "dog": "#/$defs/Dog"
    }
  }
}
```

Key behaviors:

- Only **named object types** (those with an `id`) are extracted to `$defs`. Primitives, unions, and arrays stay inline.
- The **root type** is never extracted — it IS the schema.
- If the same named type is referenced multiple times, it appears once in `$defs` and all occurrences become `$ref`.
- Types without an `id` (e.g., inline anonymous objects, hand-built types via `defineAnnotatedType()`) produce inline schemas, unless the very same type object is held in several places of the tree: types refer to each other's nodes instead of copying them (an `extends`, an intersection, `annotate … as` and a chain reference such as `T.a` hold the original prop), so such a type is built once into `$defs` under its prop's name (`Recursive` when it reaches itself) and every place refers to it. Types without an `id` whose schemas are the same (their references leading to the same definitions too) are one `$defs` entry — a recursive intersection used at several places, say, which has nodes of its own at each place; a named type always has its own entry.

### Programmatic `id`

For types built programmatically (not compiled from `.as` files), you can assign an `id` using the builder API:

```typescript
import { defineAnnotatedType } from '@atscript/typescript/utils'

const address = defineAnnotatedType('object')
  .prop('street', defineAnnotatedType().designType('string').$type)
  .prop('city', defineAnnotatedType().designType('string').$type)
  .id('Address')
```

## Discriminated Unions

When a union type consists entirely of objects that share a common property with distinct literal values, `buildJsonSchema` automatically detects it as a discriminated union and emits `oneOf` with a `discriminator` object instead of plain `anyOf`. When the union items have named types, the discriminator mapping uses `$ref` paths into `$defs` (as shown above).

Detection is fully automatic — no annotations required. The rules are:

- All union items must be objects
- Exactly **one** property must have a `const` literal value across **all** items
- All literal values for that property must be **distinct**

If these conditions aren't met, the union falls back to `anyOf`.

::: tip Advanced: `detectDiscriminator`
For tooling that needs to inspect discriminated unions without going through full JSON Schema generation, `@atscript/typescript/utils` exports a public helper:

```typescript
import { detectDiscriminator } from '@atscript/typescript/utils'

const info = detectDiscriminator(unionType.type.items)
// info is undefined when no discriminator is detected,
// or { propertyName, mapping: Record<literal, TAtscriptAnnotatedType> }
```

This is the same detection used internally by `buildJsonSchema`.
:::

## Converting from JSON Schema

You can also convert a JSON Schema object back into an Atscript annotated type using `fromJsonSchema`:

```typescript
import { fromJsonSchema, buildJsonSchema } from '@atscript/typescript/utils'

const schema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 3 },
    age: { type: 'number', minimum: 0 },
  },
  required: ['name', 'age'],
}

const type = fromJsonSchema(schema)

// The result is a fully functional annotated type
type.validator().validate({ name: 'Alice', age: 30 }) // passes

// Round-trip: buildJsonSchema(fromJsonSchema(schema)) preserves the schema
const roundTripped = buildJsonSchema(type)
```

`fromJsonSchema` supports the full subset of JSON Schema produced by `buildJsonSchema`, including:

- Object types with `properties` and `required`
- Arrays with `items`, `minItems`, `maxItems`
- Tuples (array with `items` as an array and `additionalItems: false`)
- `patternProperties` (as pattern props)
- Unions (`anyOf`, `oneOf`)
- Intersections (`allOf`)
- Primitives (`string`, `number`, `integer`, `boolean`, `null`)
- Literals (`const`)
- Enums (`enum` — converted to union of literals)
- `title` / `description` (as `@meta.label` / `@meta.description`)
- Constraints: `minLength`, `maxLength`, `minimum`, `maximum`, `pattern`, `minProperties`, `maxProperties`
- `$ref` / `$defs` — references are resolved automatically from `$defs` or `definitions`

::: tip Use case: external schemas
`fromJsonSchema` is useful for importing type definitions from external JSON Schema sources (OpenAPI specs, form generators, etc.) and using them with Atscript's validator at runtime.
:::

::: warning Unsupported features
Features like `not`, `if/then/else` and `additionalProperties` have no Atscript equivalent and are silently ignored.
:::

## Merging Schemas (OpenAPI / Swagger)

`mergeJsonSchemas` combines multiple annotated types into a single schema map with shared `$defs` — useful for building OpenAPI `components/schemas`:

```typescript
import { mergeJsonSchemas } from '@atscript/typescript/utils'
import { CatOrDog } from './pets.as'
import { Order } from './orders.as'

const merged = mergeJsonSchemas([CatOrDog, Order])
// with options, the same as buildJsonSchema's: mergeJsonSchemas([CatOrDog, Order], { closed: true })

// merged.schemas.CatOrDog — the CatOrDog schema (oneOf with $ref)
// merged.schemas.Order    — the Order schema
// merged.$defs: { Cat, Dog, ... } — shared definitions, deduplicated
```

Each type passed to `mergeJsonSchemas` must have an `id` (all types compiled from `.as` files do). The function:

1. Calls `buildJsonSchema` on each type
2. Hoists all `$defs` into a shared pool: a definition equal to one already pooled (the same schema, its references leading to equal definitions) is shared; a different one asking for a name already taken (two types named alike, from different files) gets the next free `<name>_<n>`, and the references to it are renamed
3. Returns individual schemas (without their `$defs`) alongside the merged definitions

## Next Steps

- [Validation](/packages/typescript/validation) — runtime validation with type guards
- [Serialization](/packages/typescript/serialization) — serialize types for transport

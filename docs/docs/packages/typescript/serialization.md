# Serialization

The serialization API converts runtime annotated types to and from a plain JSON format. This enables transferring type definitions between backend and frontend, storing them in databases, or caching compiled types.

```typescript
import {
  serializeAnnotatedType,
  deserializeAnnotatedType,
} from '@atscript/typescript/utils'
```

## Purpose

A common pattern is to serialize type definitions on the server and send them to the client. The client can then deserialize them and use them for validation, form generation, or schema-driven UI — without bundling the original `.as` files.

```
Server                         Client
  │                              │
  │  serializeAnnotatedType()    │
  │  ─────── JSON ──────────►    │
  │                    deserializeAnnotatedType()
  │                              │
  │                    type.validator().validate(input)
  │                    buildJsonSchema(type)
```

## Basic Usage

```typescript
import { Product } from './product.as'

// Serialize to a JSON-safe object
const serialized = serializeAnnotatedType(Product)
const json = JSON.stringify(serialized)

// ... transmit, store, or cache ...

// Deserialize back to a live type
const restored = deserializeAnnotatedType(JSON.parse(json))

// The restored type is fully functional
restored.validator().validate(data)
buildJsonSchema(restored)
```

## Deserialized Types Are Live

A deserialized type is a fully functional `TAtscriptAnnotatedType`:

- `.validator()` creates a working `Validator` instance
- Works with `buildJsonSchema()` and `forAnnotatedType()`
- `isAnnotatedType()` returns `true`
- Metadata is accessible via `.metadata.get()`

## Versioning

The serialized output includes a `$v` field with the format version (currently `1`). If the format changes in a future release, `deserializeAnnotatedType()` will throw when it encounters an incompatible version, so you know to re-serialize from the source types.

```typescript
import { SERIALIZE_VERSION } from '@atscript/typescript/utils'
// SERIALIZE_VERSION === 1
```

## Filtering Annotations

Use `TSerializeOptions` to control which annotations are included in the output. This is useful for stripping sensitive or server-only metadata before sending types to the client.

**Strip specific annotations:**

```typescript
const serialized = serializeAnnotatedType(Product, {
  ignoreAnnotations: ['mongo.collection', 'mongo.index.unique'],
})
```

**Transform annotations with a callback:**

```typescript
const serialized = serializeAnnotatedType(Product, {
  processAnnotation({ key, value, path, kind }) {
    // Only keep meta.* and expect.* annotations
    if (key.startsWith('meta.') || key.startsWith('expect.')) {
      return { key, value }
    }
    // Return undefined to strip
  },
})
```

The `processAnnotation` callback receives:
- `key` — annotation name (e.g. `'meta.label'`)
- `value` — annotation value
- `path` — property path to the current node (e.g. `['address', 'city']`)
- `kind` — type kind at this node (`''`, `'object'`, `'array'`, etc.)

## Use Cases

- **Dynamic form rendering** — send type definitions to the client to generate forms with labels, validation rules, and field types
- **Server-driven validation** — share validation rules between backend and frontend without code duplication
- **Microservice type contracts** — store serialized types in a registry for cross-service validation
- **Caching** — serialize compiled types to avoid re-parsing `.as` files on startup

## Next Steps

- [Type Definitions](/packages/typescript/type-definitions) — understand the annotated type system
- [Validation](/packages/typescript/validation) — validate data against types
- [JSON Schema](/packages/typescript/json-schema) — generate JSON Schema from types

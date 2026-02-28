# Serialization

The serialization API converts runtime annotated types to and from a plain JSON format. This enables transferring type definitions between backend and frontend, storing them in databases, or caching compiled types.

```typescript
import { serializeAnnotatedType, deserializeAnnotatedType } from '@atscript/typescript/utils'
```

## Purpose

Serialize type definitions on the server and send them to the client. The client deserializes them and uses them for validation, form generation, or schema-driven UI — without bundling the original `.as` files.

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
- The `id` field (type name) is preserved through serialization, so `buildJsonSchema` will still produce `$defs`/`$ref` for deserialized types

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
  ignoreAnnotations: ['db.table', 'db.mongo.collection'],
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

## Example: Server-Driven Form Rendering

A practical use case — the server serializes a type definition and the client uses it to render a form with labels and validation.

**Server** (Express endpoint):

```typescript
import { User } from './user.as'
import { serializeAnnotatedType } from '@atscript/typescript/utils'

app.get('/api/form/user', (req, res) => {
  const schema = serializeAnnotatedType(User, {
    ignoreAnnotations: ['db.table', 'db.mongo.collection'], // strip server-only metadata
  })
  res.json(schema)
})
```

**Client** (Vue component):

```vue
<script setup>
import { ref, onMounted } from 'vue'
import { deserializeAnnotatedType } from '@atscript/typescript/utils'

const fields = ref([])
const formData = ref({})

onMounted(async () => {
  const res = await fetch('/api/form/user')
  const type = deserializeAnnotatedType(await res.json())

  // Build form fields from type metadata
  for (const [name, prop] of type.props) {
    fields.value.push({
      name,
      label: prop.metadata.get('meta.label') || name,
      placeholder: prop.metadata.get('meta.placeholder') || '',
    })
    formData.value[name] = ''
  }
})
</script>

<template>
  <form>
    <div v-for="field in fields" :key="field.name">
      <label>{{ field.label }}</label>
      <input v-model="formData[field.name]" :placeholder="field.placeholder" />
    </div>
  </form>
</template>
```

The form fields, labels, and placeholders are all driven by annotations defined in the `.as` file — no duplication between server and client.

## Next Steps

- [Type Definitions](/packages/typescript/type-definitions) — the annotated type system
- [Validation](/packages/typescript/validation) — validate data against types
- [Metadata](/packages/typescript/metadata-export) — access annotations at runtime

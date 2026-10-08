# Serialization

The serialization API converts runtime annotated types to and from a plain JSON format. This enables transferring type definitions between backend and frontend, storing them in databases, or caching compiled types.

```typescript
import {
  serializeAnnotatedType,
  deserializeAnnotatedType,
  buildJsonSchema,
} from '@atscript/typescript/utils'
```

## Purpose

Serialize type definitions on the server and send them to the client. The client deserializes them and uses them for validation, live form tools, or schema-driven UI helpers without bundling the original `.as` files.

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

The serialized output includes a `$v` field with the format version (currently `2`). If the format changes in a future release, `deserializeAnnotatedType()` will throw when it encounters an incompatible version, so you know to re-serialize from the source types.

```typescript
import { SERIALIZE_VERSION } from '@atscript/typescript/utils'
// SERIALIZE_VERSION === 2
```

## FK References

FK references (`.ref`) are stripped from serialized output by default. Pass `refDepth: 1` to include immediate refs when the client needs to discover the target table (e.g., for value-help dropdowns on FK fields). Integer values expand `N` full levels; a fractional `.5` part (e.g. `refDepth: 0.5` or `refDepth: 1.5`) emits a shallow `{ id, metadata }` target at the tail level instead of the full body — handy for keeping payloads small when the client only needs the target's identity. Plain references (nav props such as `customer: Customer`) carry `ref` too, not only chain refs — see [The Annotated Type](/packages/typescript/type-definitions#the-annotated-type). For the full ref-control semantics, see the [`@atscript/db` docs](https://db.atscript.dev).

### Type references inside annotation values (since 0.1.100)

Annotation values that hold a type reference — a `ref` argument (`target: () => Dict`) or the `{ type, field }` of a qualified query field — are serialized as shallow targets instead of disappearing from the JSON:

| `refDepth`              | Serialized reference                                                         |
| ----------------------- | ---------------------------------------------------------------------------- |
| `0` (default)           | `{ id: 'Dict' }`                                                             |
| `> 0` (e.g. `0.5`, `1`) | `{ id: 'Dict', metadata: { … } }` — the target's interface-level annotations |

References inside that `metadata` are always `{ id }`, so the output is bounded and cycle-free. A chain ref such as `AttributeValue.value` serializes as `{ type: { id, metadata }, field: 'value' }`, the same shape as a prop's shallow `ref`. Plain objects and arrays are walked; every other value is left as is. A function is treated as a type-reference getter only when it is a zero-arity, plain synchronous arrow function (the shape the generated code emits); classes, `function` expressions, async functions and other functions are never invoked. `SERIALIZE_VERSION` is unchanged: these values used to serialize to nothing, and `deserializeAnnotatedType` keeps them as plain records.

### A named type used more than once

A named type (a node with an `id`) is serialized in full once; every further use is a `{ kind: '$ref', id }` entry, which also keeps cyclic types finite. When a later use carries something of its own — prop-level annotations merged over the type's, its own `optional`, or its own FK `ref` (another target field, or another target type that shares the alias type, as `customerCode: Customer.code` and `supplierCode: Supplier.code` do) — the entry is marked `own: true` and carries that use's `metadata`, `optional` and, when `refDepth` > 0, its `ref`. `deserializeAnnotatedType` then builds a separate node over the shared type, so each prop keeps its own annotations and `.ref`. Annotation values are compared structurally; a type reference in them (an argument such as `@ui.valueHelp Country`) is compared by the type it resolves to (by id), so two uses that bind different targets are `own` and two that bind the same target still collapse, while any other function or class instance is compared by reference. A use that adds nothing carries no `own` flag, an empty `metadata`, and restores to the very same node as the first use. `processAnnotation` is only consulted for entries that carry metadata (the first use and `own` entries), not for collapsed ones. Cyclic plain objects inside an annotation value are cut at the repeat (`'[Circular]'`), and BigInt values are tolerated.

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
    // Only keep meta.*, expect.*, and ui.* annotations
    if (key.startsWith('meta.') || key.startsWith('expect.') || key.startsWith('ui.')) {
      return { key, value }
    }
    // Return undefined to strip
  },
})
```

The `processAnnotation` callback receives:

- `key` — annotation name (e.g. `'meta.label'`)
- `value` — annotation value
- `path` — property path as a `string[]` array (e.g. `['address', 'city']`)
- `kind` — type kind at this node (`''`, `'object'`, `'array'`, etc.)

### Annotation overrides

`annotationOverrides(type)` lets the caller add, replace or remove annotations per node without touching the runtime metadata. It receives the annotated type node that owns each serialized metadata block (the root, props, items, union/tuple members, full ref bodies, shallow ref targets, and types referenced from annotation values) and returns a record of overrides, or `undefined` for none:

```typescript
const serialized = serializeAnnotatedType(Product, {
  annotationOverrides(type) {
    if (type === Product) {
      return { 'db.http.path': '/api/products', 'meta.description': undefined }
    }
  },
})
```

- A key absent from the node is added, an existing key is replaced, and a key whose value is `undefined` is removed.
- Overrides are applied first. `ignoreAnnotations` and `processAnnotation` then filter the merged result, so an override can still be ignored, and `processAnnotation` sees the overridden value.
- Keep the function pure in the node. A repeated named type serializes its metadata once; later uses that add nothing collapse to a `$ref` and restore to the first node, which carries its overrides.
- Runtime metadata is never modified. Without the option, the output is unchanged.

## Example: Server-Driven Field Tools

A practical use case: the server serializes a type definition and the client uses it to build a field list with labels and placeholders.

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

  // Build UI field data from type metadata
  for (const [name, prop] of type.type.props.entries()) {
    fields.value.push({
      name,
      label: prop.metadata.get('meta.label') || name,
      placeholder: prop.metadata.get('ui.placeholder') || '',
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

The field list, labels, and placeholders are all driven by annotations defined in the `.as` file, so the client does not need to duplicate that configuration.

## Next Steps

- [Type Definitions](/packages/typescript/type-definitions) — the annotated type system
- [Validation](/packages/typescript/validation) — validate data against types
- [Metadata](/packages/typescript/metadata-export) — access annotations at runtime

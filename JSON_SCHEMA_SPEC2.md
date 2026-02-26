# JSON Schema v2: Named Types, `$ref`, and `$defs`

## Problem

`buildJsonSchema` currently inlines all types. A union like `Cat | Dog` produces flat `anyOf`/`oneOf` with duplicated inline schemas. There is no way to:

- Reference a named type via `$ref`
- Deduplicate shared types across multiple schemas
- Build an OpenAPI `components/schemas` section from Atscript types

## Goal

Give every interface, type alias, and exported annotate alias a **stable identity** at runtime so that `buildJsonSchema` can:

1. Extract named object types into `$defs`
2. Reference them via `$ref: "#/$defs/Cat"`
3. For discriminated unions, produce clean `$ref`-based `oneOf` + `discriminator`
4. Enable merging multiple schemas (e.g., for Swagger) with deduplication by ID

---

## Design

### 1. Core: Unique Type ID

Each interface, type alias, and exported annotate alias receives a **unique string ID** assigned at parse time.

**File**: `packages/core/src/document.ts`

- Add a module-level name tracking map: `const _typeNameCounts = new Map<string, number>()`
- In `registerDefinition()` (called for every interface/type/annotate-alias):
  1. Get the current count for `node.id` from the map (default `0`)
  2. Increment and store: `_typeNameCounts.set(name, count + 1)`
  3. If this is the **first** occurrence (`count === 0`), assign `node.__typeId = name` (no suffix)
  4. If this is a **repeat** (`count > 0`), assign `node.__typeId = "{name}__{count + 1}"` (e.g., `Cat__2`)
  5. On the first collision, also retroactively update the **first** node's `__typeId` to `"{name}__1"` — but since the first node was already emitted, we handle this differently: track whether a name has been seen more than once, and on the **second** encounter, suffix both. See below.
- The ID is scoped to the process lifetime — no persistence needed; it's only used to disambiguate same-named types at runtime

**Deferred suffixing approach** (simpler):

Instead of retroactively patching the first node, use a two-pass approach in codegen:

1. Core assigns `node.__typeId = _nextCounter++` (a plain integer, as before)
2. Core also tracks `node.id` (the name) — already available
3. **Codegen** (`js-renderer.ts`) builds the string ID at emit time:
   - First pass: scan all nodes in `postAnnotate`, count name occurrences
   - Second pass: emit `static id = "Cat"` for unique names, `static id = "Cat__1"` / `static id = "Cat__2"` for collisions

This avoids any retroactive mutation in core. The counter is only used as a tiebreaker suffix.

**Semantic node change** (`packages/core/src/parser/nodes/semantic-node.ts`):

```ts
// New optional field on SemanticNode
public __typeId?: number
```

Only set for interface, type, and annotate-alias nodes — not props, refs, or primitives.

### 2. TypeScript Runtime: `id` on Annotated Types

**File**: `packages/typescript/src/annotated-type.ts`

Add an optional `id` field to the annotated type interface:

```ts
export interface TAtscriptAnnotatedType<...> {
  __is_atscript_annotated_type: true
  type: T
  validator(...): Validator<...>
  metadata: TMetadataMap<AtscriptMetadata>
  optional?: boolean
  id?: string   // NEW — e.g. "Cat"
}
```

**Builder handle** — add an `id()` method (for programmatic use only; codegen uses static fields instead):

```ts
// In TAnnotatedTypeHandle interface
id(value: string): TAnnotatedTypeHandle

// In defineAnnotatedType() implementation
id(value: string) {
  this.$type.id = value
  return this
}
```

**`defineAnnotatedType()` with `base`** — preserve existing `id` from static field:

When called with a `base` class (e.g., `$("object", Cat)`), the `Object.assign(base, { ... })` overwrites `__is_atscript_annotated_type`, `type`, `metadata`, and `validator` but does **not** touch `id`. Since `id` was already set as a static class field (see §3), it survives the `Object.assign` — no extra logic needed.

**`refTo()` change** — carry `id` from the referenced type:

```ts
refTo(type, chain?) {
  // ... existing logic ...
  this.$type = {
    __is_atscript_annotated_type: true,
    type: newBase.type,
    metadata,
    id: newBase.id,  // NEW — carry the id through
    validator(...) { ... },
  }
  return this
}
```

**Why this works regardless of declaration order**: `id` is a static class field (see §3), so it's available as soon as the class is declared — before any builder calls run. When `$().refTo(Cat)` executes, `Cat.id` is already `"Cat"` from the class statics, even if `$("object", Cat).prop(...)` hasn't executed yet.

### 3. Codegen: Emit `id` as a Static Class Field

**File**: `packages/typescript/src/codegen/js-renderer.ts`

**Critical design decision**: `id` is emitted as a **static class field** in `renderClassStatics()`, NOT as a `.id()` builder call in `post()`. This ensures `id` is available at class declaration time, before any builder calls execute.

**Why not `.id()` in the builder chain?** The `post()` phase runs all `defineAnnotatedType` builder chains in order. When a union type's builder calls `$().refTo(Cat)`, it reads `Cat.id`. If `id` were set via `.id("Cat")` in Cat's builder chain, it would only be available if Cat's builder had already run — which depends on declaration order. By storing `id` as a static field, it's available **immediately** when the class is declared.

**Name collision detection** — build the ID string at render time:

In `renderClassStatics()`, the renderer needs the resolved string ID. Since `renderClassStatics` runs during the main render phase (before `post()`), and we need to know whether a name collides, the renderer pre-scans all definitions in its constructor or `pre()`:

```ts
// In JsRenderer — precompute IDs
private typeIds = new Map<SemanticNode, string>()

pre() {
  // ... existing pre() logic ...

  // Pre-scan definitions to detect name collisions
  const nameCounts = new Map<string, number>()
  const nodesByName = new Map<string, SemanticNode[]>()
  for (const node of this.doc.definitions) {
    if (node.__typeId != null) {
      const name = node.id!
      const count = (nameCounts.get(name) || 0) + 1
      nameCounts.set(name, count)
      if (!nodesByName.has(name)) nodesByName.set(name, [])
      nodesByName.get(name)!.push(node)
    }
  }

  // Assign string IDs: "Cat" if unique, "Cat__1"/"Cat__2" if collision
  for (const [name, nodes] of nodesByName) {
    if (nodes.length === 1) {
      this.typeIds.set(nodes[0], name)
    } else {
      for (let i = 0; i < nodes.length; i++) {
        this.typeIds.set(nodes[i], `${name}__${i + 1}`)
      }
    }
  }
}
```

**In `renderClassStatics()`** — emit `id` alongside the existing statics:

```js
// Unique name — clean ID:
class Cat {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = 'Cat'
}

// Name collision (two "Helper" types from different files) — suffixed:
class Helper {
  static id = 'Helper__1'
}
class Helper$1 {
  static id = 'Helper__2'
}
```

The `renderClassStatics(node)` method looks up `this.typeIds.get(node)` to get the pre-computed string ID.

**No change to the `post()` builder calls** — the builder does NOT emit `.id(...)`. The static field handles it.

**For union/intersection items via `refTo`**: `refTo(Cat)` reads `Cat.id` (from the static field, always available) and copies it to the new annotated type wrapper.

### 4. JSON Schema: `$defs` and `$ref`

**File**: `packages/typescript/src/json-schema.ts`

#### 4a. Schema Builder Context

`buildJsonSchema` needs to collect named types into a `$defs` map during recursion:

```ts
export function buildJsonSchema(type: TAtscriptAnnotatedType): TJsonSchema {
  const defs: Record<string, TJsonSchema> = {}

  const build = (def: TAtscriptAnnotatedType): TJsonSchema => {
    // If this type has a id and is an object, extract to $defs
    if (def.id && def.type.kind === 'object') {
      const name = def.id
      if (!defs[name]) {
        // Placeholder to prevent infinite recursion on circular refs
        defs[name] = {}
        defs[name] = buildObjectSchema(def) // same logic as current object() handler
      }
      return { $ref: `#/$defs/${name}` }
    }

    return forAnnotatedType(def, {
      // ... existing handlers, but object() also checks id ...
    })
  }

  const schema = build(type)

  // Attach $defs if any were collected
  if (Object.keys(defs).length > 0) {
    return { ...schema, $defs: defs }
  }
  return schema
}
```

**Key behaviors**:

- Only **object types with a `id`** are extracted to `$defs`. Primitives, unions, arrays stay inline.
- If the same `id` appears more than once (shared via `refTo`), only one entry is added to `$defs` — subsequent encounters emit `$ref` only.
- The root type is NOT extracted (it's the schema itself). Only nested refs are extracted.

#### 4b. Discriminated Union Output

With named types, the discriminated union output becomes:

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

#### 4c. `fromJsonSchema` Update

Extend `fromJsonSchema` to handle `$defs` and `$ref`:

```ts
export function fromJsonSchema(schema: TJsonSchema): TAtscriptAnnotatedType {
  // Pre-resolve $defs into a lookup map
  const defs = schema.$defs || schema.definitions || {}
  const resolved = new Map<string, TAtscriptAnnotatedType>()

  const convert = (s: TJsonSchema): TAtscriptAnnotatedType => {
    if (s.$ref) {
      const refName = s.$ref.replace(/^#\/(\$defs|definitions)\//, '')
      if (resolved.has(refName)) {
        return resolved.get(refName)!
      }
      if (defs[refName]) {
        const type = convert(defs[refName])
        resolved.set(refName, type)
        return type
      }
      throw new Error(`Unresolvable $ref: ${s.$ref}`)
    }
    // ... rest of existing convert logic
  }

  return convert(schema)
}
```

### 5. Multi-Schema Merging (Swagger/OpenAPI Use Case)

Add a new utility for combining multiple schemas. It accepts annotated types directly — extracting `id` from each to use as the schema name:

```ts
export function mergeJsonSchemas(types: TAtscriptAnnotatedType[]): {
  schemas: Record<string, TJsonSchema>
  $defs: Record<string, TJsonSchema>
} {
  const mergedDefs: Record<string, TJsonSchema> = {}
  const schemas: Record<string, TJsonSchema> = {}

  for (const type of types) {
    const name = type.id
    if (!name) {
      throw new Error('mergeJsonSchemas: all types must have an id')
    }
    const schema = buildJsonSchema(type)

    // Hoist $defs from each schema into shared pool
    if (schema.$defs) {
      for (const [defName, defSchema] of Object.entries(schema.$defs)) {
        // Same ID → same type → deduplicate
        if (!mergedDefs[defName]) {
          mergedDefs[defName] = defSchema
        }
      }
      // Strip $defs from individual schema (they live in the shared pool)
      const { $defs, ...rest } = schema
      schemas[name] = rest
    } else {
      schemas[name] = schema
    }
  }

  return { schemas, $defs: mergedDefs }
}
```

This enables building OpenAPI specs:

```ts
import { mergeJsonSchemas } from '@atscript/typescript/utils'
import { CatOrDog } from './pets.as'
import { Order } from './orders.as'

const merged = mergeJsonSchemas([CatOrDog, Order])

// merged.schemas.CatOrDog — uses $ref pointers into $defs
// merged.schemas.Order    — uses $ref pointers into $defs
// merged.$defs: { Cat, Dog, Product } — deduplicated across schemas
```

### 6. Serialization Update

**File**: `packages/typescript/src/serialize.ts`

Add `id` to serialized output:

```ts
// In TSerializedAnnotatedType / TSerializedAnnotatedTypeInner
id?: string

// In serialize logic — include id if present
if (type.id) {
  result.id = type.id
}

// In deserialize logic — restore id
if (data.id) {
  annotatedType.id = data.id
}
```

---

## File Change Summary

| File                                              | Change                                                                                                                                                         |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/parser/nodes/semantic-node.ts` | Add `__typeId?: number` field                                                                                                                                  |
| `packages/core/src/document.ts`                   | Assign auto-incrementing `__typeId` in `registerDefinition()`                                                                                                  |
| `packages/typescript/src/annotated-type.ts`       | Add `id?: string` to `TAtscriptAnnotatedType`, add `id()` method to builder handle (programmatic use), carry `id` through `refTo()`                            |
| `packages/typescript/src/codegen/js-renderer.ts`  | Emit `static id = "{Name}"` (or `"{Name}__{N}"` on collision) in `renderClassStatics()` for interface/type/annotate nodes                                      |
| `packages/typescript/src/json-schema.ts`          | Collect `$defs`, emit `$ref` for named object types, update discriminated union to use `$ref`-based mapping, update `fromJsonSchema` to resolve `$ref`/`$defs` |
| `packages/typescript/src/serialize.ts`            | Include `id` in serialized/deserialized output                                                                                                                 |
| `packages/typescript/src/json-schema.spec.ts`     | Tests for `$defs`/`$ref` generation, discriminated union with refs, round-trip with `$defs`, multi-schema merging                                              |

## ID Format

```
{TypeName}            — when name is unique across all loaded .as files
{TypeName}__{counter} — when multiple types share the same name
```

- `TypeName` — the identifier from the `.as` file (e.g., `Cat`, `Dog`, `PlaygroundForm`)
- `__` — double underscore separator (only present on collision)
- `counter` — 1-based index among same-named types

Examples: `Cat`, `Dog`, `CatOrDog`, `Address` (typical — no collisions), `Helper__1`, `Helper__2` (collision)

The double-underscore is unlikely to collide with user-chosen names and is easy to split programmatically. Most projects will never see suffixed IDs — they only appear when two `.as` files define types with the same name.

## Backwards Compatibility

- Types **without** `id` (e.g., inline objects, programmatically built types via `defineAnnotatedType()`) continue to produce inline schemas — no `$ref`
- Existing `buildJsonSchema` output changes only for types that now carry `id` (i.e., generated from `.as` files). Hand-built types in tests are unaffected unless `.id()` is explicitly called
- `fromJsonSchema` gains `$ref` resolution but the existing "throw on `$ref`" behavior is replaced with actual resolution (breaking change — but the old behavior was a hard error, so upgrading to resolution is strictly better)
- Serialization format gains an optional field — old serialized data without `id` still deserializes correctly

## Example End-to-End

**Input** (`pets.as`):

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

**Generated JS** (simplified):

```js
// Class declarations — id is a static field, available immediately
// No name collisions, so IDs are clean (no __N suffix)
class Cat {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = 'Cat'
}

class Dog {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = 'Dog'
}

export class CatOrDog {
  static __is_atscript_annotated_type = true
  static type = {}
  static metadata = new Map()
  static id = 'CatOrDog'
}

// Builder calls — order doesn't matter for id because it's already on the class
$('object', Cat)
  .prop('petType', $().designType('string').value('cat').$type)
  .prop('name', $().designType('string').tags('string').$type)

$('object', Dog)
  .prop('petType', $().designType('string').value('dog').$type)
  .prop('breed', $().designType('string').tags('string').$type)

$('union', CatOrDog)
  .item($().refTo(Cat).$type) // Cat.id = "Cat" — already available
  .item($().refTo(Dog).$type) // Dog.id = "Dog" — already available
```

**`buildJsonSchema(CatOrDog)`** output:

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

**Merging for Swagger**:

```ts
const merged = mergeJsonSchemas([CatOrDog, Order])
// merged.schemas.CatOrDog — oneOf with $ref pointers
// merged.schemas.Order    — object with $ref for Product
// merged.$defs: { Cat, Dog, Product } — deduplicated across schemas
```

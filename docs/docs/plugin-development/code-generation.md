# Building a Code Generator

Code generation is the most powerful feature of the Atscript plugin system. A code generator reads parsed `.as` documents and produces output files — type declarations, runtime modules, data classes, JSON schemas, or any format you need.

This page focuses on **what data is available** from the Atscript AST and **how to discover and traverse it** to produce your output.

## The render() Hook

Code generation happens in the `render()` hook. It receives a parsed `AtscriptDoc` and a format string, and returns an array of output files:

```typescript
render(doc: AtscriptDoc, format: string): TPluginOutput[] | undefined {
  if (format === 'myformat') {
    return [{
      fileName: `${doc.name}.ext`,
      content: generateOutput(doc),
    }]
  }
}
```

`TPluginOutput` is simply `{ fileName: string, content: string }`. The `fileName` is relative — the build system resolves it to an absolute path based on `outDir` config.

The `format` string is a plain string with no registry. Your plugin checks it with `if` statements and returns nothing for formats it doesn't handle. Multiple plugins can produce output for the same format — their outputs are concatenated.

## Iterating a Document

`doc.nodes` is the top-level node list of a parsed `.as` file. It contains all declarations in source order:

```typescript
for (const node of doc.nodes) {
  switch (node.entity) {
    case 'interface': // SemanticInterfaceNode — a named structure with properties
      break
    case 'type': // SemanticTypeNode — a type alias (type Foo = ...)
      break
    case 'import': // SemanticImportNode — an import statement
      break
    case 'annotate': // SemanticAnnotateNode — an annotate block (ad-hoc annotations)
      break
  }
}
```

These are the four top-level entities your code generator needs to handle. Each has different data to extract.

## Interfaces and Their Properties

An `SemanticInterfaceNode` represents a named interface with properties. This is the most common entity you'll generate output for.

```typescript
function processInterface(node: SemanticInterfaceNode, doc: AtscriptDoc) {
  const name = node.id! // interface name
  const isExported = !!node.token('export') // was it exported?

  for (const [propName, prop] of node.props) {
    const isOptional = !!prop.token('optional') // field marked with ?
    const definition = prop.getDefinition() // the field's type definition
    // definition is a SemanticNode — could be ref, primitive, structure, group, array, const
  }
}
```

### What `getDefinition()` Returns

Every node with a type body has `getDefinition()`. The returned `SemanticNode` varies:

- **For an interface** — returns the `SemanticStructureNode` (the body containing props)
- **For a type alias** — returns the aliased type (ref, group, primitive, etc.)
- **For a property** — returns the field's type definition

## Resolving Type References

When a definition is a `ref`, it points to another named type. You need to resolve it to understand the actual type:

```typescript
import { isRef, isPrimitive } from '@atscript/core/nodes'

const def = prop.getDefinition()

if (isRef(def)) {
  const resolved = doc.unwindType(def.id!, def.chain)
  if (resolved?.def) {
    if (isPrimitive(resolved.def)) {
      // Terminal: it's a primitive like string, number, string.email, etc.
      resolved.def.type // underlying scalar: 'string', 'number', 'boolean', etc.
      resolved.def.config // full TPrimitiveConfig with expect, tags, documentation
    } else {
      // It references another interface/type — use the resolved name
      resolved.name
    }
  }
}
```

`doc.unwindType(name, chain?)` recursively follows type aliases until it reaches either a primitive or a non-alias declaration. The optional `chain` handles property-access chains like `SomeType["nested"]["field"]`.

## Handling All Definition Kinds

Use type guards to dispatch on definition kind. This is the core of any code generator — mapping Atscript's type system to your target language:

```typescript
import {
  isRef,
  isPrimitive,
  isStructure,
  isGroup,
  isArray,
  isConst,
  isInterface,
} from '@atscript/core/nodes'

function resolveType(def: SemanticNode | undefined, doc: AtscriptDoc): string {
  if (!def) return 'unknown'

  if (isPrimitive(def)) {
    // A scalar primitive — map def.type to your target language
    // def.type is 'string' | 'number' | 'boolean' | 'void' | 'null' | 'phantom'
    // def.config.tags provides semantic tags for finer discrimination
    return mapToTargetLanguage(def.type)
  }

  if (isRef(def)) {
    // A reference to another type — resolve it
    const resolved = doc.unwindType(def.id!, def.chain)
    if (resolved?.def && isPrimitive(resolved.def)) {
      return mapToTargetLanguage(resolved.def.type)
    }
    // Non-primitive reference — use the type name directly
    return def.id!
  }

  if (isStructure(def)) {
    // An inline object literal — has its own props map
    // Iterate def like an interface (it has a similar structure)
    return handleInlineObject(def)
  }

  if (isGroup(def)) {
    // A union (|) or intersection (&) of types
    const items = def.unwrap() // array of child SemanticNodes
    const op = def.op // '|' or '&'
    // Also check def.entity === 'tuple' for tuple types [A, B, C]
    return items.map(item => resolveType(item, doc)).join(op)
  }

  if (isArray(def)) {
    // An array type — element type is def.getDefinition()
    const elementDef = def.getDefinition()
    return `${resolveType(elementDef, doc)}[]`
  }

  if (isConst(def)) {
    // A literal constant value: "hello", 42, true
    return JSON.stringify(def.value)
  }

  return 'unknown'
}
```

### Phantom Types

When resolving types, check for `def.type === 'phantom'` on primitives. Phantom properties are non-data fields — they exist for runtime discovery (UI hints, layout elements) but should not appear in the generated data type. See [Custom Primitives — Phantom Primitives](/plugin-development/primitives-type-tags#phantom-primitives) for the full design intent.

### Union vs Intersection vs Tuple

`SemanticGroupNode` represents all three. Distinguish them:

```typescript
if (isGroup(def)) {
  if (def.entity === 'tuple') {
    // Fixed-length typed array: [string, number]
    const items = def.unwrap()
  } else if (def.op === '|') {
    // Union: string | number
    const items = def.unwrap()
  } else if (def.op === '&') {
    // Intersection: TypeA & TypeB
    const items = def.unwrap()
  }
}
```

## Reading Annotations

Annotations carry metadata that code generators can use to produce richer output — labels, validation rules, indexes, API hints, or any custom metadata.

### Direct Annotations

`node.annotations` gives you only annotations written directly on this node:

```typescript
for (const ann of prop.annotations) {
  ann.name // 'label', 'expect.minLength', 'db.index.unique', etc.
  ann.args // array of Token objects
  ann.args[0]?.text // first argument's value as string
}
```

### Merged Annotations (With Inheritance)

`doc.evalAnnotationsForNode(node)` returns the complete annotation set including annotations inherited through type references and annotate blocks:

```typescript
const merged = doc.evalAnnotationsForNode(prop)
// Map<string, TAnnotationTokens[]>

for (const [annotationName, tokensList] of merged) {
  for (const tokens of tokensList) {
    const value = tokens.args[0]?.text
  }
}
```

### When to Use Which

- **`node.annotations`** — Direct annotations only. Use when you want only what the author explicitly wrote on this specific node.
- **`doc.evalAnnotationsForNode(node)`** — Merged with inherited annotations from type references. Use when you want the complete picture.

::: tip Avoiding Duplicate Annotations
When a property is a simple reference to another type, that referenced type already carries its own annotations. If your code generator emits annotation data for both the reference and the target, you may get duplicates. Consider using `node.annotations` (direct only) for simple refs and `evalAnnotationsForNode` for everything else.
:::

## Import Handling

Import nodes represent dependencies between `.as` files. During code generation you typically need to:

1. Determine which imported identifiers are actually used
2. Emit corresponding import statements in your target language

`doc.getUnusedTokens()` returns identifiers that were imported but never referenced:

```typescript
const unused = new Set(doc.getUnusedTokens().map(t => t.text))

function processImport(node: SemanticImportNode) {
  const usedRefs = []
  const def = node.getDefinition()

  if (isGroup(def)) {
    for (const child of def.unwrap()) {
      if (isRef(child) && !unused.has(child.id!)) {
        usedRefs.push(child.id!)
      }
    }
  } else if (isRef(def) && !unused.has(def.id!)) {
    usedRefs.push(def.id!)
  }

  if (usedRefs.length > 0) {
    const fromPath = node.token('path')!.text
    // Emit an import in your target language using usedRefs and fromPath
  }
}
```

## Annotate Blocks

`SemanticAnnotateNode` represents `annotate Target { ... }` blocks. These come in two forms:

- **Non-mutating** (`annotate Target as Alias { ... }`): Creates a new type alias with additional annotations. Your code generator should emit a new declaration for `Alias`.
- **Mutating** (`annotate Target { ... }`): Adds annotations to an existing type without creating a new name. These annotations are already reflected in `evalAnnotationsForNode` when you process the target — you typically don't need to emit separate output for these.

```typescript
if (isAnnotate(node)) {
  const targetName = node.token('target')?.text
  const aliasName = node.id // undefined for mutating
  const isMutating = !aliasName

  if (!isMutating) {
    // Non-mutating: emit a new type that extends/aliases the target
    // with the additional annotations from this block
  }
  // Mutating annotate blocks don't need separate output —
  // their annotations are merged into the target automatically
}
```

## The buildEnd() Hook

For output that spans all documents — global registries, index files, manifests — use `buildEnd()`:

```typescript
createAtscriptPlugin({
  name: 'my-plugin',

  async buildEnd(output, format, repo) {
    if (format !== 'myformat') return

    // Access repo for cross-document queries
    const usedAnnotations = await repo.getUsedAnnotations()
    const tags = await repo.getPrimitivesTags()

    // Add a new file to the output
    output.push({
      content: generateGlobalFile(usedAnnotations, tags),
      fileName: 'registry.ext',
      source: '',
      target: '/absolute/path/to/output/registry.ext',
    })
  },
})
```

### Typical Use Cases

Common reasons to use `buildEnd`:

- **Global type registry** — collect all annotation types or primitive tags used across the project into a single declaration file
- **Index / barrel file** — generate an entry point that re-exports all generated modules
- **Manifest / schema file** — produce a JSON manifest listing all interfaces, their annotations, and relationships

## Multi-Format Support

A single plugin can handle multiple output formats. A common pattern is to have one format for static type declarations and another for runtime metadata or executable code:

```typescript
import { DEFAULT_FORMAT } from '@atscript/core'

render(doc, format) {
  if (format === 'types' || format === DEFAULT_FORMAT) {
    return [{ fileName: `${doc.name}.types.out`, content: generateTypes(doc) }]
  }
  if (format === 'runtime') {
    return [{ fileName: `${doc.name}.runtime.out`, content: generateRuntime(doc) }]
  }
}
```

`DEFAULT_FORMAT` is a well-known constant triggered by the VSCode extension on save and by the CLI when no `-f` flag is given. Handle it for your plugin's primary output — typically type declarations. See [VSCode & Build Integration](/plugin-development/tooling-integration#the-default-format-constant) for the full details.

Users trigger specific formats via the CLI:

```bash
npx asc              # all plugins' default output (DEFAULT_FORMAT)
npx asc -f types     # only the 'types' format
npx asc -f runtime   # only the 'runtime' format
```

## Two-Pass Rendering

When generated output contains declarations that reference each other, you may need a two-pass approach:

**Pass 1**: Iterate `doc.nodes` and emit declaration shells — names and basic structure, without populating cross-references.

**Pass 2**: Go back over the collected declarations and fill in metadata, annotations, and references to other declarations that are now guaranteed to exist.

This pattern arises in any target language where a symbol must be declared before it can be referenced. By deferring metadata population to a second pass, all declarations are available for cross-referencing.

## Next Steps

- [Plugin Hooks Reference](/plugin-development/plugin-hooks) — complete reference for all hooks
- [Validation Specification](/plugin-development/validation-spec) — implement data validation against your generated types
- [Testing Plugins](/plugin-development/testing-plugins) — test your code generator with snapshots
- [VSCode & Build Integration](/plugin-development/tooling-integration) — integrate with the build pipeline and editor

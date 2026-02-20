# Plugin Architecture

Before building a plugin, it helps to understand how Atscript processes `.as` files and where plugins participate in the pipeline. This page covers the processing flow, the AST structure you'll work with, and the key APIs available to plugins.

## The Processing Pipeline

Every `.as` file passes through these stages:

```
.as source
  → Tokenizer (lexical analysis)
    → Parser pipes (syntax analysis)
      → SemanticNode tree (resolved types)
        → AtscriptDoc (queryable document)
          → Plugin hooks (config, onDocument, render, buildEnd)
            → Output files (.d.ts, .js, .py, etc.)
```

Plugins don't modify the parser. Instead, they hook into the pipeline at specific points — contributing primitives and annotations before parsing, post-processing after parsing, and generating output files at the end.

## Key Classes

| Class | Package | Role |
| --- | --- | --- |
| `AtscriptRepo` | `@atscript/core` | Manages a collection of documents. Resolves config, loads plugins, opens documents, tracks dependencies. |
| `AtscriptDoc` | `@atscript/core` | A single parsed `.as` file. Contains the node tree, annotations, imports, and provides query methods. |
| `BuildRepo` | `@atscript/core` | Build orchestrator. Iterates documents, calls `render()` per format, resolves output paths, writes files. |
| `PluginManager` | `@atscript/core` | Executes plugin hooks in order. Merges config, converts primitives to semantic nodes. |
| `SemanticNode` | `@atscript/core` | Base class for all AST nodes. Subclasses represent interfaces, types, props, refs, etc. |

## AST Node Types

The parsed AST is a tree of `SemanticNode` subclasses. Each node has an `entity` string that identifies its kind:

| Entity | Node Class | Description |
| --- | --- | --- |
| `'interface'` | `SemanticInterfaceNode` | An interface declaration with named properties |
| `'type'` | `SemanticTypeNode` | A type alias (`type Foo = ...`) |
| `'prop'` | `SemanticPropNode` | A property within an interface |
| `'ref'` | `SemanticRefNode` | A reference to another type by name |
| `'structure'` | `SemanticStructureNode` | An inline object structure (the body of an interface) |
| `'group'` | `SemanticGroupNode` | A union (`\|`), intersection (`&`), or tuple |
| `'array'` | `SemanticArrayNode` | An array type |
| `'const'` | `SemanticConstNode` | A literal value (`"hello"`, `42`) |
| `'primitive'` | `SemanticPrimitiveNode` | A built-in or plugin-defined primitive type |
| `'import'` | `SemanticImportNode` | An import statement |
| `'annotate'` | `SemanticAnnotateNode` | An `annotate` block (ad-hoc annotations) |

### Type Guards

The core exports type guard functions for narrowing nodes:

```typescript
import {
  isInterface,
  isType,
  isProp,
  isRef,
  isStructure,
  isGroup,
  isArray,
  isConst,
  isPrimitive,
  isImport,
  isAnnotate,
} from '@atscript/core/nodes'

if (isInterface(node)) {
  // node is SemanticInterfaceNode
  for (const [name, prop] of node.props) {
    // prop is SemanticPropNode
  }
}

if (isRef(node)) {
  // node is SemanticRefNode
  console.log(node.id)    // referenced type name
  console.log(node.chain) // property access chain (e.g., ["address", "street"])
}
```

### Reading Node Properties

Every `SemanticNode` provides:

```typescript
node.entity          // 'interface' | 'type' | 'ref' | etc.
node.id              // Name identifier (e.g., 'User', 'string')
node.token('export') // Access specific tokens — returns Token | undefined
node.getDefinition() // Get the node's body/definition (e.g., the structure of an interface)
node.annotations     // Raw annotation tokens on this node
```

## Plugin Lifecycle

Hooks fire in this order during a build:

### 1. `config()` — At Startup

Called once when the `PluginManager` initializes. Each plugin returns primitives and annotations to merge into the shared config. Results are merged using `defu` (deep defaults — the first plugin to define a key wins).

```
Default config (built-in primitives + @expect.* + @meta.* + @emit.*)
  ← Plugin A config() merged
    ← Plugin B config() merged
      = Final merged config
```

### 2. `resolve(id)` — When Opening a Document

Called for each document ID. Plugins can remap paths (e.g., virtual modules, aliases). All plugins are called; the last non-`undefined` return wins.

### 3. `load(id)` — When Loading Source Content

Called to provide file content. The first plugin to return a string wins. If no plugin provides content, the file is read from disk.

### 4. `onDocument(doc)` — After Parsing

Called after a document is parsed and its AST is built. All plugins receive the call in sequence. Use this to inject virtual properties, run custom validation, or transform the AST.

### 5. `render(doc, format)` — During Code Generation

Called once per document per format. Each plugin checks the format string and returns output files (or nothing). All plugins contribute — their outputs are concatenated.

### 6. `buildEnd(output, format, repo)` — After All Documents

Called once after all documents have been rendered. Use this for cross-document aggregation like generating global type declarations or index files.

## Config Merging

The `PluginManager` merges configs using `defu` — a deep-defaults utility where the **first defined value wins**. This means:

- Built-in defaults (primitives like `string`, `number`, `boolean` and annotations like `@expect.*`, `@meta.*`) are applied last
- Plugin `config()` return values fill in before defaults
- If two plugins both define the same primitive or annotation, the one listed first in the `plugins` array wins

```typescript
// Plugin A returns: { primitives: { foo: { type: 'string' } } }
// Plugin B returns: { primitives: { foo: { type: 'number' } } }
// Result: foo has type: 'string' (Plugin A wins because it's first)
```

This means plugins can safely add new primitives and annotations without worrying about conflicting with each other — as long as they use unique namespace prefixes.

## Document API

The `AtscriptDoc` is the primary object you'll work with in `onDocument()` and `render()` hooks. Key methods:

### `doc.nodes`

The top-level node list. Iterate this to walk all interfaces, types, imports, and annotate blocks:

```typescript
for (const node of doc.nodes) {
  if (isInterface(node)) {
    // Process interface
  } else if (isType(node)) {
    // Process type alias
  }
}
```

### `doc.unwindType(name, chain?)`

Resolves a type reference to its terminal definition. Follows type aliases and chains:

```typescript
// Given: type Email = string.email
// doc.unwindType('Email') → resolves to the string.email primitive definition

const resolved = doc.unwindType(ref.id, ref.chain)
if (resolved?.def) {
  // resolved.def is the terminal SemanticNode
  // resolved.name is the resolved name
}
```

### `doc.evalAnnotationsForNode(node)`

Returns the complete set of annotations for a node, including inherited annotations from parent types:

```typescript
const annotations = doc.evalAnnotationsForNode(propNode)
// Returns a map of annotation name → token values
// Includes annotations inherited through type references
```

### `doc.getUnusedTokens()`

Returns identifiers that are imported but never referenced — useful for import filtering in code generation.

### `doc.getDeclarationOwnerNode(name)`

Looks up a top-level declaration by name. Returns the `SemanticNode` that owns that identifier, or `undefined` if not found.

## Next Steps

- [Custom Primitives](/plugin-development/primitives-type-tags) — add semantic types to your plugin
- [Custom Annotations](/plugin-development/annotation-system) — define annotation specs with validation

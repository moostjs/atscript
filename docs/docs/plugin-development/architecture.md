# Plugin Architecture

This page is a deeper mental model for plugin authors. If you are building your first plugin, you do not need to absorb every class and node type before you start. Most first plugins only need:

- `config()` to register primitives or annotations
- `render()` to generate one file per document
- `buildEnd()` only if you need project-wide output

Come back to this page when you need to inspect documents more deeply or understand how the pipeline fits together.

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

## What Most Plugin Authors Need First

For a practical first plugin, this is the minimum mental model:

1. `config()` runs once and adds primitives or annotations.
2. Atscript parses `.as` files into an `AtscriptDoc`.
3. `render(doc, format)` receives that parsed document and can emit files.
4. `buildEnd(output, format, repo)` is optional and only matters when output depends on multiple files.

That is enough to build annotation plugins, primitive plugins, and many generators without going deeper into parser internals.

## Key Classes You Interact With

Plugin authors mainly work with two classes from `@atscript/core`:

| Class          | Where you see it                          | Role                                                                                                  |
| -------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `AtscriptDoc`  | `onDocument(doc)`, `render(doc, format)`  | A single parsed `.as` file. Contains the node tree, annotations, imports, and provides query methods. |
| `SemanticNode` | Returned from doc queries (`doc.nodes`, …) | Base class for all AST nodes. Subclasses represent interfaces, types, props, refs, etc.               |

The `buildEnd(output, format, repo)` hook also receives an `AtscriptRepo` — useful for cross-document queries (`repo.getUsedAnnotations()`, `repo.getPrimitivesTags()`) — but you do not construct or own it directly.

## AST Node Types

The parsed AST is a tree of `SemanticNode` subclasses. Each node has an `entity` string that identifies its kind:

| Entity        | Node Class              | Description                                           |
| ------------- | ----------------------- | ----------------------------------------------------- |
| `'interface'` | `SemanticInterfaceNode` | An interface declaration with named properties        |
| `'type'`      | `SemanticTypeNode`      | A type alias (`type Foo = ...`)                       |
| `'prop'`      | `SemanticPropNode`      | A property within an interface                        |
| `'ref'`       | `SemanticRefNode`       | A reference to another type by name                   |
| `'structure'` | `SemanticStructureNode` | An inline object structure (the body of an interface) |
| `'group'`     | `SemanticGroup`         | A union (`\|`) or intersection (`&`) of nodes         |
| `'tuple'`     | `SemanticTupleNode`     | A tuple type (`[A, B, C]`)                            |
| `'array'`     | `SemanticArrayNode`     | An array type                                         |
| `'const'`     | `SemanticConstNode`     | A literal value (`"hello"`, `42`)                     |
| `'primitive'` | `SemanticPrimitiveNode` | A built-in or plugin-defined primitive type           |
| `'import'`    | `SemanticImportNode`    | An import statement                                   |
| `'annotate'`  | `SemanticAnnotateNode`  | An `annotate` block (ad-hoc annotations)              |

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
} from '@atscript/core'

if (isInterface(node)) {
  // node is SemanticInterfaceNode
  for (const [name, prop] of node.props) {
    // prop is SemanticPropNode
  }
}

if (isRef(node)) {
  // node is SemanticRefNode
  console.log(node.id) // referenced type name
  console.log(node.chain.map(t => t.text)) // property access chain (e.g., ["address", "street"])
}
```

### Reading Node Properties

Every `SemanticNode` provides:

```typescript
node.entity // 'interface' | 'type' | 'ref' | etc.
node.id // Name identifier (e.g., 'User', 'string')
node.token('export') // Access specific tokens — returns Token | undefined
node.getDefinition() // Get the node's body/definition (e.g., the structure of an interface)
node.annotations // Raw annotation tokens on this node
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
// Returns: TAnnotationTokens[] | undefined
// Each entry has { name, token, args } — args is Token[]
for (const ann of annotations || []) {
  ann.name        // e.g. 'meta.label'
  ann.args[0]?.text // first argument as raw text
}
```

### `doc.getUnusedTokens()`

Returns identifiers that are imported but never referenced — useful for import filtering in code generation.

### `doc.getDeclarationOwnerNode(name)`

Looks up a top-level declaration by name. Returns `{ doc, node?, token? }` — the document that owns the identifier, the owning semantic node (if any), and the defining token — or `undefined` if not found. Follows imports across files.

## Next Steps

- [Custom Primitives](/plugin-development/primitives-type-tags) — add semantic types to your plugin
- [Custom Annotations](/plugin-development/annotation-system) — define annotation specs with validation

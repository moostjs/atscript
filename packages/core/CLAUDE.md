# @atscript/core

Core library for Atscript: parses `.as` files into a semantic AST, tracks cross-file dependencies, produces diagnostics (syntax and logical errors), and exposes utilities (annotation merging, type unwinding) consumed by LSPs, build tools, and language plugins.

## Key source files

| File                                 | Role                                                                                                                                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/document.ts`                    | `AtscriptDoc` -- central class representing a single `.as` file; owns parsing, token/block indexes, imports, exports, diagnostics, type resolution (`unwindType`), and annotation merging |
| `src/repo.ts`                        | `AtscriptRepo` -- document repository; caches open documents, resolves configs per-file, manages cross-file import checking and dependency wiring                                         |
| `src/build.ts`                       | `build()` entry point and `BuildRepo` -- glob entries, open docs, run diagnostics, call plugin `render`/`buildEnd`, write output files                                                    |
| `src/plugin/types.ts`                | `TAtscriptPlugin` interface -- the plugin contract (hooks: `config`, `resolve`, `load`, `onDocumnet`, `render`, `buildEnd`)                                                               |
| `src/plugin/plugin-manager.ts`       | `PluginManager` -- iterates plugins for each lifecycle hook; builds merged config; creates `TAtscriptDocConfig` with resolved primitives and annotations                                  |
| `src/config/types.ts`                | `TAtscriptConfig`, `TAnnotationsTree` -- configuration shape for `atscript.config.*` files                                                                                                |
| `src/config/load-config.ts`          | `resolveConfigFile`, `loadConfig` -- walks up directories to find `atscript.config.*`, bundles TS configs via rolldown, dynamic-imports JS configs                                        |
| `src/config/define-config.ts`        | `defineConfig()` -- typed helper for authoring config files                                                                                                                               |
| `src/annotations/annotation-spec.ts` | `AnnotationSpec` -- defines annotation validation rules (argument types, node constraints, multiplicity, merge strategy)                                                                  |
| `src/parser/token.ts`                | `Token` -- wraps a lexical token with semantic flags (`isDefinition`, `isReference`, `imported`, `exported`, `isChain`, `parentNode`)                                                     |
| `src/parser/nodes/semantic-node.ts`  | `SemanticNode` -- base AST node; stores tokens by semantic role, definition child, annotations; `registerAtDocument` hook                                                                 |
| `src/parser/nodes/index.ts`          | Re-exports all node classes + type-guard functions (`isRef`, `isType`, `isInterface`, `isProp`, `isGroup`, `isStructure`, `isPrimitive`, `isAnnotate`, ...)                               |
| `src/parser/pipes/pipes.ts`          | Pipe definitions that drive parsing: `type`, `interfaceType`, `importPipe`, `annotatePipe`, `props`, `tuple`                                                                              |
| `src/parser/pipes/index.ts`          | `parseAtscript()` convenience function -- tokenize + run pipes, returns `{ nodes, messages }`                                                                                             |
| `src/tokenizer/index.ts`             | `tokenize()` -- runs `@prostojs/parser` on raw source text, returns lexical tokens                                                                                                        |
| `src/defaults/primitives.ts`         | Built-in primitive types: `string`, `number`, `boolean`, `null`, `void`, `never`, `undefined` and their extensions (`string.email`, `number.int`, etc.)                                   |
| `src/defaults/expect-annotations.ts` | Built-in `@expect.*` annotation specs (min, max, pattern, minLength, maxLength, int)                                                                                                      |
| `src/defaults/meta-annotations.ts`   | Built-in `@meta.*` annotation specs                                                                                                                                                       |
| `src/default-atscript-config.ts`     | `getDefaultAtscriptConfig()` -- assembles default primitives + annotations                                                                                                                |
| `src/token-index/tokens-index.ts`    | `TokensIndex` -- spatial index for tokens by line/character position (used for LSP go-to-definition, hover)                                                                               |
| `src/token-index/blocks-index.ts`    | `BlocksIndex` -- spatial index for block tokens (structure, import, annotate blocks)                                                                                                      |
| `src/parser/id-registry.ts`          | `IdRegistry` -- tracks identifier definitions, detects duplicates, checks `isDefined`                                                                                                     |
| `src/parser/iterator.ts`             | `NodeIterator` -- iterates lexical tokens for pipe-based parsing                                                                                                                          |

## Public API surface

Main exports from `@atscript/core` (via `src/index.ts`):

- **Classes**: `AtscriptDoc`, `AtscriptRepo`, `BuildRepo`, `PluginManager`, `AnnotationSpec`, `Token`
- **Semantic node classes**: `SemanticNode`, `SemanticInterfaceNode`, `SemanticTypeNode`, `SemanticRefNode`, `SemanticPropNode`, `SemanticStructureNode`, `SemanticGroup`, `SemanticArrayNode`, `SemanticTupleNode`, `SemanticConstNode`, `SemanticImportNode`, `SemanticPrimitiveNode`, `SemanticAnnotateNode`
- **Type guards**: `isInterface`, `isType`, `isRef`, `isProp`, `isStructure`, `isGroup`, `isTuple`, `isArray`, `isConst`, `isImport`, `isPrimitive`, `isAnnotate`
- **Config**: `defineConfig`, `loadConfig`, `resolveConfigFile`, `TAtscriptConfig`, `TAnnotationsTree`
- **Plugin**: `TAtscriptPlugin`, `createAtscriptPlugin`, `TPluginOutput`, `TAtscriptRenderFormat`
- **Build**: `build()`, `TOutput`
- **Utilities**: `resolveAtscriptFromPath`, `getRelPath`
- **Types**: `TMessages`, `TNodeEntity`, `TAnnotationTokens`, `TPrimitiveConfig`

## Plugin system

Plugins implement the `TAtscriptPlugin` interface with these hooks (all optional except `name`):

| Hook                             | When called                                     | Purpose                                                                                                |
| -------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `config(config)`                 | During `PluginManager.config()` init            | Extend/modify the merged config (add primitives, annotations, etc.); return value is merged via `defu` |
| `resolve(id)`                    | `AtscriptRepo._openDocument`                    | Resolve a document ID to a final path (virtual modules, aliases)                                       |
| `load(id)`                       | `AtscriptRepo._openDocument`                    | Provide file content for a document ID (virtual file systems)                                          |
| `onDocumnet(doc)`                | After a doc is parsed and registered            | Post-parse processing (add virtual props, validate, etc.)                                              |
| `render(doc, format)`            | `AtscriptDoc.render()` / `BuildRepo.generate()` | Generate output files (`.d.ts`, `.js`, etc.) from a parsed document                                    |
| `buildEnd(output, format, repo)` | After all docs are rendered                     | Post-build hook (aggregate outputs, generate index files)                                              |

## AST node types

`TNodeEntity` values and their semantic node classes:

| Entity      | Class                   | Description                                                            |
| ----------- | ----------------------- | ---------------------------------------------------------------------- | --------------------------------------- |
| `interface` | `SemanticInterfaceNode` | `interface Name { ... }` declaration                                   |
| `type`      | `SemanticTypeNode`      | `type Name = ...` declaration                                          |
| `ref`       | `SemanticRefNode`       | Reference to an identifier, with optional `.chain`                     |
| `prop`      | `SemanticPropNode`      | Property within an interface/structure (`name?: Type`)                 |
| `structure` | `SemanticStructureNode` | Inline object type `{ ... }`, extends `SemanticGroup`; has `props` map |
| `group`     | `SemanticGroup`         | Union (`                                                               | `) or intersection (`&`) group of nodes |
| `tuple`     | `SemanticTupleNode`     | Tuple type `[A, B]`                                                    |
| `array`     | `SemanticArrayNode`     | Array type `Type[]`                                                    |
| `const`     | `SemanticConstNode`     | Literal constant (`'text'`, `42`)                                      |
| `import`    | `SemanticImportNode`    | `import { ... } from '...'` statement                                  |
| `primitive` | `SemanticPrimitiveNode` | Built-in primitive type with config (extensions, expect rules)         |
| `annotate`  | `SemanticAnnotateNode`  | `annotate Target { ... }` or `annotate Target as Alias { ... }` block  |

## Key commands

```bash
pnpm test -- --project core       # Run tests from repo root
pnpm --filter @atscript/core test # Alternative
pnpm build                        # Build all packages from repo root
```

## Important patterns

- **Messages array pattern**: Errors and warnings are collected into `TMessages` arrays, never thrown. `getDiagMessages()` aggregates all sources.
- **`registerAtDocument(doc)`**: Every semantic node implements this hook, called during `doc.update()` after parsing.
- **`unwindType(name, chain)`**: Recursively follows type aliases and ref chains to find the final underlying definition.
- **Annotation merging**: `mergeNodesAnnotations(left, right)` with right taking precedence. Supports `replace` (default) and `append` strategies.
- **Type guards over `instanceof`**: Always use `isRef(node)`, `isType(node)`, etc. These check the `entity` string field.
- **Token semantic roles**: Tokens saved on nodes with keys (`identifier`, `type`, `export`, `optional`, `path`, `from`, `target`, `inner`).
- **Pipe-based parsing**: Declarative pipe system (`$pipe`, `$token`, `block`, `identifier`, `pun`) to define grammar rules.
- **Document IDs are file URIs**: Documents use `file:///absolute/path.as` as IDs.
- **Snapshot testing**: Parser tests use Vitest snapshot assertions on `node.toString()` output.

# @atscript/typescript

TypeScript language extension for Atscript. Three parts: codegen (.d.ts + .js from .as files), runtime utilities (validator, serializer, json-schema), and CLI (`asc` command, analogous to `tsc`). First of potentially many language extensions.

## Key source files

| File                             | Role                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `src/plugin.ts`                  | Plugin entry point; implements `TAtscriptPlugin` with `render()` and `buildEnd()` hooks                             |
| `src/index.ts`                   | Main export; re-exports the plugin as default                                                                       |
| `src/utils.ts`                   | Secondary export (`@atscript/typescript/utils`); re-exports runtime utilities for generated code                    |
| `src/annotated-type.ts`          | Core runtime type system: `TAtscriptAnnotatedType`, `defineAnnotatedType()` builder, `annotate()`, type guards      |
| `src/traverse.ts`                | `forAnnotatedType()` -- type-safe kind-dispatch used by validator, json-schema, and serializer                      |
| `src/validator.ts`               | `Validator` class -- validates values against annotated types with plugin support                                   |
| `src/json-schema.ts`             | `buildJsonSchema()`, `fromJsonSchema()`, `mergeJsonSchemas()` -- JSON Schema conversion with `$defs`/`$ref` support |
| `src/serialize.ts`               | `serializeAnnotatedType()` / `deserializeAnnotatedType()` -- JSON-safe round-trip                                   |
| `src/codegen/base-renderer.ts`   | `BaseRenderer` -- walks `AtscriptDoc` nodes, dispatches to `renderInterface/renderType/renderImport/renderAnnotate` |
| `src/codegen/type-renderer.ts`   | `TypeRenderer` extends `BaseRenderer` -- generates `.d.ts` output                                                   |
| `src/codegen/js-renderer.ts`     | `JsRenderer` extends `BaseRenderer` -- generates `.js` output with runtime type metadata                            |
| `src/codegen/code-printer.ts`    | `CodePrinter` -- indentation-aware code string builder (write/writeln/block/pop)                                    |
| `src/codegen/utils.ts`           | `wrapProp()`, `escapeQuotes()` -- shared codegen helpers                                                            |
| `src/cli/cli.ts`                 | CLI entry point; boots a `CliApp` with `Commands` controller                                                        |
| `src/cli/commands.controller.ts` | `Commands` class -- implements the default `asc` command (build with diagnostics)                                   |
| `src/atscript.d.ts`              | Global type declarations for `AtscriptMetadata` interface and `AtscriptPrimitiveTags`                               |

## Public API surface

### Default export (`@atscript/typescript`)

- `tsPlugin(opts?)` -- factory returning a `TAtscriptPlugin` (the codegen plugin)

### `@atscript/typescript/utils` (runtime, used by generated .js files)

- `defineAnnotatedType(kind?, base?)` -- fluent builder for `TAtscriptAnnotatedType`
- `annotate(metadata, key, value, asArray?)` -- set/append metadata on annotated types
- `isAnnotatedType(type)` / `isAnnotatedTypeOfPrimitive(type)` -- type guards
- `Validator` class + `ValidatorError`
- `buildJsonSchema(type)` -- JSON Schema generation with `$defs`/`$ref` for named types
- `fromJsonSchema(schema)` -- converts JSON Schema back to annotated types (resolves `$ref`/`$defs`)
- `mergeJsonSchemas(types)` -- combines multiple schemas with shared `$defs` (for OpenAPI)
- `forAnnotatedType(def, handlers)` -- type-kind dispatcher
- `serializeAnnotatedType(type, options?)` / `deserializeAnnotatedType(data)` -- JSON round-trip
- `SERIALIZE_VERSION` -- current serialization format version

## Codegen pipeline

1. `@atscript/core` parses `.as` files into `AtscriptDoc` objects containing `SemanticNode` trees.
2. `tsPlugin()` returns a plugin with a `render(doc, format)` method.
3. **d.ts generation**: `TypeRenderer` walks all nodes -- interfaces become `declare class`, types become `export type`, with companion `declare namespace` blocks.
4. **js generation**: `JsRenderer` emits `defineAnnotatedType()` call chains that build the full runtime type tree with metadata via `.prop()`, `.item()`, `.of()`, `.annotate()`. Each generated class gets a `static id` field with a stable type name (collision-safe).
5. **buildEnd**: emits a project-wide `atscript.d.ts` declaring `AtscriptMetadata` and `AtscriptPrimitiveTags`.

## Runtime utilities

- **Validator**: Validates values against annotated types. Reads `expect.*` metadata for constraints. Options: `partial`, `unknownProps`, `errorLimit`, `plugins`.
- **Serializer**: `serializeAnnotatedType()` / `deserializeAnnotatedType()` for JSON-safe round-trip.
- **JSON Schema**: `buildJsonSchema()` converts annotated types to JSON Schema with `$defs`/`$ref` for named object types. Auto-detects discriminated unions. `fromJsonSchema()` converts back (resolves `$ref`). `mergeJsonSchemas()` combines multiple schemas with shared `$defs` for OpenAPI.

## CLI (`asc` command)

```
asc [options]
  -c, --config    Path to config file (auto-resolved if omitted)
  -f, --format    Output format: js | dts (default: dts)
  --noEmit        Only run diagnostics, no file output
  --skipDiag      Skip diagnostics, always emit
```

## Key commands

```bash
pnpm --filter @atscript/typescript test  # Run this package's tests
pnpm build                               # Build all from repo root
vitest run -u                            # Update snapshots
```

## Important patterns

- **Two entry points**: `index.ts` (plugin) and `utils.ts` (runtime) are separate bundle entries for tree-shaking.
- **Snapshot testing**: every `.as` fixture produces `.js` and `.d.ts` snapshots in `test/__snapshots__/`.
- **`forAnnotatedType()` dispatcher**: canonical pattern for switching on type kind.
- **`defineAnnotatedType()` fluent builder**: all generated JS uses this API.
- **Mutating vs non-mutating annotate**: mutating modifies in-place via `$a()` calls; non-mutating creates new class/type with merged annotations.
- **`CodePrinter`**: all renderers use indentation tracking. Never construct output strings manually.
- **Global `AtscriptMetadata` interface**: generated `atscript.d.ts` provides typed metadata keys.
- **`jsonSchema` option**: `false` (default, no support), `'lazy'` (runtime compute + cache), or `'bundle'` (build-time embed). `@emit.jsonSchema` annotation overrides per interface.
- **Type `id`**: Every interface/type/annotate-alias gets a `static id` string on the generated class and an `id` field on `TAtscriptAnnotatedType`. Used by `buildJsonSchema()` to extract named object types into `$defs` and reference via `$ref`. The `id()` builder method sets it programmatically. Carried through `refTo()` and preserved in serialization.

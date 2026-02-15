# Features

## Syntax Highlighting

The extension provides full TextMate grammar support for `.as` files. Syntax highlighting works immediately after installation — **no dependencies required**.

Highlighted elements include:

- **Keywords** — `import`, `export`, `from`, `type`, `interface`, `annotate`, `as`
- **Type and interface names** — entity declarations
- **Annotations** — `@name` and `@namespace.name` patterns
- **Annotation arguments** — strings, numbers, booleans (`true`, `false`), `null`, `undefined`
- **Properties** — required (`name:`) and optional (`name?:`) with distinct styling
- **Operators** — `|`, `&`, `=`
- **Comments** — line (`//`) and block (`/* */`)
- **Import paths** — string literals in import statements
- **Strings** — single and double quoted

### File Nesting

The extension automatically configures VSCode to nest generated `.as.d.ts` files under their corresponding `.as` files in the Explorer panel:

```
src/
  models/
    user.as
      └─ user.as.d.ts  ← nested automatically
```

## IntelliSense

::: info Requires Dependencies
IntelliSense and all features below require `@atscript/core` to be installed. See [Installation](/packages/vscode/installation).
:::

The extension provides context-aware completions triggered by typing or by specific characters (`@`, `.`, `,`, `{`, `'`, `"`).

### Keyword Completions

At the top level of an `.as` file, the extension suggests:
- `import`, `export`, `annotate`, `interface`, `type`
- After `export`: `annotate`, `interface`, `type`

### Annotation Completions

When typing `@`, all available annotations are suggested based on the current context (interface-level vs. property-level). For namespaced annotations like `@meta.label`, typing the dot triggers a follow-up suggestion for the second part.

Annotation arguments are also completed — predefined allowed values appear for each argument position, and boolean arguments suggest `true`/`false`.

### Type Completions

When typing in a type position (after `:`, `=`, `|`, `&`), the extension suggests:
- All declared types and interfaces in the current file
- All imported types
- All primitive types from the configuration
- **Exported types from other workspace files** — selecting one automatically adds the import statement

### Import Completions

Inside `import { ... }`, the extension suggests exported symbols from the target file, excluding symbols already imported. Inside the `from '...'` path, it provides file system completions for `.as` files and directories.

### Property Chain Completions

For nested property access (e.g., `address.city`), the extension resolves the type chain and suggests valid sub-properties. This also works inside `annotate` blocks for deep property annotations.

## Diagnostics

The extension reports errors in real-time as you type, with a short debounce delay for performance.

**Errors** reported include:
- Syntax errors
- Unknown identifiers (unresolved type references)
- Invalid annotations (wrong context or arguments)
- Unknown properties in `annotate` blocks

**Hints** include:
- Unused tokens — displayed as faded/dimmed text, helping you identify dead code

Diagnostics update automatically when related files change. If you modify a type that other files import, those files are re-validated too.

## Navigation

### Go to Definition

`Cmd+Click` (macOS) or `Ctrl+Click` (Windows/Linux) on any type reference to jump to its declaration. Works across files for imported types.

### Find References

Right-click a type or interface name and select **"Find All References"** to see every usage across the workspace.

### Rename Symbol

Right-click a type or interface name and select **"Rename Symbol"** (`F2`) to rename it and update all references across files.

## Hover Information

Hover over an annotation to see its documentation, including argument types and descriptions. Hover over a type reference to see the documentation from its definition.

## Signature Help

When typing annotation arguments, the extension shows parameter signatures — argument names, types, and positions. Triggered automatically when typing `,` or space inside annotation parentheses.

## Auto `.d.ts` Generation

Every time you save an `.as` file, the extension automatically generates the corresponding `.as.d.ts` TypeScript declaration file. This keeps your type declarations in sync without manual build steps.

## Config Watching

The extension watches for changes to `atscript.config.*` files (`.js`, `.ts`, `.mjs`, `.mts`, `.cjs`, `.cts`). When a config file changes, the language server automatically reloads to pick up new annotations, primitives, and plugins.

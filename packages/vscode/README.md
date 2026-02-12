# Atscript VS Code Extension

**Atscript** is a type-safe annotation language that extends TypeScript-style type definitions with structured metadata. It compiles `.as` files into standard TypeScript and JavaScript with full runtime type information, enabling validation, documentation, schema generation, and more — all driven by annotations on your types.

This extension provides first-class editor support for Atscript in VS Code.

![Preview](https://raw.githubusercontent.com/moostjs/atscript/main/packages/vscode/demo.png)

## Features

- **Syntax highlighting** — full grammar support for `.as` files including interfaces, types, annotations, imports, and ad-hoc annotate blocks
- **Autocomplete** — context-aware suggestions for annotations and their arguments, type references, imported definitions, and top-level keywords (`import`, `export`, `annotate`, `interface`, `type`)
- **Hover tooltips** — inline documentation for annotations, showing argument types and descriptions
- **Diagnostics** — real-time error reporting for unknown identifiers, invalid annotation usage, unknown properties in annotate blocks, and more
- **Go to definition** — navigate to type and interface declarations, including cross-file imports
- **Find references** — locate all usages of a type or interface across your project

## Installation

1. Open **VS Code**
2. Go to **Extensions** (`Ctrl+Shift+X`)
3. Search for `"Atscript"` and install

## Usage

- Open any `.as` file to activate Atscript language support
- Define interfaces and types with `@annotations` for metadata
- Use `annotate` blocks to attach metadata to existing types without modifying them
- The extension picks up your project's `atscript.config.mts` for annotation definitions and primitives

## Documentation

Full documentation is available at [atscript.moost.org](https://atscript.moost.org).

## Feedback & Contributions

Report issues or contribute on [GitHub](https://github.com/moostjs/atscript).

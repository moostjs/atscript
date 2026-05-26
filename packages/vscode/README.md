<h1 align="center">Atscript VS Code Extension</h1>

<p align="center">
  <strong>Define your models once</strong> — get TypeScript types, runtime validation, and DB metadata from a single <code>.as</code> model.
</p>

<p align="center">
  <a href="https://atscript.dev">Documentation</a> · <a href="https://atscript.dev/packages/vscode/">VSCode Extension Guide</a>
</p>

---

First-class editor support for Atscript (`.as`) files in Visual Studio Code. Powered by a full LSP implementation backed by `@atscript/core`.

![Preview](https://raw.githubusercontent.com/moostjs/atscript/main/packages/vscode/as-demo.png)

## Installation

1. Open **VS Code**
2. Go to **Extensions** (`Ctrl+Shift+X`)
3. Search for `"Atscript"` and install

> **Note:** `@atscript/core` must be installed either globally (`npm i -g @atscript/core`) or at the root of the project you open in VS Code. If it cannot be found, language features (diagnostics, completions, go-to-definition, etc.) will not work.

## Features

- **Syntax highlighting** — full grammar for `.as` files
- **Autocomplete** — context-aware suggestions for annotations, types, imports, and keywords
- **Hover tooltips** — inline docs for annotations with argument types
- **Diagnostics** — real-time error and warning reporting
- **Go to definition** — navigate to declarations across files
- **Find references** — locate all usages of a type or interface
- **Signature help** — annotation argument signatures
- **Auto-generate `.d.ts`** — builds type declarations on save
- **Config watching** — reloads on `atscript.config.*` changes

## Documentation

- [VSCode Extension Guide](https://atscript.dev/packages/vscode/)
- [Full Atscript Documentation](https://atscript.dev)
- [Atscript DB](https://db.atscript.dev)
- [Atscript UI](https://ui.atscript.dev)

## Feedback

Report issues or contribute on [GitHub](https://github.com/moostjs/atscript).

## License

MIT

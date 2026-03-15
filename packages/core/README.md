<p align="center">
  <img src="https://atscript.moost.org/logo.svg" alt="Atscript" width="120" />
</p>

<h1 align="center">@atscript/core</h1>

<p align="center">
  <strong>Define your models once</strong> — get TypeScript types, runtime validation, and DB metadata from a single <code>.as</code> model.
</p>

<p align="center">
  <a href="https://atscript.moost.org">Documentation</a> · <a href="https://atscript.moost.org/plugin-development/">Plugin Development</a>
</p>

---

Core foundation of the Atscript ecosystem: parser, AST, plugin system, diagnostics, and dependency tracking for `.as` files.

This package is not typically used directly by application developers. It is the base layer that language extensions (like `@atscript/typescript`) and editor integrations build upon. Use this if you are building a new language extension, custom build pipeline, or editor plugin.

## Installation

```bash
pnpm add @atscript/core
```

## Features

- Pipe-based parser producing a semantic AST with full position tracking
- Plugin system with lifecycle hooks (`config`, `resolve`, `load`, `onDocument`, `render`, `buildEnd`)
- Cross-file dependency tracking and import resolution via `AtscriptRepo`
- Annotation specs with argument validation, node constraints, and merge strategies
- Spatial indexes for LSP features (go-to-definition, hover, completions)
- Built-in primitives (`string`, `number`, `boolean` and extensions) and `@expect.*` / `@meta.*` annotations
- Auto-resolving `atscript.config.*` configuration files
- `build()` API for batch compilation

## Documentation

- [Plugin Development Guide](https://atscript.moost.org/plugin-development/)
- [Full Documentation](https://atscript.moost.org)

## License

MIT

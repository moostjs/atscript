# VSCode Extension

The Atscript VSCode extension provides first-class editor support for `.as` files — syntax highlighting, IntelliSense, real-time diagnostics, navigation, and automatic `.d.ts` generation on save.

::: info LSP Requirement
The extension provides syntax highlighting out of the box. For IntelliSense, diagnostics, and other LSP features, `@atscript/core` must be installed in your project. See [Installation](/packages/vscode/installation) for details.
:::

## What's in This Section

- [Installation](/packages/vscode/installation) — install the extension and set up your project
- [Features](/packages/vscode/features) — syntax highlighting, IntelliSense, diagnostics, navigation, and more
- [Configuration](/packages/vscode/configuration) — project configuration and editor settings

## Quick Overview

| Feature                     | Description                                                                      |
| --------------------------- | -------------------------------------------------------------------------------- |
| **Syntax Highlighting**     | Full grammar support for `.as` files — works immediately, no dependencies needed |
| **IntelliSense**            | Context-aware completions for annotations, types, imports, and properties        |
| **Diagnostics**             | Real-time error reporting and unused token hints                                 |
| **Go to Definition**        | Navigate to type and interface declarations across files                         |
| **Find References**         | Locate all usages of a type or interface                                         |
| **Rename Symbol**           | Rename types/interfaces and update all references                                |
| **Hover Information**       | Inline documentation for annotations and type references                         |
| **Signature Help**          | Annotation argument signatures as you type                                       |
| **Auto `.d.ts` Generation** | Generates TypeScript declarations on save                                        |
| **Config Watching**         | Automatically reloads when `atscript.config.*` files change                      |

## Requirements

- VSCode 1.80.0 or higher
- `@atscript/core` — installed in your project root for LSP features (see [Installation](/packages/vscode/installation))

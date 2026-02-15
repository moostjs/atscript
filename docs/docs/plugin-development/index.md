# Plugin Development

This guide covers how to extend Atscript by building plugins, language extensions, and LSP integrations. It's aimed at developers who want to add support for new languages (Python, Java, etc.), create custom code generators, or build editor tooling on top of the Atscript core.

## Who Is This For?

- **Language extension authors** — creating a new language target (like `@atscript/typescript` does for TypeScript)
- **Plugin authors** — adding custom annotations, primitives, or metadata processing
- **Tool authors** — building LSPs, linters, or other developer tools that consume Atscript

## What You'll Learn

**Core Concepts:**
- [Architecture](/plugin-development/architecture) — how the core is structured
- [Parser & AST](/plugin-development/parser-ast) — parsing `.as` files and navigating the AST
- [Semantic Nodes](/plugin-development/semantic-nodes) — the resolved type graph
- [Plugin System](/plugin-development/plugin-system) — hooks, lifecycle, and configuration
- [Annotation System](/plugin-development/annotation-system) — defining and processing annotations
- [Type System](/plugin-development/type-system) — primitives, type resolution, and unwinding

**Building a Language Extension:**
- [Plugin Hooks](/plugin-development/plugin-hooks) — the full hook API
- [Code Generation](/plugin-development/code-generation) — emitting output from the AST
- [Primitives & Type Tags](/plugin-development/primitives-type-tags) — adding semantic types
- [Testing Plugins](/plugin-development/testing-plugins) — test harness and snapshot testing

**Building an LSP:**
- [LSP Overview](/plugin-development/lsp-overview) — how the Atscript LSP works
- [Diagnostics](/plugin-development/diagnostics) — error reporting and validation
- [Completions & Navigation](/plugin-development/completions-navigation) — IntelliSense features

**Reference:**
- [Core API](/plugin-development/core-api) — `@atscript/core` public API
- [Plugin API](/plugin-development/plugin-api) — plugin interface and hook signatures

## Prerequisites

Familiarity with `@atscript/core` and at least one existing language extension (like `@atscript/typescript`) is recommended. The TypeScript plugin source code serves as the reference implementation for many concepts covered here.

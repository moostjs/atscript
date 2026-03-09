# Atscript for TypeScript

The TypeScript guide is the main place to evaluate Atscript today. TypeScript is the first supported target, and this section is organized as a practical learning path first, with lower-level reference material separated out for later.

::: tip Best Path For New Users
If you are evaluating Atscript for the first time, read these in order:

1. [Why Atscript?](/packages/typescript/why-atscript)
2. [Quick Start](/packages/typescript/quick-start)
3. [Build Setup](/packages/typescript/build-setup)
4. [Validation Guide](/packages/typescript/validation)
:::

## What You Can Do Today

- Define models once in `.as` files
- Generate TypeScript types and runtime metadata
- Validate data from the same model
- Export JSON Schema
- Feed the same model into DB integrations

## Recommended Learning Path

### 1. Get A First Success

- [Why Atscript?](/packages/typescript/why-atscript) — the problem Atscript solves for TypeScript applications
- [Quick Start](/packages/typescript/quick-start) — define one model, generate files, and validate data
- [Build Setup](/packages/typescript/build-setup) — wire Atscript into Vite, Rollup, esbuild, or another bundler

### 2. Learn The Core Language

- [Interfaces & Types](/packages/typescript/interfaces-types) — the `.as` syntax you will use most
- [Imports & Exports](/packages/typescript/imports-exports) — how `.as`, `.as.d.ts`, and `.as.js` fit together
- [Primitives](/packages/typescript/primitives) — semantic types like `string.email` and `number.int`
- [Annotations Guide](/packages/typescript/annotations) — practical metadata and validation annotations

### 3. Use The Runtime Tools

- [Validation Guide](/packages/typescript/validation) — validate unknown input with type narrowing
- [Metadata](/packages/typescript/metadata-export) — read labels, placeholders, and other annotations at runtime
- [JSON Schema](/packages/typescript/json-schema) — generate JSON Schema from types
- [Serialization](/packages/typescript/serialization) — serialize types for backend-to-frontend transfer

### 4. Configure And Automate

- [Installation](/packages/typescript/installation) — packages, prerequisites, and optional tooling
- [Configuration](/packages/typescript/configuration) — plugin options and config file settings
- [CLI](/packages/typescript/cli) — generate files from the command line

### 5. Go Deeper When You Need To

- [Atscript Validation vs Others](/packages/typescript/validation-comparison) — side-by-side comparison with Zod and class-validator
- [Ad-hoc Annotations](/packages/typescript/ad-hoc-annotations) — annotate existing types without editing their source
- [Annotations Reference](/packages/typescript/annotations-reference) — inheritance, merge rules, and the full annotation catalog
- [Validation Reference](/packages/typescript/validation-reference) — validator options, plugin hooks, and lower-level API details
- [Type Definitions](/packages/typescript/type-definitions) — the annotated runtime type system and traversal
- [Code Generation](/packages/typescript/code-generation) — what Atscript emits and how imports work
- [Custom Primitives](/packages/typescript/custom-primitives) — define your own primitive extensions
- [Custom Annotations](/packages/typescript/custom-annotations) — define your own annotation types

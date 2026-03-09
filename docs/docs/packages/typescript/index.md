# Atscript for TypeScript

The TypeScript guide is the main place to evaluate Atscript today. TypeScript is the first supported target, and this section covers the most complete workflow for defining `.as` files, generating TypeScript code, and using runtime utilities like validation, JSON Schema, and serialization.

::: tip Start Here
If you are new to Atscript, start with the [Quick Start](/packages/typescript/quick-start). Atscript is language-agnostic by design, but the TypeScript plugin is the first production implementation today.
:::

## What You Can Do Today

- Define models once in `.as` files
- Generate TypeScript types and runtime metadata
- Validate data from the same model
- Export JSON Schema
- Feed the same model into DB integrations

## What's in This Guide

**Introduction:**

- [Why Atscript?](/packages/typescript/why-atscript) — the problem Atscript solves
- [Atscript Validation vs Others](/packages/typescript/validation-comparison) — side-by-side comparison with Zod and class-validator
- [Quick Start](/packages/typescript/quick-start) — create your first `.as` file

**Atscript Syntax:**

- [Interfaces & Types](/packages/typescript/interfaces-types) — define data structures
- [Imports & Exports](/packages/typescript/imports-exports) — module system
- [Primitives](/packages/typescript/primitives) — built-in types and semantic extensions
- [Annotations](/packages/typescript/annotations) — syntax, inheritance, built-in annotations
- [Ad-hoc Annotations](/packages/typescript/ad-hoc-annotations) — annotate existing types without modification

**Runtime API:**

- [Metadata](/packages/typescript/metadata-export) — access annotations at runtime
- [Validation](/packages/typescript/validation) — validate data with type guard support
- [JSON Schema](/packages/typescript/json-schema) — generate JSON Schema from types
- [Serialization](/packages/typescript/serialization) — serialize types for backend-to-frontend transfer
- [Type Definitions](/packages/typescript/type-definitions) — the annotated type system and type traversal

**Setup & Tooling:**

- [Configuration](/packages/typescript/configuration) — config file and plugin options
- [CLI](/packages/typescript/cli) — build `.as` files from the command line
- [Build Setup](/packages/typescript/build-setup) — bundler integration (Vite, Rollup, esbuild)

**Advanced:**

- [Custom Primitives](/packages/typescript/custom-primitives) — define your own primitive extensions
- [Custom Annotations](/packages/typescript/custom-annotations) — define your own annotation types

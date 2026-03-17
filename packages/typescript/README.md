<p align="center">
  <img src="https://atscript.dev/logo.svg" alt="Atscript" width="120" />
</p>

<h1 align="center">@atscript/typescript</h1>

<p align="center">
  <strong>Define your models once</strong> — get TypeScript types, runtime validation, and DB metadata from a single <code>.as</code> model.
</p>

<p align="center">
  <a href="https://atscript.dev">Documentation</a> · <a href="https://atscript.dev/packages/typescript/">TypeScript Guide</a>
</p>

---

TypeScript language extension for Atscript. Compiles `.as` files to `.d.ts` type declarations and `.js` runtime modules with validation, serialization, and JSON Schema support. Includes the `asc` CLI.

## Installation

```bash
pnpm add @atscript/typescript @atscript/core
```

## Quick Start

```bash
# Compile .as files to .d.ts + .js
npx asc -f js

# Diagnostics only
npx asc --noEmit
```

```ts
// Runtime validation
import { Validator, buildJsonSchema } from '@atscript/typescript/utils'
import { User } from './schema/user.as'

const errors = new Validator().validate(User, inputData)
const schema = buildJsonSchema(User)
```

## Features

- Generates `.d.ts` type declarations and `.js` runtime modules from `.as` files
- CLI (`asc`) for batch compilation with diagnostics
- `Validator` class for runtime data validation against `@expect.*` constraints
- JSON Schema generation (`buildJsonSchema`) and parsing (`fromJsonSchema`)
- Serialization for JSON-safe round-trip of type definitions
- Type-safe utility types: `FlatOf<T>`, `PrimaryKeyOf<T>`, `OwnPropsOf<T>`, `NavPropsOf<T>`
- Global `atscript.d.ts` generation for typed metadata access

## AI Agent Skills

```bash
npx atscript-typescript-skill          # Install skills locally
npx atscript-typescript-skill --global # Install globally
```

## Documentation

- [TypeScript Guide](https://atscript.dev/packages/typescript/)
- [Full Documentation](https://atscript.dev)

## License

MIT

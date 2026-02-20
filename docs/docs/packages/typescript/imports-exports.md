# Imports & Exports

Atscript imports and exports work similar to TypeScript with some specific limitations and rules.

<!--@include: ../../_fragments/imports-exports.md-->

## Importing .as Files in TypeScript

TypeScript files **must** include the `.as` extension:

```typescript
// app.ts
import { User, UserID, Status } from './user.as'
import { Product } from '../models/product.as'

// Use as both type and runtime object
const user: User = { id: '1', name: 'John' }
const validator = User.validator()
const metadata = User.metadata
```

## Setup for TypeScript Integration

For TypeScript to import `.as` files:

1. **With VSCode Extension**: Automatically generates `.as.d.ts` files on save
2. **With CLI**: Run `asc -f dts` to generate TypeScript definitions
3. **With Bundler**: Use `unplugin-atscript` for automatic compilation

Example generated structure:

```
src/
  user.as          # Source file
  user.as.js       # Generated JavaScript (with asc -f js)
  user.as.d.ts     # Generated TypeScript definitions
  app.ts           # Can import from './user.as'
```

## Next Steps

- [Primitives](/packages/typescript/primitives) — Primitive types and extensions
- [Annotations](/packages/typescript/annotations) — Metadata system

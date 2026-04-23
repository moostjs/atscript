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

### Importing from Packages in TypeScript

When importing `.as` types from an npm package in TypeScript, use the `.as` extension (added automatically by the Atscript compiler when generating `.js`/`.d.ts` output):

```typescript
// app.ts — importing .as types from a published package
import { User } from '@my-org/models/user.as'
import { Product } from 'shared-types/product.as'
```

The bundler (`unplugin-atscript`) and TypeScript resolve these through the package's `exports` field:

- **Bundlers** use the `"import"` condition to find the compiled `.as.mjs`/`.as.js`
- **TypeScript** uses the `"types"` condition to find the `.as.d.ts` declarations

If the package doesn't use `exports`, bundlers resolve the `.as` file directly from `node_modules` and compile it on the fly via the unplugin `load()` hook.

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

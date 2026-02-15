# Interfaces & Types

Atscript provides TypeScript-like syntax with annotations and semantic types.

<!--@include: ../../_fragments/interfaces-types.md-->

## TypeScript Usage

In TypeScript, use type aliases as both types and validators:

```typescript
import { Username } from './types.as'

const name: Username = 'john_doe'
const validator = Username.validator()

if (validator.validate(input, true)) {
    // input is Username
}
```

## Next Steps

- [Imports & Exports](/packages/typescript/imports-exports) — Module system
- [Primitives](/packages/typescript/primitives) — Semantic types
- [Annotations](/packages/typescript/annotations) — Metadata system
- [Ad-hoc Annotations](/packages/typescript/ad-hoc-annotations) — Annotate existing types without modification

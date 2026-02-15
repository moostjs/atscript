# Primitives

<!--@include: ../../_fragments/primitives.md-->

## Type Tags in TypeScript

When compiled, semantic types preserve their extensions as tags:

```typescript
// Generated TypeScript
export declare class User {
  email: string /* email */
  age: number /* int */
  // ...
}

// Runtime metadata access
const emailProp = User.type.props.get('email')
const emailTags = emailProp?.type.tags // ['email', 'string']

const ageProp = User.type.props.get('age')
const ageTags = ageProp?.type.tags // ['int', 'number']
```

These tags can be used by:

- Validators to apply appropriate rules
- UI generators to choose correct input types
- API documentation generators
- Database schema generators

## Next Steps

- [Annotations](/packages/typescript/annotations) — add metadata to your types
- [Custom Primitives](/packages/typescript/custom-primitives) — define your own primitive extensions
- [Type Definitions](/packages/typescript/type-definitions) — how tags and metadata are accessed at runtime

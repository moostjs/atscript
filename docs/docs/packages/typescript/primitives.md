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

## DOs and DON'Ts

- **DO treat semantic types as format checks, not semantic truth.** They validate with regex patterns: `string.date` accepts `99/99/9999` (it matches the `MM/DD/YYYY` shape), and `string.email` uses a pragmatic pattern, not full RFC 5322. Add application-level checks when calendar validity or deliverability actually matters.
- **DON'T use `@expect.minLength 1` when you mean `string.required`.** `string.required` rejects whitespace-only strings like `"  "`; `minLength 1` accepts them.
- **DON'T stack `@expect.pattern` on a semantic type to broaden it.** Patterns are conjunctive — every pattern must match — so an extra pattern on `string.email` only narrows it further. For alternative formats, define a [custom primitive](/packages/typescript/custom-primitives) with a single alternation regex (`^(?:formA|formB)$`).

## Next Steps

- [Annotations](/packages/typescript/annotations) — add metadata to your types
- [Custom Primitives](/packages/typescript/custom-primitives) — define your own primitive extensions
- [Type Definitions](/packages/typescript/type-definitions) — how tags and metadata are accessed at runtime

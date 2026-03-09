# Why Atscript?

For most TypeScript applications, the same model ends up being described several times:

- once as a TypeScript type
- once as a validation schema
- once again as labels or UI hints
- sometimes again as JSON Schema or API documentation

That duplication slows changes down and makes it easy for one layer to drift out of sync with another.

## Before Atscript

Here is a common TypeScript setup:

```typescript
// types/user.ts
export interface User {
  email: string
  name: string
  age: number
}

// validation/user.ts
export const UserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  age: z.number().int().min(0),
})

// ui/user-fields.ts
export const userFields = {
  email: { label: 'Email Address', type: 'email' },
  name: { label: 'Full Name' },
  age: { label: 'Age', type: 'number' },
}
```

The shape is repeated, the rules are repeated, and the field labels live somewhere else again.

## With Atscript

Put that information in one `.as` file instead:

```atscript
export interface User {
    @meta.label 'Email Address'
    email: string.email

    @meta.label 'Full Name'
    @expect.minLength 2
    name: string

    @expect.min 0
    age: number.int
}
```

Then use it from TypeScript:

```typescript
import { User } from './user.as'
import { buildJsonSchema } from '@atscript/typescript/utils'

const validator = User.validator()
const emailField = User.type.props.get('email')
const schema = buildJsonSchema(User)

console.log(emailField?.metadata.get('meta.label'))
// -> 'Email Address'

if (validator.validate(input, true)) {
  saveUser(input)
} else {
  console.log(validator.errors)
}
```

## What Changes In Practice

- You describe the model once instead of maintaining parallel type and schema files.
- Validation rules stay on the model instead of being repeated in another DSL.
- Labels and other metadata stay next to the fields they describe.
- Runtime tools can read the same model without inventing a second configuration format.

## What Atscript Gives You Today

- TypeScript types with runtime metadata
- Runtime validation from the same model
- JSON Schema export
- A clear path into DB integrations and other model-driven tooling

## What It Does Not Force You To Learn Up Front

You do not need to understand the internal type tree or plugin system to get value from Atscript.

For most application work, you only need to know:

- how to write a `.as` file
- how to import the generated type
- how to validate data
- how to read metadata when you need it

The lower-level runtime APIs are available later, when you need advanced tooling or custom integrations.

## Next Steps

- [Quick Start](/packages/typescript/quick-start) — get a working `User.validator()` in a small project
- [Build Setup](/packages/typescript/build-setup) — wire Atscript into your real app build
- [Validation Guide](/packages/typescript/validation) — validate request data and partial updates

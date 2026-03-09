# Validation Guide

Every generated Atscript type has a `.validator()` method for runtime validation.

In normal application code, you usually use it for:

- validating request or form input
- narrowing `unknown` data to a real TypeScript type
- stripping or rejecting unexpected properties
- handling partial updates safely

```typescript
import { Product } from './product.as'

const validator = Product.validator()
```

## 1. Validate One Value

### Safe Mode

Safe mode returns `false` on failure and acts as a type guard:

```typescript
if (validator.validate(data, true)) {
  // TypeScript now knows data is Product
  console.log(data.name, data.price)
} else {
  console.log(validator.errors)
}
```

This is the most practical mode for request handlers and form submissions.

### Throwing Mode

Throwing mode raises `ValidatorError` on failure:

```typescript
try {
  validator.validate(data)
  // data passed validation
} catch (error) {
  console.error(error.message)
  console.error(error.errors)
}
```

## 2. Narrow `unknown` Data

The validator doubles as a type guard, so it works well at the edge of your app:

```typescript
import { Product } from './product.as'

function handleRequest(body: unknown) {
  if (Product.validator().validate(body, true)) {
    // body is Product here
    saveProduct(body)
  }
}
```

No manual generic parameters are needed. Atscript already knows the data shape from the model.

## 3. Control Unexpected Properties

Use `unknownProps` when inputs may contain extra fields:

```typescript
const validator = Product.validator({
  unknownProps: 'strip',
})
```

Options:

- `'error'` — fail validation if an extra field is present
- `'ignore'` — leave extra fields alone
- `'strip'` — remove extra fields from the value

`'strip'` is often useful for request payloads.

## 4. Validate Partial Updates

Use `partial` when validating patch-like payloads:

```typescript
const patchValidator = Product.validator({
  partial: true,
})
```

Options:

- `false` — all required properties must be present
- `true` — allow missing properties at the top level
- `'deep'` — allow missing properties at every level

`'deep'` is useful for nested patch payloads.

## 5. Put Rules On The Model

Validation rules come from your `.as` file:

```atscript
export interface User {
  @expect.minLength 3
  username: string

  email: string.email

  @expect.min 18
  age: number.int
}
```

That means one model definition can give you:

- static typing
- runtime validation
- metadata for other tools

## 6. Write Better Error Messages

Most validation annotations accept a custom message as the last argument:

```atscript
export interface SignupForm {
  @meta.required "Please enter your name"
  @expect.minLength 3, "Username must be at least 3 characters"
  username: string
}
```

When validation fails, the custom message is used instead of the default one.

## 7. Know The Common Built-Ins

The most common validation rules come from:

- semantic types like `string.email`, `string.required`, `number.int.positive`
- `@expect.minLength`
- `@expect.maxLength`
- `@expect.min`
- `@expect.max`
- `@expect.pattern`

For array uniqueness and other less common rules, see the [Validation Reference](/packages/typescript/validation-reference).

## When To Read The Reference

Use the reference page when you need:

- every validator option in one place
- the exact `validate()` signature
- `ValidatorError`
- array uniqueness rules
- plugin hooks and external context
- manual `Validator` construction from runtime types

## Next Steps

- [Validation Reference](/packages/typescript/validation-reference) — options, plugins, and lower-level API details
- [Annotations Guide](/packages/typescript/annotations) — keep validation rules on the model
- [Type Definitions](/packages/typescript/type-definitions) — understand the runtime type system behind the validator

# Why Atscript In Moost?

In Moost, a parameter type annotation is not validation by itself.

This controller:

```typescript
import { Controller } from 'moost'
import { Body, Post } from '@moostjs/event-http'
import { CreateUserDto } from './create-user.dto.as'

@Controller('users')
export class UsersController {
  @Post()
  async create(@Body() dto: CreateUserDto) {
    return this.users.create(dto)
  }
}
```

looks safe, but `dto` is still just request data unless something validates it at runtime.

## The Usual Alternatives

Without `@atscript/moost-validator`, you usually end up with one of these:

- manual `CreateUserDto.validator().validate(...)` calls inside handlers
- a second validation layer such as Zod or class-validator
- no runtime validation at all

All three add friction. The first adds boilerplate. The second duplicates the model. The third is not safe.

## Without Moost Validator

```typescript
import { Controller } from 'moost'
import { Body, Post, HttpError } from '@moostjs/event-http'
import { CreateUserDto } from './create-user.dto.as'

@Controller('users')
export class UsersController {
  @Post()
  async create(@Body() body: unknown) {
    const validator = CreateUserDto.validator()

    if (!validator.validate(body, true)) {
      throw new HttpError(400, {
        message: validator.errors[0]?.message || 'Validation failed',
        statusCode: 400,
        _body: validator.errors,
      })
    }

    return this.users.create(body)
  }
}
```

This works, but now every handler has to remember to validate, shape an error, and keep that pattern consistent.

## With Moost Validator

```typescript
import { Controller } from 'moost'
import { Body, Post } from '@moostjs/event-http'
import { validatorPipe, validationErrorTransform } from '@atscript/moost-validator'

app.applyGlobalPipes(validatorPipe())
app.applyGlobalInterceptors(validationErrorTransform())

@Controller('users')
export class UsersController {
  @Post()
  async create(@Body() dto: CreateUserDto) {
    return this.users.create(dto)
  }
}
```

Now the handler only describes the contract. The validation logic stays in one place.

## What Changes In Practice

- your `.as` model becomes the controller contract
- request validation happens before business logic
- the same Atscript validator options work in Moost too
- HTTP error conversion is consistent across handlers

## Compared To class-validator In Nest-Style Apps

If you come from NestJS-style validation, the biggest difference is where the validation rules live.

With `class-validator`, validation is attached to class properties with decorators. For nested object graphs, that usually means:

- defining a separate class for each nested structure you want to validate
- adding validation decorators to each property
- adding nested-validation wiring such as `@ValidateNested()`
- often pairing it with `class-transformer` so nested values are turned into class instances

That works, but it is easy to end up repeating information that is already present in the TypeScript type shape.

With Atscript, the model is the validation contract:

```atscript
export interface Address {
    city: string
    zip: string
}

export interface CreateUserDto {
    email: string.email
    address: Address
}
```

There is no second class layer for nested shapes. The `.as` model already carries both the structure and the validation rules.

## Reusable Validated Primitive Types

Another difference is validated primitives.

With Atscript, you can define a reusable primitive type once:

```atscript
export type Email = string.email
```

and use it directly in a handler:

```typescript
import { Controller } from 'moost'
import { Body, Post } from '@moostjs/event-http'
import { Email } from './types.as'

@Controller('newsletter')
export class NewsletterController {
  @Post()
  async subscribe(@Body() email: Email) {
    return this.newsletter.subscribe(email)
  }
}
```

That handler argument is validated automatically by `validatorPipe()`.

This is a strong fit for Atscript because validation is driven by the annotated type itself. In contrast, `class-validator` is built around decorators on class properties, so it does not give you the same standalone, reusable validated primitive-type pattern for direct handler arguments.

## When This Package Fits Best

Use `@atscript/moost-validator` when:

- your app already uses Atscript models
- you want runtime validation in Moost without handler boilerplate
- you want one source of truth for TypeScript types and validation rules

## What It Does Not Do

- it does not create Atscript models for you
- it does not coerce values into the right type
- it does not replace the need for a custom error shape if your API needs one

The pipe validates the value it receives. If you need coercion or a non-HTTP error format, add those pieces separately.

## Next Steps

- [Validation Pipe](/packages/moost-validator/validation-pipe) — the main integration point
- [Error Handling](/packages/moost-validator/error-handling) — built-in HTTP behavior and custom error shapes
- [TypeScript Quick Start](/packages/typescript/quick-start) — if you have not set up Atscript models yet

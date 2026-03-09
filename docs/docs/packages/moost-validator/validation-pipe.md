# Validation Pipe

`validatorPipe(opts?)` is the main entry point in `@atscript/moost-validator`.

It checks a handler argument's runtime type. If that type is an Atscript annotated type, it runs the model's validator before your handler executes.

## The Most Common Setup

Register it globally:

```typescript
import { Moost } from 'moost'
import { validatorPipe } from '@atscript/moost-validator'

const app = new Moost()
app.applyGlobalPipes(validatorPipe())
```

That is the best default for most apps.

## Validate Request Bodies

This is the most common use case:

```typescript
import { Controller } from 'moost'
import { Body, Post } from '@moostjs/event-http'
import { CreateUserDto } from './create-user.dto.as'

@Controller('users')
export class UsersController {
  @Post()
  async create(@Body() dto: CreateUserDto) {
    // dto has already been validated
    return this.users.create(dto)
  }
}
```

If validation fails, the pipe throws `ValidatorError`. For HTTP apps, pair it with [Error Handling](/packages/moost-validator/error-handling).

## Validate PATCH Payloads

For partial updates, pass Atscript validator options to the pipe:

```typescript
import { Controller } from 'moost'
import { Patch, Body } from '@moostjs/event-http'
import { UseValidatorPipe } from '@atscript/moost-validator'
import { UpdateUserDto } from './update-user.dto.as'

@Controller('users')
export class UsersController {
  @Patch(':id')
  @UseValidatorPipe({ partial: true })
  async patch(@Body() dto: UpdateUserDto) {
    return this.users.patch(dto)
  }
}
```

Use `partial: 'deep'` when nested objects should also allow missing fields.

## Strip Unknown Properties

This is useful for request bodies that may contain extra fields:

```typescript
app.applyGlobalPipes(
  validatorPipe({
    unknownProps: 'strip',
  })
)
```

Options:

- `'error'` — reject unknown props
- `'ignore'` — keep them
- `'strip'` — remove them from the value

## Apply It Per Controller Or Handler

Global registration is usually best, but the decorator form is useful when only part of the app uses Atscript DTOs.

### Per Controller

```typescript
import { Controller } from 'moost'
import { UseValidatorPipe } from '@atscript/moost-validator'

@UseValidatorPipe()
@Controller('users')
export class UsersController {}
```

### Per Handler

```typescript
import { Controller } from 'moost'
import { Body, Post } from '@moostjs/event-http'
import { UseValidatorPipe } from '@atscript/moost-validator'
import { CreateUserDto } from './create-user.dto.as'

@Controller('users')
export class UsersController {
  @Post()
  @UseValidatorPipe()
  async create(@Body() dto: CreateUserDto) {}
}
```

`UseValidatorPipe(opts?)` is sugar for `@Pipe(validatorPipe(opts))`.

## Validate Params And Query Values Carefully

The pipe validates the value it receives. It does not coerce strings into numbers, booleans, or dates.

That means:

- body payloads are usually a good fit because JSON parsing already gives you numbers, booleans, arrays, and objects
- raw HTTP params and query values are often strings, so string-based Atscript types fit best there

Good example:

```atscript
export type EmailQuery = string.email
```

```typescript
import { Controller } from 'moost'
import { Get, Query } from '@moostjs/event-http'
import { EmailQuery } from './queries.as'

@Controller('users')
export class UsersController {
  @Get('search')
  async search(@Query('email') email: EmailQuery) {
    return this.users.searchByEmail(email)
  }
}
```

If a param or query needs numeric validation, parse it before it reaches this pipe or validate it as a string-shaped contract instead.

## Use Reusable Validated Primitive Types

This is one of the nicest patterns in Atscript + Moost.

Define a validated primitive once:

```atscript
export type Email = string.email
```

Then use those types directly in handlers:

```typescript
import { Controller } from 'moost'
import { Body, Post } from '@moostjs/event-http'
import { Email } from './types.as'

@Controller('newsletter')
export class NewsletterController {
  @Post('subscribe')
  async subscribe(@Body() email: Email) {
    return this.newsletter.subscribe(email)
  }
}
```

That is hard to model with `class-validator`, because its validation model is centered on decorated classes and their properties. Atscript validates the type itself, so standalone reusable primitives work naturally.

## Options At A Glance

`validatorPipe(opts?)` accepts the same `Partial<TValidatorOptions>` object as Atscript's runtime validator.

Most useful options:

- `partial`
- `unknownProps`
- `errorLimit`
- `skipList`
- `replace`
- `plugins`

If you already know the TypeScript validator API, the same options work here. See [Validation Reference](/packages/typescript/validation-reference) for the full low-level option details.

## Beyond HTTP

The pipe is not tied to HTTP. It works anywhere Moost resolves handler arguments.

What is HTTP-specific is the built-in error transform, because that part returns `HttpError(400)`.

## Next Steps

- [Error Handling](/packages/moost-validator/error-handling) — convert `ValidatorError` into HTTP responses
- [Validation Guide](/packages/typescript/validation) — deeper validator behavior and options
- [Why Atscript In Moost?](/packages/moost-validator/why-atscript-validation) — when this package is the right fit

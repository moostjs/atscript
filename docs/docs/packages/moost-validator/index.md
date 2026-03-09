# @atscript/moost-validator

Use Atscript models as runtime validation contracts in Moost handlers.

`@atscript/moost-validator` gives you two small integration points:

- `validatorPipe()` validates handler arguments whose runtime type comes from an `.as` model
- `validationErrorTransform()` turns `ValidatorError` into `HttpError(400)` for HTTP apps

::: tip Best Path For New Users
If you are evaluating this package for the first time, read these in order:

1. [Why Atscript In Moost?](/packages/moost-validator/why-atscript-validation)
2. [Validation Pipe](/packages/moost-validator/validation-pipe)
3. [Error Handling](/packages/moost-validator/error-handling)
:::

## What This Package Gives You

- one `.as` model for TypeScript types and runtime validation
- automatic validation in Moost handlers
- the same Atscript validator options you already use elsewhere
- optional HTTP-friendly error conversion when you use `@moostjs/event-http`

## Installation

::: code-group

```bash [pnpm]
pnpm add @atscript/moost-validator
```

```bash [npm]
npm install @atscript/moost-validator
```

:::

### Peer Dependencies

You also need:

- `@atscript/core`
- `@atscript/typescript`
- `moost`
- `@moostjs/event-http` if you want the built-in HTTP error transform

## Quick Start

### 1. Define A DTO In Atscript

```atscript
export interface CreateUserDto {
    @meta.label 'Display Name'
    @expect.minLength 2, 'Name must be at least 2 characters'
    name: string

    email: string.email

    @expect.minLength 8, 'Password must be at least 8 characters'
    password: string
}
```

### 2. Register The Pipe And HTTP Error Transform

```typescript
import { Moost } from 'moost'
import { MoostHttp } from '@moostjs/event-http'
import { validatorPipe, validationErrorTransform } from '@atscript/moost-validator'
import { UsersController } from './users.controller'

const app = new Moost()
app.adapter(new MoostHttp())

app.applyGlobalPipes(validatorPipe())
app.applyGlobalInterceptors(validationErrorTransform())

app.registerControllers(UsersController)
await app.init()
```

### 3. Use The DTO In A Controller

```typescript
import { Controller } from 'moost'
import { Body, Post } from '@moostjs/event-http'
import { CreateUserDto } from './create-user.dto.as'

@Controller('users')
export class UsersController {
  @Post()
  async create(@Body() dto: CreateUserDto) {
    // dto has already been validated
    return { id: '123', ...dto }
  }
}
```

Without the pipe, the TypeScript annotation alone does not validate request data. With the pipe in place, your handler runs only after Atscript validation succeeds.

## HTTP And Non-HTTP Usage

- `validatorPipe()` is the core integration and works anywhere Moost resolves handler arguments
- `validationErrorTransform()` is HTTP-specific because it converts `ValidatorError` into `HttpError`

If you are not building an HTTP app, keep `validatorPipe()` and use your own error interceptor for your adapter or event format.

## Next Steps

- [Why Atscript In Moost?](/packages/moost-validator/why-atscript-validation) — what this package removes from your handlers
- [Validation Pipe](/packages/moost-validator/validation-pipe) — global setup, PATCH payloads, unknown props, and common options
- [Error Handling](/packages/moost-validator/error-handling) — how the built-in HTTP error transform works

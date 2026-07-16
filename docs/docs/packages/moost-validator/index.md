# @atscript/moost-validator

Use Atscript models as runtime validation contracts in Moost handlers.

`@atscript/moost-validator` gives you three small integration points:

- `coercionPipe()` converts string route params and query values into the scalar shapes the handler's type expects
- `validatorPipe()` validates handler arguments whose runtime type comes from an `.as` model
- `validationErrorTransform()` turns `ValidatorError` into `HttpError(400)` for HTTP apps

::: tip Best Path For New Users
If you are evaluating this package for the first time, read these in order:

1. [Why Atscript In Moost?](/packages/moost-validator/why-atscript-validation)
2. [Validation Pipe](/packages/moost-validator/validation-pipe)
3. [Coercion Pipe](/packages/moost-validator/coercion-pipe)
4. [Error Handling](/packages/moost-validator/error-handling)
   :::

## What This Package Gives You

- one `.as` model for TypeScript types and runtime validation
- automatic validation in Moost handlers
- the same Atscript validator options you already use elsewhere
- optional HTTP-friendly error conversion when you use `@moostjs/event-http`

## Public API

Each integration point has a global form (apply app-wide) and a decorator form (apply to one controller or handler):

| Export                          | Form                | Use it to                                                              |
| ------------------------------- | ------------------- | --------------------------------------------------------------------- |
| `coercionPipe(opts?)`           | global pipe         | Coerce string params/query toward the handler's type — see [Coercion Pipe](/packages/moost-validator/coercion-pipe) |
| `UseCoercionPipe(opts?)`        | method/class decorator | Same coercion, scoped to one controller or handler                  |
| `validatorPipe(opts?)`          | global pipe         | Validate handler args against their `.as` type — see [Validation Pipe](/packages/moost-validator/validation-pipe) |
| `UseValidatorPipe(opts?)`       | method/class decorator | Same validation, scoped to one controller or handler               |
| `validationErrorTransform()`    | global interceptor  | Convert `ValidatorError` → `HttpError(400)` — see [Error Handling](/packages/moost-validator/error-handling) |
| `UseValidationErrorTransform()` | method decorator    | Same conversion, scoped to one handler                                |

`validatorPipe` accepts `Partial<TValidatorOptions>` (the standard Atscript [validator options](/packages/typescript/validation)); `coercionPipe` accepts `TCoercionOptions` (`sources` — which param sources to coerce). The two compose: coercion runs at `TRANSFORM` priority, validation at `VALIDATE`, so `applyGlobalPipes(coercionPipe(), validatorPipe())` coerces first, then validates.

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
- `@moostjs/event-http`

::: tip Non-HTTP setups
`@moostjs/event-http` is a hard peer because the package re-exports `validationErrorTransform()`, which references `HttpError` from that package. If you build a non-HTTP Moost app you can still install `@moostjs/event-http` to satisfy the peer and simply ignore the HTTP transform — only `validatorPipe()` is used in that case.
:::

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
- [Coercion Pipe](/packages/moost-validator/coercion-pipe) — numeric/boolean route params and query DTOs without manual parsing
- [Error Handling](/packages/moost-validator/error-handling) — how the built-in HTTP error transform works

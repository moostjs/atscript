# Moost Validator

`@atscript/moost-validator` integrates Atscript's runtime validation into the [Moost framework](https://moost.org). It provides a validation pipe and an error interceptor that let you validate handler parameters automatically — no manual `validate()` calls needed.

When a handler parameter is typed with an Atscript-generated type (e.g., `@Body() dto: CreateUserDto`), the pipe calls the type's built-in `.validator().validate(value)` method before your handler runs. If validation fails, the interceptor converts the error into a structured `400 Bad Request` response.

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

This package requires the following peer dependencies:

| Package                | Purpose                                                    |
| ---------------------- | ---------------------------------------------------------- |
| `@atscript/core`       | Core parser and AST                                        |
| `@atscript/typescript` | Provides `Validator`, `ValidatorError`, and type utilities |
| `moost`                | Framework runtime (pipes, interceptors, DI)                |
| `@moostjs/event-http`  | HTTP adapter (for `HttpError` in error transform)          |

## Quick Start

### 1. Define a DTO in Atscript

```atscript
// create-user.dto.as
@label "Create User"
export interface CreateUserDto {
  @label "Display name"
  @expect.minLength 2
  @expect.maxLength 50
  name: string

  @expect.pattern "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", "u", "Invalid email"
  email: string

  @expect.minLength 8
  password: string

  roles?: string[]
}
```

### 2. Register the pipe and interceptor

```typescript
import { Moost } from 'moost'
import { MoostHttp } from '@moostjs/event-http'
import { validatorPipe, validationErrorTransform } from '@atscript/moost-validator'
import { UsersController } from './users.controller'

const app = new Moost()
app.adapter(new MoostHttp())

// Enable validation for all handlers
app.applyGlobalPipes(validatorPipe())

// Convert validation errors to 400 responses
app.applyGlobalInterceptors(validationErrorTransform())

app.registerControllers(UsersController)
await app.init()
```

### 3. Use the DTO in a controller

```typescript
import { Controller } from 'moost'
import { Post, Body } from '@moostjs/event-http'
import { CreateUserDto } from './create-user.dto.as'

@Controller('users')
export class UsersController {
  @Post()
  async create(@Body() dto: CreateUserDto) {
    // dto is guaranteed valid — validation ran before this code
    return { id: '123', ...dto }
  }
}
```

If the request body fails validation, the client receives:

```json
{
  "statusCode": 400,
  "message": "email: Invalid email",
  "errors": [
    { "path": "email", "message": "Invalid email" },
    { "path": "password", "message": "Length must be >= 8" }
  ]
}
```

## How It Works

1. **Compile** — Atscript compiles `.as` files into JavaScript classes that carry type metadata and a `.validator()` factory method.
2. **Resolve** — Moost's resolve pipe extracts handler arguments (`@Body()`, `@Param()`, `@Query()`, etc.).
3. **Validate** — The validation pipe checks if the parameter type is an Atscript annotated type (via `isAnnotatedType()`). If so, it instantiates a `Validator` and calls `.validate(value)`.
4. **Catch** — If validation fails, `ValidatorError` is thrown. The error interceptor catches it and converts it to an `HttpError(400)` with structured error details.
5. **Execute** — If validation passes, the handler runs with guaranteed-valid data.

## API at a Glance

| Export                          | Type                | Description                                             |
| ------------------------------- | ------------------- | ------------------------------------------------------- |
| `validatorPipe(opts?)`          | Pipe factory        | Validates parameters against their Atscript type        |
| `UseValidatorPipe(opts?)`       | Decorator           | Applies `validatorPipe` to a class or method            |
| `validationErrorTransform()`    | Interceptor factory | Converts `ValidatorError` into `HttpError(400)`         |
| `UseValidationErrorTransform()` | Decorator           | Applies `validationErrorTransform` to a class or method |

See [Validation Pipe](./validation-pipe) and [Error Handling](./error-handling) for detailed usage.

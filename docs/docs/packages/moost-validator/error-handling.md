# Error Handling

When validation fails, the validation pipe throws a `ValidatorError`. Without an error interceptor, Moost treats this as an unhandled exception and returns `500 Internal Server Error`. The `validationErrorTransform` interceptor catches `ValidatorError` and converts it into a structured `HttpError(400)` response.

## Applying the Interceptor

### Global

```typescript
import { Moost } from 'moost'
import { validationErrorTransform } from '@atscript/moost-validator'

const app = new Moost()
app.applyGlobalInterceptors(validationErrorTransform())
```

### Per Controller

```typescript
import { Controller } from 'moost'
import { UseValidationErrorTransform } from '@atscript/moost-validator'

@UseValidationErrorTransform()
@Controller('users')
export class UsersController {
  // all handlers in this controller use the error transform
}
```

### Per Handler

```typescript
import { Controller } from 'moost'
import { Post, Body } from '@moostjs/event-http'
import { UseValidationErrorTransform } from '@atscript/moost-validator'

@Controller('users')
export class UsersController {
  @Post()
  @UseValidationErrorTransform()
  async create(@Body() dto: CreateUserDto) {}
}
```

## Response Format

When validation fails, the client receives a `400 Bad Request` response with structured error details:

```json
{
  "statusCode": 400,
  "message": "name: Length must be >= 2",
  "errors": [
    { "path": "name", "message": "Length must be >= 2" },
    { "path": "email", "message": "Invalid email" }
  ]
}
```

- **`statusCode`** — always `400`
- **`message`** — the first error's path and message (from `ValidatorError.message`)
- **`errors`** — full array of `{ path, message }` objects from the validator

### Nested Paths

For nested objects, `path` uses dot notation:

```json
{
  "statusCode": 400,
  "message": "address.city: Expected string, got number",
  "errors": [
    { "path": "address.city", "message": "Expected string, got number" },
    { "path": "address.zip", "message": "Length must be >= 5" }
  ]
}
```

### Union Type Errors

When validating union types, errors may include `details` with nested errors for each variant:

```json
{
  "path": "payment",
  "message": "Value does not match any variant",
  "details": [
    { "path": "payment.cardNumber", "message": "Required" },
    { "path": "payment.iban", "message": "Required" }
  ]
}
```

## How It Works Internally

The interceptor is registered at `CATCH_ERROR` priority. It hooks into both the `after` and `onError` lifecycle stages:

1. When a `ValidatorError` is thrown by the validation pipe (or manually), the interceptor catches it.
2. It wraps the error into an `HttpError(400)` from `@moostjs/event-http`.
3. The HTTP adapter serializes this as a JSON response with status code 400.

Only `ValidatorError` instances are caught. All other errors pass through unchanged.

## Custom Error Handling

If the built-in error transform doesn't fit your needs, you can write your own interceptor:

```typescript
import { defineInterceptorFn, TInterceptorPriority } from 'moost'
import { ValidatorError } from '@atscript/typescript/utils'

const customValidationErrorHandler = () =>
  defineInterceptorFn((before, after, onError) => {
    onError((error, reply) => {
      if (error instanceof ValidatorError) {
        reply({
          status: 'error',
          code: 'VALIDATION_FAILED',
          errors: error.errors.map(e => ({
            field: e.path,
            reason: e.message,
          })),
        })
      }
    })
  }, TInterceptorPriority.CATCH_ERROR)

app.applyGlobalInterceptors(customValidationErrorHandler())
```

## Combining Pipe and Interceptor

For a typical setup, register both the pipe and the interceptor globally:

```typescript
import { Moost } from 'moost'
import { MoostHttp } from '@moostjs/event-http'
import { validatorPipe, validationErrorTransform } from '@atscript/moost-validator'

const app = new Moost()
app.adapter(new MoostHttp())
app.applyGlobalPipes(validatorPipe())
app.applyGlobalInterceptors(validationErrorTransform())
```

Or apply both at the controller level using decorators:

```typescript
import { Controller } from 'moost'
import { UseValidatorPipe, UseValidationErrorTransform } from '@atscript/moost-validator'

@UseValidatorPipe()
@UseValidationErrorTransform()
@Controller('users')
export class UsersController {
  // all handlers validated with proper error responses
}
```

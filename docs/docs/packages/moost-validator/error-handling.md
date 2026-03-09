# Error Handling

`validationErrorTransform()` is the HTTP-focused companion to `validatorPipe()`.

It catches `ValidatorError` and turns it into `HttpError(400)`, so your handlers do not need to shape validation responses manually.

## The Most Common HTTP Setup

```typescript
import { Moost } from 'moost'
import { MoostHttp } from '@moostjs/event-http'
import { validatorPipe, validationErrorTransform } from '@atscript/moost-validator'

const app = new Moost()
app.adapter(new MoostHttp())

app.applyGlobalPipes(validatorPipe())
app.applyGlobalInterceptors(validationErrorTransform())
```

This is the best default for HTTP apps.

## What The Built-In Transform Does

When it catches `ValidatorError`, it creates:

- `HttpError(400)`
- `message` from `ValidatorError.message`
- `statusCode: 400`
- `_body` containing the full `error.errors` array

That is the contract implemented by the package today.

## Why The Docs Do Not Promise One Exact JSON Shape

The transform produces an `HttpError`. The final serialized HTTP body depends on how your HTTP layer renders that error.

So the stable guarantee is:

- failed validation becomes HTTP 400
- the top-level message comes from the first validation error
- the full validator error list is attached to the HTTP error payload

If your API needs a very specific error envelope, write your own interceptor.

## Apply The Transform Per Controller Or Handler

### Per Controller

```typescript
import { Controller } from 'moost'
import { UseValidationErrorTransform } from '@atscript/moost-validator'

@UseValidationErrorTransform()
@Controller('users')
export class UsersController {}
```

### Per Handler

```typescript
import { Controller } from 'moost'
import { Body, Post } from '@moostjs/event-http'
import { UseValidationErrorTransform } from '@atscript/moost-validator'
import { CreateUserDto } from './create-user.dto.as'

@Controller('users')
export class UsersController {
  @Post()
  @UseValidationErrorTransform()
  async create(@Body() dto: CreateUserDto) {}
}
```

## Write A Custom Error Shape

If you want a different HTTP response format, create your own interceptor:

```typescript
import { ValidatorError } from '@atscript/typescript/utils'
import { HttpError } from '@moostjs/event-http'
import { defineInterceptor, TInterceptorPriority } from 'moost'

const customValidationErrors = () =>
  defineInterceptor(
    {
      error(error, reply) {
        if (error instanceof ValidatorError) {
          reply(
            new HttpError(400, {
              statusCode: 400,
              message: 'Validation failed',
              code: 'VALIDATION_FAILED',
              errors: error.errors.map(item => ({
                field: item.path,
                reason: item.message,
              })),
            })
          )
        }
      },
    },
    TInterceptorPriority.CATCH_ERROR
  )
```

This is the right approach when you want a stable public API envelope instead of the package's default `HttpError` payload.

## Non-HTTP Apps

The built-in transform is intentionally HTTP-specific because it returns `HttpError`.

If your Moost app uses another adapter:

- keep `validatorPipe()`
- replace `validationErrorTransform()` with an interceptor that maps `ValidatorError` into your own event or reply shape

## Next Steps

- [Validation Pipe](/packages/moost-validator/validation-pipe) — the validator integration itself
- [Validation Guide](/packages/typescript/validation) — validator options and lower-level behavior
- [Why Atscript In Moost?](/packages/moost-validator/why-atscript-validation) — when this package is the right fit

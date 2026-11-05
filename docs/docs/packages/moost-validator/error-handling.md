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

When it catches `ValidatorError`, it creates `HttpError(400)` with the body:

- `message` — the first error as `path: message` (just `message` for an error at the root), the same text as `ValidatorError.message`
- `statusCode: 400`
- `errors` — the full `error.errors` array: each entry with `path`, `message`, `code`, `params`, and `custom: true` for app text (`details` for a union error), see [Error Codes](/packages/typescript/validation-reference#error-codes)

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "name: Expected minimum length of 3 characters, got 1 characters",
  "errors": [
    {
      "path": "name",
      "message": "Expected minimum length of 3 characters, got 1 characters",
      "code": "MIN_LENGTH",
      "params": { "min": 3, "actual": 1 }
    }
  ]
}
```

This is the same envelope `@atscript/moost-db` answers with, so a client parses one format. With a translator registered in `moost` (`setTranslator()`), the messages are translated into the request's locale; `code` and `params` stay as they are. See [Translating Texts](/packages/typescript/i18n).

::: warning Upgrading from 0.2.4 or earlier
The error list was under `_body` before. It is now `errors`; `_body` is gone. Update clients that read `body._body` to read `body.errors` — the entries are unchanged.
:::

If your API needs a different error envelope, write your own interceptor (see [Write A Custom Error Shape](#write-a-custom-error-shape)).

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

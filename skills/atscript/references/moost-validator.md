# Moost validator

`@atscript/moost-validator` wires the atscript `Validator` into [Moost](https://moost.org) so controller params typed with atscript interfaces are validated automatically.

## Install

```bash
npm install @atscript/moost-validator @atscript/typescript @atscript/core moost @moostjs/event-http
```

Peer deps: `moost`, `@moostjs/event-http` (HTTP apps), `@atscript/core`, `@atscript/typescript`.

## Two primitives

1. **`validatorPipe(opts?)`** — Moost pipe, runs during param resolution. Per param, checks if the TS type is an atscript interface; if yes, runs `Validator.validate(...)` and replaces the value with the narrowed/coerced output. Otherwise passes through.
2. **`validationErrorTransform()`** — Moost interceptor. Catches `ValidatorError` from the pipe; raises `new HttpError(400, { statusCode, message, _body: error.errors })`. Moost serializes `_body` as the response body — clients get the raw `[{ path, message }, …]` array as the 400 payload.

## Global setup

```ts
import { Moost } from 'moost'
import { MoostHttp } from '@moostjs/event-http'
import { validatorPipe, validationErrorTransform } from '@atscript/moost-validator'

const app = new Moost()
app.applyGlobalPipes(validatorPipe())
app.applyGlobalInterceptors(validationErrorTransform())

app.adapter(new MoostHttp())
await app.init()
await app.listen(3000)
```

Typical: every method validates every atscript-typed param; every `ValidatorError` → 400.

## Per-handler decorators

- `@UseValidatorPipe(opts?)` — apply `validatorPipe(opts)` to a controller / method / param.
- `@UseValidationErrorTransform()` — apply the error interceptor to a single handler.

```ts
import { Controller, Post, Body } from 'moost'
import { UseValidatorPipe } from '@atscript/moost-validator'
import { User } from './models/user.as'

@Controller('users')
@UseValidatorPipe({ unknownProps: 'strip' })
export class UsersController {
  @Post()
  create(@Body() user: User) {
    // `user` is validated + stripped before this line
  }
}
```

## Pipe options

Same [`ValidatorOptions`](validation.md) as `Validator`:

```ts
validatorPipe({
  partial: 'deep',
  unknownProps: 'strip',
  errorLimit: 10,
  plugins: [myCustomPlugin],
})
```

Global opts cascade to every validated param; override per-handler with `@UseValidatorPipe({ … })`.

## Error shape

Wire-level JSON = raw `ValidatorError.errors` array:

```json
[
  { "path": "email", "message": "Must match pattern /^.+@.+$/" },
  { "path": "age", "message": "Must be >= 0" }
]
```

`statusCode` / `message` live on the `HttpError` itself (used by Moost for the status line + default text), not in the JSON payload. Want `{ errors: [...] }` wrapping? Write a thin post-interceptor.

Interceptor does **not** swallow other errors — only `ValidatorError` is converted; everything else propagates.

## Custom plugins

Pass `TValidatorPlugin` via `validatorPipe({ plugins: [...] })`. See [validation.md](validation.md#validator-plugins).

Validators are **synchronous** — plugins return `boolean | undefined`, not `Promise`. Long-running checks (DB, HTTP) must live in a separate interceptor or the handler body, not a validator plugin.

## Non-HTTP adapters

`validatorPipe()` is a plain Moost pipe — works wherever Moost runs (`@moostjs/event-cli`, `@moostjs/event-wf`, …). `validationErrorTransform()` is HTTP-specific (sets response status); for non-HTTP adapters, write a small interceptor that maps `ValidatorError` to the adapter's error shape.

## See also

- [validation.md](validation.md) — `Validator`, `ValidatorError`, options.
- [runtime.md](runtime.md) — how the pipe recognizes atscript-typed params.
- Moost: https://moost.org.

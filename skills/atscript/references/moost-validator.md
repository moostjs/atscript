# Moost validator

`@atscript/moost-validator` wires the atscript `Validator` into [Moost](https://moost.org) so controller params typed with atscript interfaces (or primitive aliases — see [primitives.md](primitives.md#aliases-as-decorated-param-types)) are validated automatically. Works on every Moost adapter (HTTP, CLI, workflow, …); the validator pipe is adapter-agnostic.

## Install

```bash
npm install @atscript/moost-validator @atscript/typescript @atscript/core moost
# plus whichever adapter(s) you use
npm install @moostjs/event-http     # HTTP
npm install @moostjs/event-cli      # CLI
```

Peer deps: `moost`, `@atscript/core`, `@atscript/typescript`. Adapter packages are independent.

## Three primitives

1. **`coercionPipe(opts?)`** — Moost pipe at `TPipePriority.TRANSFORM` (runs before VALIDATE). Coerces string-transport input toward the param's declared type: annotated types via `coerceForType` (`@atscript/typescript/utils`), plain `Number`/`Boolean`/`Date` design types via direct parsing. Never throws, never validates — unparsable input passes through for the validator to report.
2. **`validatorPipe(opts?)`** — Moost pipe at `TPipePriority.VALIDATE`. Per param, checks `isAnnotatedType(targetMeta.type)`; if yes, runs `validator.validate(value)` and **returns the original `value` unchanged** (no coercion, no narrowing). Otherwise passes through. Skips validation when the param is `@Optional()` and the value is `undefined` / `null`.
3. **`validationErrorTransform()`** — Moost interceptor for **HTTP**. Catches `ValidatorError` from the pipe; raises an `HttpError` carrying the raw `error.errors` array as the 400 payload. Non-HTTP adapters write their own (see CLI example below).

## Global setup

`validatorPipe()` is the same pipe on every adapter. The error transform differs: `validationErrorTransform()` is HTTP-specific (raises `HttpError`); other adapters need a thin interceptor that maps `ValidatorError` to whatever shape that adapter expects.

### HTTP

```ts
import { Moost } from 'moost'
import { MoostHttp } from '@moostjs/event-http'
import { coercionPipe, validatorPipe, validationErrorTransform } from '@atscript/moost-validator'

const app = new Moost()
app.applyGlobalPipes(coercionPipe(), validatorPipe())
app.applyGlobalInterceptors(validationErrorTransform())

app.adapter(new MoostHttp())
await app.init()
await app.listen(3000)
```

Every method coerces route/query strings, then validates every atscript-typed param; every `ValidatorError` → 400.

## Coercion rules (`coercionPipe`)

Enables `@Param('offset') offset: KafkaOffset` where `KafkaOffset` is `@expect.int @expect.min 0 → number` — no manual `Number.parseInt`.

| #   | Rule                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Gates on `paramSource`, not value shape. Default sources: `ROUTE` (`@Param`), `QUERY` (`@Query()`), `QUERY_ITEM` (`@Query('x')`). `BODY` excluded — coercing JSON bodies silently loosens the API. |
| 2   | `coercionPipe({ sources: [...] })` **replaces** the default list (add `'BODY'` explicitly to opt in). Params with no `paramSource` (DI injections) are never touched. |
| 3   | number ← trimmed non-empty string via `Number()`, finite only. boolean ← `"true"/"1"/"false"/"0"`. string/decimal never changed. Unions: declared order, first successful parse wins (literals must match exactly). Objects (`@Query()` DTOs): recurse into props, input never mutated. Arrays: per item. |
| 4   | Coercion converts representation only — constraints (`@expect.*`) remain `validatorPipe`'s job. Unparsable input passes through unchanged so the validator reports the proper error. |
| 5   | Adoption order: `coercionPipe()` globally is safe anywhere (never rejects); adding `validatorPipe()` globally to an existing app is behavior-tightening (newly enforces every annotated param) — roll it out per-controller or behind a smoke test. |
| 6   | Use **value imports** for `.as` types in handler signatures — `import type` erases the runtime class and silently disables both pipes (watch `verbatimModuleSyntax`). |
| 7   | tsc `emitDecoratorMetadata` collapses scalar aliases to `Number` — coercion still works (design-type fallback), constraints don't validate. Portable fix: group params into an `.as` interface DTO (`@Query()`); interfaces survive tsc. Bundler builds (Vite/rolldown, swc) preserve alias identity — both work. |

`@UseCoercionPipe(opts?)` — per controller/method sugar, like `@UseValidatorPipe`.

### CLI (or any non-HTTP adapter)

```ts
import { CliApp } from '@moostjs/event-cli'
import { Moost, defineErrorInterceptor } from 'moost'
import { ValidatorError } from '@atscript/typescript/utils'
import { validatorPipe } from '@atscript/moost-validator'

const cliErrorTransform = () =>
  defineErrorInterceptor((err, reply) => {
    if (err instanceof ValidatorError) {
      const msg = err.errors
        .map(e => (e.path ? `${e.path}: ${e.message}` : e.message))
        .join('\n')
      reply(new Error(msg))
    }
  })

const app = new Moost()
app.applyGlobalPipes(validatorPipe())
app.applyGlobalInterceptors(cliErrorTransform())
app.adapter(new CliApp())
await app.init()
```

`defineErrorInterceptor`'s `reply()` **replaces** the error the adapter handles; it does **not** return a successful response. Pass an `Error` (or adapter-specific subclass like `HttpError`) — adapters read `.message` / `.statusCode` off the thrown value. Passing a plain string crashes adapters that property-access on the rejected value.

## Per-handler decorators

- `@UseValidatorPipe(opts?)` — apply `validatorPipe(opts)` to a controller / method / param.
- `@UseValidationErrorTransform()` — apply the error interceptor to a single handler.

```ts
import { Controller } from 'moost'
import { Post, Body } from '@moostjs/event-http'
import { UseValidatorPipe } from '@atscript/moost-validator'
import { User } from './models/user.as'

@Controller('users')
@UseValidatorPipe({ unknownProps: 'strip' })
export class UsersController {
  @Post()
  create(@Body() user: User) {
    // `user` is validated (and stripped in-place when unknownProps: 'strip') before this line
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

## Optional params

`@Optional()` params (typical for `@CliOption()` flags, optional `@Query()` strings) skip validation when the value is `undefined` / `null`. A required `WikiName` parameter on a CLI flag declared as `@CliOption('wiki') @Optional() wiki: WikiName` works as expected — no manual wrapper needed. Validation still runs when a value **is** provided.

## See also

- [validation.md](validation.md) — `Validator`, `ValidatorError`, options.
- [runtime.md](runtime.md) — how the pipe recognizes atscript-typed params.
- Moost: https://moost.org.

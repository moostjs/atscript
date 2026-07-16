# Coercion Pipe

`coercionPipe(opts?)` converts string-transport input — route params and query values — into the scalar shapes your handler's type expects, before validation runs.

HTTP route params and query strings always arrive as strings. Without coercion you end up hand-rolling `Number.parseInt` in controllers. With the pipe, a validated numeric alias works directly as a param type:

```atscript
@expect.int
@expect.min 0
export type KafkaOffset = number
```

```typescript
import { Controller } from 'moost'
import { Get, Param } from '@moostjs/event-http'
import { KafkaOffset } from './types.as'

@Controller('topics')
export class TopicsController {
  @Get(':topic/:offset')
  async read(@Param('offset') offset: KafkaOffset) {
    // offset is a number here — coerced, then validated (@expect.int, @expect.min 0)
  }
}
```

`"42"` becomes `42`; `"abc"` passes through unchanged and the validator reports a structured error (a 400 with the [error transform](/packages/moost-validator/error-handling) in place).

## The Recommended Setup

Register coercion ahead of validation — the pipe runs at `TRANSFORM` priority, before `VALIDATE`, so this pair composes correctly:

```typescript
import { Moost } from 'moost'
import { coercionPipe, validatorPipe, validationErrorTransform } from '@atscript/moost-validator'

const app = new Moost()
app.applyGlobalPipes(coercionPipe(), validatorPipe())
app.applyGlobalInterceptors(validationErrorTransform())
```

::: tip Adopting in an existing app
Adding `validatorPipe()` globally to an existing app newly enforces validation on every already-annotated param — a behavior-tightening change. Adopt `coercionPipe()` globally first (it never rejects anything), and roll out `validatorPipe` per-controller via `UseValidatorPipe()` or behind a smoke-test pass.
:::

## What Gets Coerced

Coercion converts representation only — constraints (`@expect.int`, `@expect.min`, patterns) remain the validator's job:

- **number** — trimmed, non-empty strings parsed with `Number()`; only finite results are accepted
- **boolean** — `"true"`/`"1"` → `true`, `"false"`/`"0"` → `false`
- **unions** — each scalar branch tried in declared order; the first successful parse wins
- **objects** — recurses into props when the input is a plain object, which covers `@Query()` DTOs where every field arrives as a string
- **arrays** — items are coerced individually
- **string / decimal** — never changed

Unparsable input is passed through untouched, so the validator produces the proper error message instead of the pipe throwing.

Plain design types also work: `offset: number`, `flag: boolean`, and `since: Date` params are coerced directly from the emitted `design:paramtypes`, even without an Atscript type.

## Which Params Are Coerced

The pipe gates on the param's *source*, not on the value's shape. By default it coerces the string-transport sources only:

| Source       | Decorator          | Coerced by default |
| ------------ | ------------------ | ------------------ |
| `ROUTE`      | `@Param('name')`   | ✅                 |
| `QUERY`      | `@Query()`         | ✅                 |
| `QUERY_ITEM` | `@Query('name')`   | ✅                 |
| `BODY`       | `@Body()`          | ❌                 |

`BODY` is deliberately excluded: JSON bodies already carry real numbers and booleans, and silently accepting `"42"` where `42` is expected loosens your API contract. Opt in explicitly if you want it:

```typescript
app.applyGlobalPipes(
  coercionPipe({ sources: ['ROUTE', 'QUERY', 'QUERY_ITEM', 'BODY'] }),
  validatorPipe()
)
```

Note that `sources` replaces the default list, it does not extend it.

## Per Controller Or Handler

`UseCoercionPipe(opts?)` is sugar for `@Pipe(coercionPipe(opts))`:

```typescript
import { Controller } from 'moost'
import { Get, Query } from '@moostjs/event-http'
import { UseCoercionPipe } from '@atscript/moost-validator'
import { SearchQuery } from './queries.as'

@Controller('products')
export class ProductsController {
  @Get('search')
  @UseCoercionPipe()
  async search(@Query() query: SearchQuery) {
    // query.limit, query.offset are numbers; query.inStock is a boolean
  }
}
```

## Build Toolchain Caveats

Both pipes read the parameter's emitted `design:paramtypes` metadata, and what gets emitted depends on your toolchain:

- **Use value imports for `.as` types in handler signatures.** `import type { KafkaOffset } from './types.as'` erases the runtime class — the emitted type collapses to `Object` and both pipes silently skip the param. Watch for `verbatimModuleSyntax` pushing imports toward `import type`.
- **Bundler builds (Vite/rolldown, swc) preserve alias identity.** A scalar `.as` alias like `KafkaOffset` reaches the pipe as the annotated class — coercion *and* constraint validation both work.
- **tsc `emitDecoratorMetadata` collapses scalar aliases.** Under a plain `tsc` build, `offset: KafkaOffset` emits as `Number`: coercion still works via the design-type fallback, but the alias's constraints are not validated. The portable fix is to group params into an `.as` **interface** DTO (interfaces emit as `declare class` and survive tsc serialization) and take it via `@Query()`.

## Next Steps

- [Validation Pipe](/packages/moost-validator/validation-pipe) — the validation half of the pair, PATCH payloads, unknown props
- [Error Handling](/packages/moost-validator/error-handling) — convert `ValidatorError` into HTTP 400 responses
- [Validation Reference](/packages/typescript/validation-reference) — `coerceForType` and the low-level validator API

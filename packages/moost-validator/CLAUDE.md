# @atscript/moost-validator

Moost framework integration that brings first-class Atscript type support into Moost. Automatically applies `.as`-defined validation constraints when Atscript types are used in Moost handlers (e.g., `@Body() data: MyType` triggers automatic validation).

## Key Source Files

```
src/
  index.ts                - Package entry point; re-exports pipe and error transform
  as-validator.pipe.ts    - Moost pipe that runs Atscript validation on handler parameters
  error-transform.ts      - Moost interceptor that converts ValidatorError into HttpError(400)
```

This is a very small, focused package (3 source files). All validation logic lives upstream in `@atscript/typescript`.

## Public API

### Pipe
- `validatorPipe(opts?)` -- Factory returning a pipe that validates at `VALIDATE` priority
- `UseValidatorPipe(opts?)` -- Decorator sugar for `@Pipe(validatorPipe(opts))`

### Interceptor
- `validationErrorTransform()` -- Catches `ValidatorError`, wraps into `HttpError(400)`
- `UseValidationErrorTransform()` -- Decorator sugar for `@Intercept(...)`

### Options (`Partial<TValidatorOptions>`)
- `partial` -- `boolean | 'deep' | function` -- makes properties optional (useful for PATCH)
- `unknwonProps` -- `'strip' | 'ignore' | 'error'` -- unknown property handling
- `errorLimit` -- max errors before stopping
- `plugins` -- array of `TValidatorPlugin` functions

## How Validation Works

1. `.as` files compile to JS classes with `.validator(opts)` factory and `.metadata` constraints.
2. `validatorPipe` checks if the parameter type satisfies `isAnnotatedType()`.
3. If so, instantiates a `Validator` and calls `.validate(value)`.
4. On failure, `ValidatorError` is thrown with structured `errors[]`.
5. `validationErrorTransform` catches it and returns `HttpError(400)`.

## Key commands

```bash
pnpm --filter @atscript/moost-validator test  # Run tests
pnpm build                                     # Build all from repo root
```

## Important patterns

- **Pass-through pipe**: `validatorPipe` returns value unchanged -- validates or throws, no coercion.
- **Global vs per-handler**: Can be applied globally via `app.applyGlobalPipes()` or per-handler via decorators.
- **Zero runtime dependencies**: Everything via peer deps (`@atscript/core`, `@atscript/typescript`, `moost`, `@moostjs/event-http`).

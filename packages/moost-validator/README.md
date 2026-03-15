<p align="center">
  <img src="https://atscript.moost.org/logo.svg" alt="Atscript" width="120" />
</p>

<h1 align="center">@atscript/moost-validator</h1>

<p align="center">
  <strong>Define your models once</strong> — get TypeScript types, runtime validation, and DB metadata from a single <code>.as</code> model.
</p>

<p align="center">
  <a href="https://atscript.moost.org">Documentation</a> · <a href="https://atscript.moost.org/packages/moost-validator/">Moost Validator Guide</a>
</p>

---

Drop-in Atscript validation for the [Moost](https://moost.org) framework. Automatically validates handler parameters against `.as` model constraints — no manual `validate()` calls needed.

## Installation

```bash
pnpm add @atscript/moost-validator
```

Peer dependencies: `moost`, `@moostjs/event-http`, `@atscript/core`, `@atscript/typescript`.

## Quick Start

```ts
import { Moost } from 'moost'
import { validatorPipe, validationErrorTransform } from '@atscript/moost-validator'

const app = new Moost()
app.applyGlobalPipes(validatorPipe())
app.applyGlobalInterceptors(validationErrorTransform())
```

Any handler parameter typed with an Atscript-compiled class is now automatically validated. On failure, a `400 Bad Request` response is returned with structured error details.

## Features

- **Automatic validation** — runs during the `VALIDATE` pipeline stage before business logic
- **Composable** — apply globally or per-controller/handler via `@UseValidatorPipe()`
- **Clean error responses** — interceptor converts `ValidatorError` to `HttpError(400)`
- **Validator options** — `partial`, `unknownProps`, `errorLimit`, `plugins`
- **Zero runtime dependencies** — everything via peer deps

## Documentation

- [Moost Validator Guide](https://atscript.moost.org/packages/moost-validator/)
- [Full Documentation](https://atscript.moost.org)

## License

MIT

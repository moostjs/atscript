# @atscript/moost-validator

**Drop‑in atscript validation for Moost.** This package adds a tiny pipe and an interceptor that let you validate any handler argument, DTO, or DI‑injected value that comes from an `@mongo.collection` / `.as` model – no extra boilerplate, no manual `validate()` calls.

---

## Features

- 🛂 **Automatic validation** – if the parameter type has a `validator()` factory, we run it.
- ⚡ **Fast & sync** – validation happens in the `VALIDATE` pipeline stage before business logic.
- 🛠️ **Composable** – use as a decorator (`@UseValidatorPipe`) or apply globally.
- 🧩 **Nice errors out of the box** – interceptor converts `ValidatorError` → `HttpError(400)`.

---

## Installation

```bash
npm i @atscript/moost-validator
# Or
pnpm add @atscript/moost-validator
```

---

## Quick start

### 1. Register the pipe (pick one)

#### a) Globally – affects every parameter/property

```ts
import { Moost } from 'moost'
import { validatorPipe } from '@atscript/moost-validator'

const app = new Moost()
app.applyGlobalPipes(validatorPipe())
```

#### b) Per controller / handler

```ts
import { Controller, Pipe } from 'moost'
import { Post, Body } from '@moostjs/event-http'
import { UseValidatorPipe } from '@atscript/moost-validator'
import { CreateUserDto } from './user.dto.as'

@UseValidatorPipe() // controller‑wide
@Controller('users')
export class UsersController {
  @Post()
  @UseValidatorPipe() // or per‑method
  async create(@Body() dto: CreateUserDto) {}
}
```

### 2. Catch validation errors (optional)

Global:

```ts
import { validationErrorTransform } from '@atscript/moost-validator'

app.applyGlobalInterceptors(validationErrorTransform())
```

Per handler:

```ts
import { UseValidationErrorTransform } from '@atscript/moost-validator'

@Post()
@UseValidationErrorTransform()
async create(@Body() dto: CreateUserDto) {}
```

---

## API reference

| Export                          | Type            | Description                                                                                                                                                                       |
| ------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validatorPipe(opts?)`          | `PipeFn`        | Low‑level factory. Returns a pipe that runs `type.validator(opts).validate(value)` on the argument **if** the type was produced by atscript. Registered with priority `VALIDATE`. |
| `UseValidatorPipe(opts?)`       | `Decorator`     | Sugar over `validatorPipe`. Apply to a class, method, parameter, or property.                                                                                                     |
| `validationErrorTransform()`    | `InterceptorFn` | Catches `ValidatorError`, wraps it into `HttpError(400)` with `{ message, statusCode, _body }`. Priority `CATCH_ERROR`.                                                           |
| `UseValidationErrorTransform()` | `Decorator`     | Sugar over `validationErrorTransform()`.                                                                                                                                          |

### `opts` (`Partial<TValidatorOptions>`)

Any options accepted by `atscript.validator(opts)`. E.g. `{ abortEarly: false }`.

---

## How it works (under the hood)

1. **Pipe** checks metadata that Moost attaches to every parameter/property.
2. If the declared type has a `validator()` factory (i.e. it was generated from
   `.as` file with atscript), the pipe instantiates the validator **once** and
   runs `validate(value)`.
3. On failure the validator throws `ValidatorError`.
4. **Interceptor** catches that error and converts it to a standard Moost
   `HttpError` so your REST adapter sends a clean `400 Bad Request` body.

---

## License

MIT © 2025 Artem Maltsev

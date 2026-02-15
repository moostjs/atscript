# Validation Pipe

The validation pipe inspects each handler parameter at runtime. When the parameter's type is an Atscript annotated type — i.e., it was compiled from a `.as` file — the pipe calls `.validator(opts).validate(value)` to enforce type structure and `@expect.*` constraints.

The pipe runs at `VALIDATE` priority in Moost's pipeline, after data is resolved (`@Body()`, `@Param()`, etc.) but before your handler executes.

## Applying the Pipe

### Global

Register the pipe once and it applies to every handler in your application:

```typescript
import { Moost } from 'moost'
import { validatorPipe } from '@atscript/moost-validator'

const app = new Moost()
app.applyGlobalPipes(validatorPipe())
```

### Per Controller

Apply validation to all handlers in a controller:

```typescript
import { Controller } from 'moost'
import { UseValidatorPipe } from '@atscript/moost-validator'

@UseValidatorPipe()
@Controller('users')
export class UsersController {
  // all handlers in this controller are validated
}
```

### Per Handler

Apply validation to a single handler:

```typescript
import { Controller } from 'moost'
import { Post, Body } from '@moostjs/event-http'
import { UseValidatorPipe } from '@atscript/moost-validator'
import { CreateUserDto } from './create-user.dto.as'

@Controller('users')
export class UsersController {
  @Post()
  @UseValidatorPipe()
  async create(@Body() dto: CreateUserDto) {
    // validated
  }
}
```

### Using `@Pipe` Directly

`UseValidatorPipe(opts?)` is sugar for `@Pipe(validatorPipe(opts))`. You can use the lower-level form if you prefer:

```typescript
import { Pipe } from 'moost'
import { validatorPipe } from '@atscript/moost-validator'

@Post()
@Pipe(validatorPipe({ partial: true }))
async update(@Body() dto: UpdateUserDto) {}
```

## Options

`validatorPipe(opts?)` accepts a `Partial<TValidatorOptions>` object. These options are passed directly to Atscript's `Validator`:

### `partial`

Controls whether missing required properties are errors:

| Value | Behavior |
|-------|----------|
| `false` (default) | All required properties must be present |
| `true` | Missing properties are allowed at the top level |
| `'deep'` | Missing properties allowed at all nesting levels |
| `(type, path) => boolean` | Custom function for fine-grained control |

This is especially useful for PATCH endpoints:

```typescript
@Patch(':id')
@UseValidatorPipe({ partial: true })
async patch(@Param('id') id: string, @Body() dto: UpdateUserDto) {
  // only the provided fields are validated; missing fields are OK
}
```

For deeply nested partial updates:

```typescript
@UseValidatorPipe({ partial: 'deep' })
```

### `unknwonProps`

How to handle properties not defined in the Atscript type:

| Value | Behavior |
|-------|----------|
| `'error'` (default) | Report as a validation error |
| `'ignore'` | Silently accept unknown properties |
| `'strip'` | Delete unknown properties from the value |

```typescript
app.applyGlobalPipes(
  validatorPipe({ unknwonProps: 'strip' })
)
```

### `errorLimit`

Maximum number of errors to collect before stopping validation (default: `10`):

```typescript
validatorPipe({ errorLimit: 50 })
```

### `skipList`

A `Set<string>` of property paths to skip during validation:

```typescript
validatorPipe({ skipList: new Set(['internalId', 'audit.createdBy']) })
```

### `replace`

A function to dynamically replace type definitions during validation:

```typescript
validatorPipe({
  replace: (type, path) => path === 'status' ? customStatusType : type
})
```

### `plugins`

Array of `TValidatorPlugin` functions for custom validation logic. Plugins can accept (`true`), reject (`false`), or defer to default validation (`undefined`):

```typescript
import type { TValidatorPlugin } from '@atscript/typescript/utils'

const requireNonEmpty: TValidatorPlugin = (ctx, def, value) => {
  if (def.type.kind === '' && def.type.designType === 'string') {
    if (typeof value === 'string' && value.trim() === '') {
      ctx.error('String must not be empty')
      return false
    }
  }
  return undefined // fall through to default validation
}

app.applyGlobalPipes(
  validatorPipe({ plugins: [requireNonEmpty] })
)
```

See [Validation — Plugins](/packages/typescript/validation#plugins) for more on writing plugins.

## What Gets Validated

The pipe validates **any handler parameter** whose type is an Atscript annotated type — regardless of which resolver decorator provided the value. It doesn't matter whether the value came from `@Body()`, `@Param()`, `@Query()`, a custom `@Resolve()` decorator, or constructor injection in a `FOR_EVENT`-scoped class. If the parameter's type was compiled from a `.as` file, validation runs.

Parameters with non-Atscript types (plain `string`, `number`, regular TypeScript classes) are passed through unchanged.

### Primitive Types as DTOs

Unlike class-based validation libraries, Atscript types are not limited to objects. A parameter can be typed with a **primitive** Atscript type and still get validated:

```atscript
// types.as
export type Email = string.email
export type PositiveInt = number.int & number.positive
```

```typescript
import { Email, PositiveInt } from './types.as'

@Controller('notifications')
export class NotificationsController {
  @Post(':userId')
  async send(
    @Param('userId') userId: PositiveInt,
    @Body() email: Email,
  ) {
    // userId is validated as a positive integer
    // email is validated against the email pattern
  }
}
```

Semantic types like `string.email`, `number.positive`, and `number.int` carry built-in validation constraints — no `@expect.*` annotations needed. See [Primitives](/packages/typescript/primitives) for the full list.

## Beyond HTTP

Because the pipe integrates with Moost's generic pipeline system, it works with any Moost event adapter — HTTP, CLI, workflows, or custom adapters. Wherever Moost resolves handler parameters, the validation pipe can run.

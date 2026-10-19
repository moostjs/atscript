# Atscript Validation vs Others

How does Atscript validation compare to popular TypeScript validation libraries? This page puts three approaches side by side — same scenarios, same constraints.

- **Zod** — the most popular schema-first validation library
- **class-validator** — decorator-based DTOs, the NestJS standard

The [Performance](#performance) section goes wider and benchmarks Atscript against 12 validator engines from Zod, Valibot, Yup, Joi, Ajv, ArkType, class-validator and TypeBox.

## Simple Object

A user with a name (2–50 chars), email, and optional age (integer, 18+):

::: code-group

```atscript [Atscript]
export interface User {
  @expect.minLength 2
  @expect.maxLength 50
  name: string

  email: string.email

  @expect.min 18
  age?: number.int
}
```

```typescript [Zod]
import { z } from 'zod'

const User = z.object({
  name: z.string().min(2).max(50),
  email: z.string().email(),
  age: z.number().int().min(18).optional(),
})

type User = z.infer<typeof User>
```

```typescript [class-validator]
import { IsString, IsEmail, IsInt, IsOptional, MinLength, MaxLength, Min } from 'class-validator'

export class User {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string

  @IsEmail()
  email: string

  @IsOptional()
  @IsInt()
  @Min(18)
  age?: number
}
```

:::

Atscript reads like a type definition with constraints — because it is one. Zod is schema-first (you infer the type from it, so there's no duplication), but every field still needs `z.string()`, `z.number()`, etc. — the syntax is a schema DSL, not a type language. Class-validator requires a decorator for every property, including `@IsString()` for something already typed as `string`.

## Deeply Nested Objects

An order with an array of items and nested addresses:

::: code-group

```atscript [Atscript]
export interface Order {
  items: {
    @expect.minLength 1
    productId: string
    @expect.min 1
    quantity: number.int
  }[]
  shipping: {
    street: string
    city: string
    @expect.pattern "^[0-9]{5}$"
    zip: string
  }
  billing?: {
    street: string
    city: string
    @expect.pattern "^[0-9]{5}$"
    zip: string
  }
}
```

```typescript [Zod]
import { z } from 'zod'

const Order = z.object({
  items: z.array(
    z.object({
      productId: z.string().min(1),
      quantity: z.number().int().min(1),
    })
  ),
  shipping: z.object({
    street: z.string(),
    city: z.string(),
    zip: z.string().regex(/^[0-9]{5}$/),
  }),
  billing: z
    .object({
      street: z.string(),
      city: z.string(),
      zip: z.string().regex(/^[0-9]{5}$/),
    })
    .optional(),
})
```

```typescript [class-validator]
import {
  IsString,
  IsInt,
  Min,
  MinLength,
  Matches,
  ValidateNested,
  IsArray,
  IsOptional,
} from 'class-validator'
import { Type } from 'class-transformer'

export class OrderItem {
  @IsString()
  @MinLength(1)
  productId: string

  @IsInt()
  @Min(1)
  quantity: number
}

export class Address {
  @IsString()
  street: string

  @IsString()
  city: string

  @IsString()
  @Matches(/^[0-9]{5}$/)
  zip: string
}

export class Order {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItem)
  items: OrderItem[]

  @ValidateNested()
  @Type(() => Address)
  shipping: Address

  @IsOptional()
  @ValidateNested()
  @Type(() => Address)
  billing?: Address
}
```

:::

Atscript and Zod both support inline nested structures. Class-validator **must** declare a separate class for every nested shape, wired up with `@ValidateNested()` and `@Type(() => ClassName)` on each field. Arrays add `{ each: true }`. Optional fields add `@IsOptional()`.

## Primitive Types

Validating a standalone email string or a positive integer — not wrapped in an object:

::: code-group

```atscript [Atscript]
export type Email = string.email
export type PositiveInt = number.int & number.positive
```

```typescript [Zod]
const Email = z.string().email()
const PositiveInt = z.number().int().positive()
```

```typescript [class-validator]
// Not possible — class-validator requires a wrapper class:
class EmailDto {
  @IsEmail()
  value: string
}
// No way to validate a bare string or number
```

:::

Zod supports standalone primitives. Class-validator does not — every validated value must be a class property. In Atscript, `string.email` is a semantic type that carries the email regex as a built-in constraint. You can use it as a property type, a standalone parameter type, or compose it with `&`.

## Complex Types

Complex type compositions — unions, intersections, inline objects mixed with primitives — are where the syntax differences become most pronounced:

::: code-group

```atscript [Atscript]
export interface ApiResponse {
  result: string | number | {
    @expect.minLength 1
    data: unknown[]
    total: number.int
  }
  metadata?: {
    requestId: string.uuid
    timing: number.positive
  } | string
}
```

```typescript [Zod]
import { z } from 'zod'

const ApiResponse = z.object({
  result: z.union([
    z.string(),
    z.number(),
    z.object({
      data: z.array(z.unknown()).min(1),
      total: z.number().int(),
    }),
  ]),
  metadata: z
    .union([
      z.object({
        requestId: z.string().uuid(),
        timing: z.number().positive(),
      }),
      z.string(),
    ])
    .optional(),
})
```

```typescript [class-validator]
// Not practically achievable.
// class-validator has no support for union types.
// You would need custom validation logic for every
// union field, defeating the purpose of the library.
```

:::

Zod's `z.union()` works the same way as Atscript's `|` — it tries each variant and accepts the first match. The validation behavior is equivalent. The difference is syntax: Atscript writes `string | number | { ... }` inline, just like TypeScript. Zod requires `z.union([...])` with full schema definitions for every branch — same result, more ceremony. Class-validator has no union support at all.

### Intersections and Type Composition

Composing types with `&` is a common TypeScript pattern. In Atscript it works exactly as you'd expect — and the merged result validates correctly:

::: code-group

```atscript [Atscript]
export interface Timestamped {
  createdAt: string.isoDate
  updatedAt: string.isoDate
}

export interface Authored {
  @expect.minLength 1
  authorId: string
  authorName: string
}

// Compose with &
export type Article = Timestamped & Authored & {
  @expect.minLength 1
  @expect.maxLength 200
  title: string
  body: string
}

// Inline intersection works too
export interface Log {
  entry: { level: string } & { message: string }
}
```

```typescript [Zod]
import { z } from 'zod'

const Timestamped = z.object({
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

const Authored = z.object({
  authorId: z.string().min(1),
  authorName: z.string(),
})

// Option 1: .extend() — only adds new fields to one schema,
// so you need to spread .shape to combine two existing schemas
const Article = z.object({
  ...Timestamped.shape,
  ...Authored.shape,
  title: z.string().min(1).max(200),
  body: z.string(),
})

// Option 2: z.intersection() — validates both schemas
// independently (does NOT merge properties), and returns
// a ZodIntersection that loses .pick(), .omit(), .extend()
// const Article = z.intersection(Timestamped, Authored)

// Inline intersection of two objects:
const Log = z.object({
  entry: z.intersection(z.object({ level: z.string() }), z.object({ message: z.string() })),
  // ↑ entry is ZodIntersection, not ZodObject
})
```

```typescript [class-validator]
// Use class inheritance — but only single inheritance:
class Timestamped {
  @IsDateString() createdAt: string
  @IsDateString() updatedAt: string
}

class Authored {
  @IsString() @MinLength(1) authorId: string
  @IsString() authorName: string
}

// Can only extend one class — no multiple inheritance.
// Must manually duplicate properties from the second:
class Article extends Timestamped {
  // ← Authored properties copied by hand
  @IsString() @MinLength(1) authorId: string
  @IsString() authorName: string

  @IsString() @MinLength(1) @MaxLength(200) title: string
  @IsString() body: string
}
```

:::

In Atscript, `Type1 & Type2 & { ... }` merges all properties into a single validated type — just like TypeScript's `&`. Zod has no direct equivalent: `z.intersection()` does **not** merge properties into one object schema — it returns a `ZodIntersection` that loses object methods like `.pick()` and `.extend()`. To actually merge, you spread `.shape` into a new `z.object()` — a workaround, not a first-class feature. Class-validator only has single class inheritance — composing two unrelated types means manually copying properties.

## Validation Options

Real-world validation isn't just "validate or reject." PATCH endpoints need partial validation. Some fields should be skipped. Custom rules need to plug in.

### Partial Validation

Atscript supports partial validation as a first-class option when creating a validator:

```typescript
// Top-level partial — missing required fields are OK
Product.validator({ partial: true }).validate(data)

// Deep partial — missing fields at any nesting depth are OK
Product.validator({ partial: 'deep' }).validate(data)

// Custom — fine-grained control per type and path
Product.validator({
  partial: (type, path) => path.startsWith('metadata'),
}).validate(data)
```

Zod's `.partial()` works for top-level properties, but `.deepPartial()` — the recursive version needed for nested PATCH operations — was [deprecated in Zod 3.21 and removed in Zod v4](https://github.com/colinhacks/zod/issues/2854) with no built-in replacement. The Zod v4 changelog states: _"There is no direct alternative to this API."_ This has been a [significant pain point](https://github.com/colinhacks/zod/issues/2854) for the community, with over 100 reactions and over 70 comments asking for a solution. Developers must either use third-party packages, write their own recursive utilities, or maintain separate creation and update schemas.

Class-validator has no partial validation concept at all. You must define separate DTO classes for create and update operations, manually marking fields with `@IsOptional()` in the update variant.

### Plugins and Skip Lists

Atscript's validator accepts plugins — functions that intercept validation to add custom logic — and a `skipList` to exclude specific property paths:

```typescript
Product.validator({
  plugins: [myCustomPlugin],
  skipList: new Set(['internalId', 'audit.createdBy']),
}).validate(data)
```

A plugin receives the type definition, the value, and a context object with `error()` and `path`. It can accept the value (`true`), reject it (`false`), or fall through to default validation (`undefined`). This makes it straightforward to add domain-specific rules without modifying the type definition.

Zod achieves custom validation through `.refine()` and `.superRefine()` — methods that attach to individual schema nodes. There's no way to inject cross-cutting validation logic across an entire schema from the outside. Class-validator supports custom decorator-based validators, but each one requires defining a class that implements `ValidatorConstraintInterface`.

## Performance

An [open benchmark](https://github.com/prostojs/router-benchmark/tree/main/packages/validator-benchmark) validates the same `Order` model (nested objects, arrays, string/number constraints, a two-branch payment union) with the Atscript validator and the equivalent schema in 12 other engines: Zod 4 (`safeParse()`, `z.compile()` + `safeParse()`, `z.compile()` + `validate()`), Valibot, Yup, Joi, Ajv, ArkType (`T(input)`, `T.allows()`), class-validator and TypeBox (`Compile()`, `Value`). A pre-flight check makes sure every engine does the same work: they all accept and reject the same inputs, and on invalid input they detect the same violations. Each scenario runs in three unknown-property modes: `strip` removes undeclared properties, `passthrough` keeps them, `strict` rejects them. See the [benchmark README](https://github.com/prostojs/router-benchmark/blob/main/packages/validator-benchmark/README.md) for the methodology, the equivalence pre-flight and the fairness notes (copy vs in-place validation, how each library reports a failed union, emulated unions in Yup and class-validator).

Pick a mode and a scenario; hover a bar for the exact numbers:

<ValidatorBenchChart />

Some cells are not run, and the chart says why: boolean-only engines (Zod `validate()`, ArkType `allows()`) have no error report to compare on the all-errors scenarios, several libraries have no stop-at-first-error option, and Ajv and ArkType cannot strip unknown properties from this model's union (see the README).

Passthrough mode, the only mode where every engine runs, median ops/s (higher is better):

| Engine | Valid order | 50 items | Invalid, all errors | Invalid, first error | Union, 1st branch | Union, no match |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| TypeBox `Compile()` + `Check()` | 4.63M | 1.22M | 58.6k | 169k | 24.4M | 402k |
| ArkType `T.allows()` ¹ | 3.78M | 672k | — | 52.9M | 24.5M | — |
| ArkType `T(input)` | 3.60M | 678k | 32.4k | — | 18.2M | 310k |
| Zod `z.compile()` + `validate()` ¹ | 2.39M | 251k | — | 101.9M | 17.4M | — |
| Ajv (compiled) | 2.33M | 372k | 1.90M | 52.5M | 18.7M | 31.7M |
| Zod `z.compile()` + `safeParse()` | 1.84M | 242k | 129k | — | 16.9M | 584k |
| **Atscript `validate()`** | **466k** | **95.1k** | **361k** | **5.17M** | **4.68M** | **1.73M** |
| Zod `safeParse()` | 398k | 43.3k | 130k | — | 7.40M | 593k |
| Valibot `safeParse()` | 318k | 33.4k | 394k | 14.4M | 5.11M | 2.76M |
| Joi `validate()` | 54.8k | 4.5k | 49.4k | 761k | 1.25M | 320k |
| TypeBox `Value.Check()` | 27.1k | 2.3k | 54.0k | 136k | 400k | 310k |
| Yup `validateSync()` | 19.5k | 1.9k | 5.1k | 23.9k | 239k | 32.0k |
| class-validator `validateSync()` | 17.3k | 1.9k | 25.8k | — | 224k | 118k |

¹ Boolean only: returns `true` / `false` without error details. — = not run.

**Where Atscript is slower:**

- **Compiled validators are much faster on valid input.** TypeBox `Compile()`, ArkType, Ajv and Zod `z.compile()` generate specialized code for the schema. On a valid order they are 4–10x faster than Atscript in passthrough mode and 2–7x in strict mode (Zod `z.compile()` is about 9x faster in strip mode too). On a 50-item order compiled TypeBox is about 13x faster.
- **Ajv is far ahead on invalid input**: about 5x faster than Atscript with a full error report and 4–10x on first-error.
- **Valibot is faster on early exits**: on first-error (2.8–3.8x) and on a union where no branch matches (1.4–1.8x), and 1.1–1.3x faster with a full error report.
- **Stripping unknown properties** costs Atscript more than Zod: with undeclared properties on every object, Zod `safeParse()` is 2.4x faster in strip mode.
- **The standalone union's first branch**: Zod `safeParse()` is 1.6–2.3x faster there, and the fastest compiled validators about 5–6x.

**Where Atscript is faster:**

- **Among the validators that don't compile code**, Atscript is the fastest on valid input in passthrough and strict mode: 1.05–1.3x ahead of Zod `safeParse()` on a valid order (slightly behind it in strip mode) and 1.6–2.2x on the 50-item order, ahead of Valibot, and 8–50x ahead of Joi, Yup, class-validator and TypeBox `Value`.
- **Invalid input with a full error report**: Atscript is 2.2–2.8x faster than Zod (both `safeParse()` and `z.compile()`, which does not speed up the error path), about 6–11x faster than compiled TypeBox and ArkType, and far ahead of Joi, class-validator and Yup.
- Atscript validates in place and returns a boolean plus an error list; `safeParse()`-style APIs build a new output object.

Atscript has no ahead-of-time compile mode yet; one is planned, and the compiled rows show what that kind of validator can reach on valid input.

These numbers are an indicative estimate from a single round on a laptop (Apple M4 MacBook Air, Node.js 24.22, Atscript 0.1.109, Zod 4.6.7, Valibot 1.5.0, Yup 1.7.1, Joi 18.3.0, Ajv 8.20.0, ArkType 2.2.8, class-validator 0.15.1, TypeBox 1.4.2). The full results, including the strip and strict tables and ns/op, are in [RESULTS.md](https://github.com/prostojs/router-benchmark/blob/main/packages/validator-benchmark/RESULTS.md).

## Summary

|                            | Atscript                              | Zod                                        | class-validator                              |
| -------------------------- | ------------------------------------- | ------------------------------------------ | -------------------------------------------- |
| **Syntax**                 | Type definitions with constraints     | Schema DSL with method chains              | Decorator stacks on classes                  |
| **Nesting**                | Inline — no extra declarations        | Inline — no extra declarations             | Separate class per nested shape              |
| **Primitives**             | Standalone validated types            | Standalone schemas                         | Requires wrapper class                       |
| **Unions & intersections** | `\|` and `&` — native syntax          | `z.union()`, `z.intersection()` (no merge) | Not supported / single inheritance           |
| **Partial validation**     | `partial: true \| 'deep' \| function` | `.partial()` only (deep removed)           | Manual duplicate DTOs                        |
| **Custom logic**           | Pluggable at validator level          | `.refine()` per schema node                | Custom validator class per rule              |
| **TypeScript integration** | Generates `.d.ts` directly            | `z.infer<>` utility type                   | `reflect-metadata` + experimental decorators |
| **Type guards**            | `validate(data, true)` narrows input  | `.parse()` returns typed data              | None                                         |
| **Ecosystem**              | Growing                               | Largest (form libs, adapters)              | NestJS standard                              |

## More Than Validation

The key difference isn't just syntax or performance — it's scope. Zod and class-validator are validation libraries. Atscript is a type and metadata description language.

The same `.as` file that defines validation constraints can also carry `@label` for UI display names, `@db.index.*` for database indexes, `@description` for documentation, and any custom annotations your project needs. All of this metadata is accessible at runtime through a single import. Other libraries validate data; Atscript **describes** it.

```atscript
export interface Product {
  @label "Product Name"
  @expect.minLength 1
  name: string

  @label "Price (USD)"
  price: number.positive

  @label "SKU"
  @db.index.unique
  sku: string

  @label "Description"
  @description "Shown on the product detail page"
  summary?: string
}
```

One file. Types, validation, labels, database metadata — all in one place, all shared across your stack.

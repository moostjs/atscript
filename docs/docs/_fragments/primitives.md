Primitives are the building blocks of every `.as` model. In day-to-day app code, the main thing to learn is that Atscript lets you refine primitives with semantic extensions like `string.email` and `number.int`.

## Basic Primitive Types

Atscript supports the following primitive types:

- **`string`** - Text values
- **`number`** - Numeric values
- **`boolean`** - True/false values
- **`null`** - Null value
- **`undefined`** - Undefined value
- **`void`** - No value

```atscript
export interface BasicTypes {
    text: string
    count: number
    isEnabled: boolean
    empty: null
    nothing: void
}
```

## Semantic Types

Primitives can be extended with dot notation:

```atscript
export interface User {
    email: string.email
    name: string.required
    age: number.int.positive
}
```

These semantic types do two useful things:

1. they make the model easier to read
2. they attach validation behavior automatically

### String Extensions

The most common string extensions are:

```atscript
export interface User {
    id: string.uuid
    email: string.email
    phone: string.phone
    name: string.required
    birthDate: string.date
    createdAt: string.isoDate
    website: string.url
    serverIp: string.ip
    initial: string.char
}
```

Use them when the field has a real meaning that is stronger than plain `string`.

Other string extensions include `string.ipv4` and `string.ipv6` for protocol-specific IP address validation.

### Number Extensions

The most common number extensions are:

```atscript
export interface Product {
    quantity: number.int
    price: number.positive
    discount: number.negative
    weight: number.double
}
```

Useful built-ins:

- `number.int` — integer only
- `number.positive` — minimum `0`
- `number.negative` — maximum `0`
- `number.single` / `number.double` — numeric intent tags

#### Sized Integer Types

For fields that need a specific bit width, `number.int` provides sized extensions:

```atscript
export interface SensorData {
    reading: number.int.int16
    flags: number.int.uint8
    port: number.int.uint16.port
    offset: number.int.int32
}
```

Signed: `int8`, `int16`, `int32`, `int64`. Unsigned: `uint8`, `uint16`, `uint32`, `uint64`. Aliases: `uint8.byte` (byte value), `uint16.port` (network port).

### Boolean Extensions

Boolean extensions are mostly useful for required checkboxes and flags:

```atscript
export interface Settings {
    agreed: boolean.required
    alwaysOn: boolean.true
    disabled: boolean.false
}
```

`boolean.required` is the one most application code needs. It means the value must be `true`.

## Combining Extensions

You can combine extensions when the field needs more than one rule:

```atscript
export interface Metrics {
    retries: number.int.positive
    loss: number.double.negative
}
```

Prefer semantic types over separate `@expect.*` annotations when a built-in semantic type already says what you mean.

## Advanced Primitives

### Timestamp Variants

If you work with DB integrations later, Atscript also provides timestamp-oriented numeric tags like `number.timestamp`, `number.timestamp.created`, and `number.timestamp.updated`.

These are advanced because they matter more for integrations than for basic TypeScript usage.

### `phantom`

`phantom` is a special non-data type for runtime-discoverable elements that should not appear in TypeScript data, validation, or JSON Schema.

It is useful for advanced UI tooling and type traversal, but most application code can ignore it until needed.

## Best Practices

1. Use semantic types when the field has real meaning beyond a plain primitive.
2. Let built-in semantic types carry validation instead of duplicating the same rule by hand.
3. Reach for `string.required`, `string.email`, and `number.int` early — they cover many common cases.
4. Save advanced primitives like `phantom` and timestamp variants for pages or features that really need them.

::: tip Combining Extensions
- `number.int.positive` — positive integers only
- `number.double.negative` — negative double-precision numbers
- `number.single.positive` — positive single-precision numbers
- `number.int.uint16.port` — network port number
:::

# Validation Specification

This page is a **language-agnostic specification** for implementing data validation against Atscript type definitions. It defines the exact behavior your validator must follow — what to check, in what order, and what errors to produce.

The TypeScript `Validator` class in `packages/typescript/src/runtime/validator.ts` is the reference implementation that follows this specification.

## Two Constraint Dimensions

Atscript separates two completely orthogonal concerns. Understanding this distinction is essential before implementing anything else.

### Presence: The Optional Flag

The `?` token on a property controls whether the field may be absent (undefined):

```atscript
interface User {
    name: string        // required — must exist in the data
    nickname?: string   // optional — may be absent
}
```

At runtime, the `optional` flag is set on the type definition for that field. Your validator's first check for every field should be:

> If `optional` is true AND the value is `undefined` → **pass immediately**, skip all further checks.

This check happens **before** type dispatch and before any constraint annotations are evaluated.

### Content: @meta.required

`@meta.required` is a **value constraint**, not a presence constraint. It controls what counts as a valid value when the field _is_ present:

- **For strings**: the value must contain at least one non-whitespace character. Empty strings and whitespace-only strings fail.
- **For booleans**: the value must be `true`. `false` fails.

Presence still comes from the `?` marker, but the error for a missing value comes from `@meta.required`: when a value is `undefined`, or `null` on a type that does not accept `null`, and the node carries `@meta.required`, run the type check as usual; if it fails, report the `@meta.required` error (`REQUIRED`, `REQUIRED_CHECKED` for booleans, with the annotation's message, or the node's `@expect.message` when the annotation has none) instead of the type error. The verdict is the same; only the error differs. This applies to a union-level annotation too (`REQUIRED` instead of `UNION`).

In the TypeScript validator this happens in the walk's per-node step. A plugin that checks a value itself with `ctx.validateAnnotatedType(def, value)` skips that step (as it skips the `optional` check and the plugins): for a missing value it gets the type's own error (`TYPE`), not `REQUIRED`.

`@meta.required` only applies to `string` and `boolean` types.

### The Shorthand: string.required / boolean.required

`string.required` and `boolean.required` are primitive extensions that automatically inject a `@meta.required` annotation. They are not separate types — `name: string.required` is exactly equivalent to:

```atscript
@meta.required
name: string
```

### The Four Combinations

These two dimensions compose independently:

| `.as` syntax             | Absent (`undefined`) | Empty string `""` | Non-empty string |
| ------------------------ | -------------------- | ----------------- | ---------------- |
| `name: string`           | Fail                 | Pass              | Pass             |
| `name: string.required`  | Fail (`REQUIRED`)    | Fail              | Pass             |
| `name?: string`          | Pass                 | Pass              | Pass             |
| `name?: string.required` | Pass                 | Fail              | Pass             |

The last row is the subtle case: the field is optional (may be absent), but _if present_, it must be non-empty.

## Type Dispatch

### The Algorithm

Every validation call follows this sequence:

1. **Optional check**: If the field is optional AND the value is `undefined` → return pass
2. **Plugins**: Run validator plugins in order. If any returns a definitive result (`true` or `false`), use it. If all return "no opinion" → continue
3. **Type dispatch**: Branch on the type kind:

| Kind                  | Handler                         |
| --------------------- | ------------------------------- |
| Primitive (scalar)    | [Primitives](#primitives)       |
| Literal (const value) | [Literals](#literals)           |
| Phantom               | [Phantom](#phantom-types)       |
| Object                | [Objects](#objects)             |
| Array                 | [Arrays](#arrays)               |
| Union                 | [Unions](#unions)               |
| Intersection          | [Intersections](#intersections) |
| Tuple                 | [Tuples](#tuples)               |

### Primitives

Check that the runtime type of the value matches the declared primitive type:

| Declared type | Check                                                                 |
| ------------- | --------------------------------------------------------------------- |
| `string`      | `typeof value === 'string'`                                           |
| `number`      | `typeof value === 'number' && Number.isFinite(value)` (since 0.1.100) |
| `boolean`     | `typeof value === 'boolean'`                                          |
| `decimal`     | `typeof value === 'string'` AND value matches `^[+-]?\d+(\.\d+)?$`    |
| `null`        | `value === null`                                                      |
| `undefined`   | `value === undefined`                                                 |
| `any`         | Always pass                                                           |
| `never`       | Always fail                                                           |

::: warning Array disambiguation
In languages where arrays are a subtype of objects (like JavaScript), check for arrays first: `Array.isArray(value) ? 'array' : typeof value`. An array should not match `'object'`.
:::

After the type check passes, run [constraint annotations](#constraint-annotations) for that type (`@expect.*`, `@meta.required`).

If the type check fails, emit an error like: `"Expected string, got number"`.

#### `decimal` format check

`decimal` is a string-backed primitive that preserves arbitrary-precision numerics. The runtime type is `string`, but the validator also enforces a canonical format so every downstream consumer (SQL DECIMAL columns, Mongo, JSON transport) sees the same shape.

The format `^[+-]?\d+(\.\d+)?$` is intentionally strict:

- **Non-empty**: at least one digit is required. `""` is rejected.
- **Optional sign**: `+`, `-`, or none.
- **Integer part required**: `.5` is rejected (some DB engines reject it on input).
- **Optional fractional part**: if `.` is present, at least one digit must follow. `5.` is rejected.
- **No scientific notation**: `"1e3"` is rejected — scientific form is a `number`-think shape that silently widens precision.
- **No whitespace, thousands separators, or locale formatting**: those are presentation concerns, not on-wire form.
- **No `NaN` / `Infinity`**: no DECIMAL column on any supported engine can store these.

| Sample        | Result |
| ------------- | ------ |
| `"0"`         | Pass   |
| `"0.000"`     | Pass   |
| `"-12.34"`    | Pass   |
| `"+5"`        | Pass   |
| `""`          | Fail   |
| `".5"`        | Fail   |
| `"5."`        | Fail   |
| `"1.2.3"`     | Fail   |
| `" 1.5 "`     | Fail   |
| `"1,000"`     | Fail   |
| `"1e3"`       | Fail   |
| `"NaN"`       | Fail   |
| `"-Infinity"` | Fail   |
| `123` (num)   | Fail   |

Emit `"Expected string (decimal), got <kind>"` when the runtime type is wrong, and `"Invalid decimal format: <value>"` when the type is `string` but the format check fails. The two failures are reported separately so callers can tell "wrong type" from "malformed digit string" apart.

### Literals

A literal (const) type has a specific value baked into the type definition (e.g., `"active"`, `42`, `true`). Validate with strict equality:

```
if value !== expected_value → fail
```

Error: `"Expected 42, got 100"`

### Phantom Types

Phantom types always pass validation. They represent non-data fields — runtime-discoverable metadata that carries no actual value.

**In standalone validation**: return pass immediately.

**Inside object validation**: skip phantom-typed properties entirely. Do not validate them, and do not count them as declared properties. If the actual data object has a key whose name matches a phantom property, treat it as an [unknown property](#unknown-properties-policy).

See [Custom Primitives — Phantom Primitives](/plugin-development/primitives-type-tags#phantom-primitives) for the design intent.

### Objects

1. **Type check**: value must be a non-null, non-array object
2. **Key counts**: `@expect.minKeys` / `@expect.maxKeys` (see [Object Constraints](#object-constraints)); a failure is reported and the properties are still validated
3. **Iterate declared properties**: for each property in the type definition:
   - Skip phantom-typed properties
   - If the value is `undefined` and [partial mode](#partial-validation) applies → skip
   - Otherwise, validate recursively (push the property name onto the error path)
4. **Handle unknown keys**: for each key present in the data but not declared in the type → apply the [unknown properties policy](#unknown-properties-policy)

Error on type mismatch: `"Expected object"`

### Arrays

1. **Type check**: value must be an array
2. **Length constraints**: check `@expect.minLength` and `@expect.maxLength` on the **element count** (not character length)
3. **Element validation**: validate each element against the declared element type. Push `[index]` onto the error path for each element.
4. **Error accumulation**: continue validating remaining elements after a failure (up to the error limit)

Error on type mismatch: `"Expected array"`

### Unions

A union (`A | B | C`) passes if the value matches **any one** branch:

1. Try each branch in order
2. First branch that passes → return pass (short-circuit)
3. If no branch passes → emit an aggregate error with details from all branches

Error: `"Value does not match any of the allowed types: [string(0)], [number(1)]"` with a `details` array containing the errors from each branch attempt.

**Discriminated unions.** When every object branch has a required literal-typed property of the same name with distinct values (the other branches cannot hold an object: scalars, arrays, tuples) and the value is an object, report through the discriminator instead: the errors of the branch whose literal the value holds, at their own paths; or, when no branch has the value's literal, one error at the discriminator property (code `UNION_DISCRIMINATOR`, the allowed values as a param). Two such properties, an optional one, or a branch that may hold any object, make the union a plain one. Under partial validation at the union's depth, a value without the discriminator gets the plain union error.

::: tip Branch error isolation
Each branch attempt should be evaluated in its own error scope. If a branch fails, its errors are captured but not committed to the main error list. Only if _all_ branches fail are the captured errors included as `details` in the aggregate error.
:::

### Intersections

An intersection of object types is not an intersection node at runtime: the compiler [merges it](/packages/typescript/interfaces-types#how-a-merge-is-built) into one object type (`kind: 'object'`) whose props carry the merged annotations, and a union operand into a union of such objects. Validate it as an [object](#objects) or a [union](#unions); a key is unknown only when the merged object does not declare it.

A node of `kind: 'intersection'` remains only where two sides each check something the merge cannot fold into one type (`'x' & S3`, `1 & number.int`, `string.email & string.uuid`) and in types built by hand with `defineAnnotatedType('intersection')`. It passes if the value matches **all** items:

1. Validate against each item in order
2. First failure → return fail immediately (short-circuit)

Each item is checked on its own, like JSON Schema `allOf`: an object item reports a key only another item declares as unknown (with `unknownProps: 'error'`; `'strip'` removes it). Merge object types in `.as` (`A & B`) to get one object that knows every key.

### Tuples

A tuple (`[A, B, C]`) is a fixed-length array where each position has a specific type:

1. **Type check**: value must be an array
2. **Length check**: `value.length` must equal the number of items in the tuple type (exactly)
3. **Positional validation**: validate each element against the corresponding type at that index. Push `[index]` onto the error path.

Error on wrong length: `"Expected array of length 3"`

## Constraint Annotations

Constraint annotations are metadata attached to type definitions that add validation rules beyond basic type checking. They are evaluated **after** the base type check passes.

### String Constraints

Applied when the value is a valid string:

| Annotation                        | Condition                   | Default error                                                 |
| --------------------------------- | --------------------------- | ------------------------------------------------------------- |
| `@meta.required`                  | `value.trim().length === 0` | `"Must not be empty"`                                         |
| `@expect.minLength N`             | `value.length < N`          | `"Expected minimum length of N characters, got M characters"` |
| `@expect.maxLength N`             | `value.length > N`          | `"Expected maximum length of N characters, got M characters"` |
| `@expect.pattern "regex" [flags]` | `!regex.test(value)`        | `"Value is expected to match pattern \"...\""`                |

**Evaluation order**: `@meta.required` first (fail fast on empty), then `@expect.minLength`, then `@expect.maxLength`, then `@expect.pattern`.

**Pattern stacking**: `@expect.pattern` can appear multiple times on the same field (`multiple: true`, `mergeStrategy: 'append'`). All patterns must match — the first failing pattern produces the error.

**Stateful flags**: the regex is compiled without `g` and `y`, so a value gets the same result on every call (with them, `RegExp.test` would resume from the `lastIndex` of the previous call). `g` changes nothing; `y` matches at the start of the value only, like `^` (also under `m`, where `^` matches after a line break too). The same holds for the regex of a pattern property (`[/^k/g]: string`). The compiler warns about both flags.

### Number Constraints

Applied when the value is a valid **finite** number (`NaN` and `±Infinity` are rejected earlier, with `"Expected finite number, got N"`):

| Annotation               | Condition         | Default error                      |
| ------------------------ | ----------------- | ---------------------------------- |
| `@expect.int`            | `value % 1 !== 0` | `"Expected integer, got N"`        |
| `@expect.min N`          | `value < N`       | `"Expected minimum N, got M"`      |
| `@expect.max N`          | `value > N`       | `"Expected maximum N, got M"`      |
| `@expect.exclusiveMin N` | `value <= N`      | `"Expected greater than N, got M"` |
| `@expect.exclusiveMax N` | `value >= N`      | `"Expected less than N, got M"`    |

**Evaluation order**: `@expect.int` first, then `@expect.min`, `@expect.max`, `@expect.exclusiveMin`, `@expect.exclusiveMax`.

### Boolean Constraints

Applied when the value is a valid boolean:

| Annotation       | Condition        | Default error       |
| ---------------- | ---------------- | ------------------- |
| `@meta.required` | `value !== true` | `"Must be checked"` |

### Object Constraints

Applied when the value is an object, before its properties:

| Annotation          | Condition       | Default error                             |
| ------------------- | --------------- | ----------------------------------------- |
| `@expect.minKeys N` | kept keys `< N` | `"Expected at least N properties, got M"` |
| `@expect.maxKeys N` | kept keys `> N` | `"Expected at most N properties, got M"`  |

The kept keys are the keys the result keeps: every own key with `unknownProps: 'ignore'`; with `'strip'` and `'error'`, the declared props and the keys pattern props match. A failed count is reported and the properties are still validated.

### Array Constraints

Applied at the array level (before element validation):

| Annotation                  | Condition          | Default error                                       |
| --------------------------- | ------------------ | --------------------------------------------------- |
| `@expect.minLength N`       | `value.length < N` | `"Expected minimum length of N items, got M items"` |
| `@expect.maxLength N`       | `value.length > N` | `"Expected maximum length of N items, got M items"` |
| `@expect.array.uniqueItems` | duplicate found    | `"Duplicate items are not allowed"`                 |

Note: for strings, the messages say "characters"; for arrays, the messages say "items".

**Evaluation order**: `@expect.minLength` first, then `@expect.maxLength`, then `@expect.array.uniqueItems` (before element validation).

#### Unique Items

`@expect.array.uniqueItems` enforces that no two elements in the array are equal. How equality is determined depends on the element type and `@expect.array.key` annotations:

1. **Primitive arrays** (`string[]`, `number[]`) — duplicates are detected by deep equality (JSON serialization).
2. **Object arrays with `@expect.array.key` fields** — uniqueness is checked by key fields only. Multiple key fields form a composite key.
3. **Object arrays without key fields** — duplicates are detected by deep equality of the whole object.

`@expect.array.key` is a property-level annotation placed on fields **inside** the array element type. It marks which fields form the element's identity. Constraints:

- The field must be `string` or `number` type
- The field cannot be optional (`?`)
- Multiple `@expect.array.key` fields form a **composite key**
- `@expect.array.key` does **not** enforce uniqueness by itself — it only declares identity fields for lookups and patch operations. Add `@expect.array.uniqueItems` on the array field to enforce uniqueness.

```atscript
// Primitive array — no duplicates by deep equality
@expect.array.uniqueItems
tags: string[]

// Object array — unique by composite key (code + region)
@expect.array.uniqueItems
items: {
    @expect.array.key
    code: string
    @expect.array.key
    region: string
    quantity: number
}[]
```

### Custom Error Messages

All constraint annotations support an optional trailing `message` argument in `.as` files:

```atscript
@expect.minLength 3, "Name is too short"
@meta.required "This field cannot be blank"
```

When a custom message is provided, use it instead of the default error text.

`@expect.message "text"` on a field or a type replaces the message of a type mismatch at that node (wrong type, not the literal, no union branch, an unknown discriminator, a tuple of the wrong length); constraint failures keep their own messages.

How your code generator stores annotation arguments at runtime is entirely up to your plugin — there is no prescribed metadata shape. The spec only requires that the constraint value and the optional custom message are both accessible to the validator at runtime.

## Error Reporting

### Error Structure

Each validation error has:

```
{
  path: string       // dot-separated location (e.g., "address.city")
  message: string    // human-readable error description
  code: string       // stable UPPER_SNAKE code (e.g., "MIN_LENGTH")
  params: object     // the values the message needs (e.g., { min: 3, actual: 1 })
  custom?: true      // the message is the app's text (an annotation's message argument)
  details?: Error[]  // nested errors (used for union branch failures)
}
```

Use the codes, params and default templates of the reference validator ([Error Codes](/packages/typescript/validation-reference#error-codes)), so translations and clients work across implementations. A default message is the code's template filled with the params.

### Path Tracking

Maintain a path stack during recursive validation. Push property names when entering object fields, push index identifiers when entering array elements, and pop when leaving. Join the stack into a human-readable location string for error messages.

The exact path format (dot-separated, bracket notation, or a mix) is up to your implementation. The important thing is that the path clearly identifies the location of the error in the data structure.

### Error Limit

Accept a configurable maximum number of errors (default: 10). Once exceeded, stop collecting and return failure early. This prevents excessive error output on deeply invalid data.

### Union Error Aggregation

When a union fails (no branch matches), produce a single top-level error with all branch errors nested in `details`. This lets the consumer see exactly why each branch was rejected.

A union nested in its own branches, with many branches each, rejects a value that fails deep down from every branch of every union above it: written out, its details grow exponentially with the depth. The reference validator decides such a union once per value and path within one `validate()` call, so the time stays proportional to the type and the value, and the result and the errors are the same as deciding it each time. The details are complete (nothing is left out): an outcome decided once is one error object wherever it is reported, so the error tree shares those objects and its memory stays proportional to the work. Walking every error of such a tree (or `JSON.stringify` of it) visits a shared error once per place it appears. Ordinary unions produce no shared errors.

## Partial Validation

Partial validation relaxes presence checks for required fields. It is useful for validating partial updates (PATCH operations) where only some fields are provided.

### Modes

| Mode              | Behavior                                                      |
| ----------------- | ------------------------------------------------------------- |
| `false` (default) | All required props must be present                            |
| `true`            | Skip undefined checks at the top-level object only            |
| `'deep'`          | Skip undefined checks at all nesting levels                   |
| Function          | Called per-object to decide whether to apply partial behavior |

### Interaction with Content Constraints

Partial mode only affects **presence** — whether an `undefined` value for a required field is accepted. When a value _is_ present, all content constraints (`@meta.required`, `@expect.*`) still run normally.

Example: with `partial: true` and `name: string.required`:

- `{ }` (name absent) → **pass** (partial skips the presence check)
- `{ name: "" }` (name present but empty) → **fail** (`@meta.required` still rejects empty strings)
- `{ name: "Alice" }` → **pass**

## Unknown Properties Policy

When the data object contains keys that are not declared in the type definition:

| Policy              | Behavior                                                               |
| ------------------- | ---------------------------------------------------------------------- |
| `'error'` (default) | Emit `"Unexpected property"` error                                     |
| `'strip'`           | Delete the key from the data object once validation passes (see below) |
| `'ignore'`          | Silently skip                                                          |

`'strip'` deletes on success only:

- Validation reads the data as it was passed. Each object that passes records its unknown keys.
- A rejected union branch (or a failed pattern property attempt, or a plugin sub-validation that fails) drops the keys it recorded. A failed validation at any level strips nothing.
- When the whole value passes, the recorded keys are deleted, object by object in the order the objects finished, each object's keys in key order. When validation fails, nothing is deleted, and `errorLimit` never changes what is deleted.

### Pattern Properties

Before applying the unknown property policy, check pattern properties — regex-matched wildcards that accept keys matching a pattern. If a key matches one or more patterns, validate the value against the pattern's type instead of treating it as unknown.

If a key matches multiple patterns, try each pattern's type until one passes. If none pass, report validation errors from the first matching pattern.

## Validator Plugins

A validator may support a plugin mechanism allowing users to intercept and customize validation:

- **Input**: the type definition, the value being validated, and a context object
- **Output**: `true` (accept), `false` (reject), or "no opinion" (fall through to built-in logic)
- **Execution**: after the optional check, before type dispatch. Plugins run in registration order; the first definitive result wins.

Plugins receive access to a context that includes:

- An error reporting function
- The current path
- A recursive validation function (for delegating to sub-validations). With `'strip'`, a sub-validation that fails drops the keys it recorded, as a rejected union branch does, so a plugin trying alternatives strips what the equivalent union would
- An arbitrary user-supplied context value (e.g., user roles, request metadata)

## Implementation Checklist

A complete validator implementation must handle:

- [ ] Optional flag — undefined bypass before all other checks
- [ ] Plugin hook execution point
- [ ] Primitive type checks (string, number, boolean, null, undefined, any, never)
- [ ] Literal/const value equality
- [ ] Phantom type passthrough
- [ ] Object validation with declared property iteration
- [ ] Phantom property skipping within objects
- [ ] Unknown property policy (error / strip / ignore)
- [ ] Pattern property matching for dynamic keys
- [ ] Array type check and element recursion
- [ ] Array length constraints (`@expect.minLength`, `@expect.maxLength`)
- [ ] `@expect.array.uniqueItems` — no duplicate items (by key fields or deep equality)
- [ ] Union try-all-branches with error aggregation
- [ ] Intersection all-must-pass with fail-fast
- [ ] Tuple exact-length positional validation
- [ ] `@meta.required` for strings (non-empty) and booleans (must be true)
- [ ] `@expect.minLength` / `@expect.maxLength` for strings
- [ ] `@expect.min` / `@expect.max` for numbers
- [ ] `@expect.int` for numbers
- [ ] `@expect.pattern` for strings (with multiple pattern support)
- [ ] Custom error messages from annotation arguments
- [ ] Path tracking for error location reporting
- [ ] Error limit to cap accumulated errors
- [ ] Partial validation modes (top-level, deep, function)

## Next Steps

- [Custom Primitives](/plugin-development/primitives-type-tags) — how primitive types and their constraints are defined
- [Custom Annotations](/plugin-development/annotation-system) — defining your own constraint annotations
- [Building a Code Generator](/plugin-development/code-generation) — generating the type tree that validators consume

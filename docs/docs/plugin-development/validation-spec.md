# Validation Specification

This page is a **language-agnostic specification** for implementing data validation against Atscript type definitions. It defines the exact behavior your validator must follow — what to check, in what order, and what errors to produce.

The TypeScript `Validator` class in `packages/typescript/src/validator.ts` is the reference implementation that follows this specification.

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
| `name: string.required`  | Fail                 | Fail              | Pass             |
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

| Declared type | Check                        |
| ------------- | ---------------------------- |
| `string`      | `typeof value === 'string'`  |
| `number`      | `typeof value === 'number'`  |
| `boolean`     | `typeof value === 'boolean'` |
| `null`        | `value === null`             |
| `undefined`   | `value === undefined`        |
| `any`         | Always pass                  |
| `never`       | Always fail                  |

::: warning Array disambiguation
In languages where arrays are a subtype of objects (like JavaScript), check for arrays first: `Array.isArray(value) ? 'array' : typeof value`. An array should not match `'object'`.
:::

After the type check passes, run [constraint annotations](#constraint-annotations) for that type (`@expect.*`, `@meta.required`).

If the type check fails, emit an error like: `"Expected string, got number"`.

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
2. **Iterate declared properties**: for each property in the type definition:
   - Skip phantom-typed properties
   - If the value is `undefined` and [partial mode](#partial-validation) applies → skip
   - Otherwise, validate recursively (push the property name onto the error path)
3. **Handle unknown keys**: for each key present in the data but not declared in the type → apply the [unknown properties policy](#unknown-properties-policy)

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

::: tip Branch error isolation
Each branch attempt should be evaluated in its own error scope. If a branch fails, its errors are captured but not committed to the main error list. Only if _all_ branches fail are the captured errors included as `details` in the aggregate error.
:::

### Intersections

An intersection (`A & B`) passes if the value matches **all** items:

1. Validate against each item in order
2. First failure → return fail immediately (short-circuit)

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

### Number Constraints

Applied when the value is a valid number:

| Annotation      | Condition         | Default error                 |
| --------------- | ----------------- | ----------------------------- |
| `@expect.int`   | `value % 1 !== 0` | `"Expected integer, got N"`   |
| `@expect.min N` | `value < N`       | `"Expected minimum N, got M"` |
| `@expect.max N` | `value > N`       | `"Expected maximum N, got M"` |

**Evaluation order**: `@expect.int` first, then `@expect.min`, then `@expect.max`.

### Boolean Constraints

Applied when the value is a valid boolean:

| Annotation       | Condition        | Default error       |
| ---------------- | ---------------- | ------------------- |
| `@meta.required` | `value !== true` | `"Must be checked"` |

### Array Length Constraints

Applied at the array level (before element validation):

| Annotation            | Condition          | Default error                                       |
| --------------------- | ------------------ | --------------------------------------------------- |
| `@expect.minLength N` | `value.length < N` | `"Expected minimum length of N items, got M items"` |
| `@expect.maxLength N` | `value.length > N` | `"Expected maximum length of N items, got M items"` |

Note: for strings, the messages say "characters"; for arrays, the messages say "items".

### Custom Error Messages

All constraint annotations support an optional trailing `message` argument in `.as` files:

```atscript
@expect.minLength 3 "Name is too short"
@meta.required "This field cannot be blank"
```

When a custom message is provided, use it instead of the default error text.

How your code generator stores annotation arguments at runtime is entirely up to your plugin — there is no prescribed metadata shape. The spec only requires that the constraint value and the optional custom message are both accessible to the validator at runtime.

## Error Reporting

### Error Structure

Each validation error has:

```
{
  path: string       // dot-separated location (e.g., "address.city")
  message: string    // human-readable error description
  details?: Error[]  // nested errors (used for union branch failures)
}
```

### Path Tracking

Maintain a path stack during recursive validation. Push property names when entering object fields, push index identifiers when entering array elements, and pop when leaving. Join the stack into a human-readable location string for error messages.

The exact path format (dot-separated, bracket notation, or a mix) is up to your implementation. The important thing is that the path clearly identifies the location of the error in the data structure.

### Error Limit

Accept a configurable maximum number of errors (default: 10). Once exceeded, stop collecting and return failure early. This prevents excessive error output on deeply invalid data.

### Union Error Aggregation

When a union fails (no branch matches), produce a single top-level error with all branch errors nested in `details`. This lets the consumer see exactly why each branch was rejected.

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

| Policy              | Behavior                                                   |
| ------------------- | ---------------------------------------------------------- |
| `'error'` (default) | Emit `"Unexpected property"` error                         |
| `'strip'`           | Delete the key from the data object (destructive mutation) |
| `'ignore'`          | Silently skip                                              |

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
- A recursive validation function (for delegating to sub-validations)
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

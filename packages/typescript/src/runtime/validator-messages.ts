/**
 * Validator error codes, their default English templates and the translation helpers.
 *
 * The validator is locale-agnostic: every error it reports carries a stable `code` and the
 * `params` its message needs, and its `message` is the default English text (the code's
 * template filled with the params) or the app's own text from an annotation (`custom: true`).
 * Translate after the fact with {@link localizeErrors}, or per validator with the `translate`
 * option.
 */

/**
 * Default English templates of the built-in error codes. `{name}` is replaced with
 * `params.name` (see {@link formatValidatorMessage}).
 */
export const VALIDATOR_MESSAGES = Object.freeze({
  /** A required string is empty (or whitespace only), or a required optional field is `null`. */
  REQUIRED: 'Must not be empty',
  /** A required boolean (`@meta.required` on a boolean) is not `true`. */
  REQUIRED_CHECKED: 'Must be checked',
  /** Wrong primitive type. `{ expected, actual }`: type names. */
  TYPE: 'Expected {expected}, got {actual}',
  /** Not an array. `{ actual }`: the value's type name. */
  TYPE_ARRAY: 'Expected array',
  /** Not an object. `{ actual }`: the value's type name. */
  TYPE_OBJECT: 'Expected object',
  /** A decimal that is not a string. `{ actual }`: the value's type name. */
  TYPE_DECIMAL: 'Expected string (decimal), got {actual}',
  /** `NaN` or an infinity. `{ actual }`: the value as text. */
  NOT_FINITE: 'Expected finite number, got {actual}',
  /** A decimal string in the wrong format. `{ value }`: the string. */
  DECIMAL_FORMAT: 'Invalid decimal format: "{value}"',
  /** A `never` type. */
  NEVER: 'This type is impossible, must be an internal problem',
  /** Not the literal value. `{ expected, actual }`: the literal, the value as text. */
  LITERAL: 'Expected {expected}, got {actual}',
  /** No union branch matches. `{ expected }`: the branch kinds (`[string(0)], [number(1)]`). */
  UNION: 'Value does not match any of the allowed types: {expected}',
  /**
   * The discriminator of an object union holds no branch's value. Reported at the discriminator
   * property. `{ property, allowed, actual }`: its name, the allowed values, the value as text.
   */
  UNION_DISCRIMINATOR: 'Expected one of {allowed}, got {actual}',
  /** A property the type does not declare (`unknownProps: 'error'`). `{ property }`. */
  UNEXPECTED_PROPERTY: 'Unexpected property',
  /** A tuple of the wrong length. `{ length }`: the expected length. */
  TUPLE_LENGTH: 'Expected array of length {length}',
  /** `@expect.minLength` on a string. `{ min, actual }`: lengths. */
  MIN_LENGTH: 'Expected minimum length of {min} characters, got {actual} characters',
  /** `@expect.maxLength` on a string. `{ max, actual }`: lengths. */
  MAX_LENGTH: 'Expected maximum length of {max} characters, got {actual} characters',
  /** `@expect.minLength` on an array. `{ min, actual }`: item counts. */
  MIN_ITEMS: 'Expected minimum length of {min} items, got {actual} items',
  /** `@expect.maxLength` on an array. `{ max, actual }`: item counts. */
  MAX_ITEMS: 'Expected maximum length of {max} items, got {actual} items',
  /** `@expect.array.uniqueItems`: a duplicate item (reported at its index). */
  UNIQUE_ITEMS: 'Duplicate items are not allowed',
  /** `@expect.minKeys`. `{ min, actual }`: key counts. */
  MIN_KEYS: 'Expected at least {min} properties, got {actual}',
  /** `@expect.maxKeys`. `{ max, actual }`: key counts. */
  MAX_KEYS: 'Expected at most {max} properties, got {actual}',
  /** `@expect.pattern` without a message. `{ pattern, flags }`. */
  PATTERN: 'Value is expected to match pattern "{pattern}"',
  /** `@expect.int`. `{ actual }`: the value. */
  INT: 'Expected integer, got {actual}',
  /** `@expect.min`. `{ min, actual }`. */
  MIN: 'Expected minimum {min}, got {actual}',
  /** `@expect.max`. `{ max, actual }`. */
  MAX: 'Expected maximum {max}, got {actual}',
  /** `@expect.exclusiveMin`. `{ min, actual }`. */
  EXCLUSIVE_MIN: 'Expected greater than {min}, got {actual}',
  /** `@expect.exclusiveMax`. `{ max, actual }`. */
  EXCLUSIVE_MAX: 'Expected less than {max}, got {actual}',
  /** `string.email`. */
  EMAIL: 'Invalid email format.',
  /** `string.phone`. */
  PHONE: 'Invalid phone number format.',
  /** `string.date`. */
  DATE: 'Invalid date format.',
  /** `string.isoDate`. */
  ISO_DATE: 'Invalid ISO date format.',
  /** `string.uuid`. */
  UUID: 'Invalid UUID format.',
  /** `string.url`. */
  URL: 'Invalid URL format.',
  /** `string.ipv4`. */
  IPV4: 'Invalid IPv4 address.',
  /** `string.ipv6`. */
  IPV6: 'Invalid IPv6 address.',
  /** `string.ip`. */
  IP: 'Invalid IP address.',
} as const)

/** A built-in validator error code (a key of {@link VALIDATOR_MESSAGES}), or `CUSTOM`. */
export type TValidatorErrorCode = keyof typeof VALIDATOR_MESSAGES | 'CUSTOM'

/**
 * The built-in validator error codes by name (`VALIDATOR_ERROR_CODES.MIN_LENGTH === 'MIN_LENGTH'`).
 * `CUSTOM` is the code of an error a validator plugin reports without a code of its own.
 */
export const VALIDATOR_ERROR_CODES = Object.freeze(
  Object.fromEntries([...Object.keys(VALIDATOR_MESSAGES), 'CUSTOM'].map(code => [code, code])) as {
    readonly [K in TValidatorErrorCode]: K
  }
)

/**
 * Codes of the format messages built into the `string.*` primitives, by their English text
 * (the primitives' `@expect.pattern` message).
 */
const FORMAT_CODES: ReadonlyMap<string, keyof typeof VALIDATOR_MESSAGES> = new Map(
  (['EMAIL', 'PHONE', 'DATE', 'ISO_DATE', 'UUID', 'URL', 'IPV4', 'IPV6', 'IP'] as const).map(
    code => [VALIDATOR_MESSAGES[code], code]
  )
)

/** The code of a primitive's built-in format message (`string.email`'s → `EMAIL`), if it is one. */
export function formatCodeOf(message: string): keyof typeof VALIDATOR_MESSAGES | undefined {
  return FORMAT_CODES.get(message)
}

/** A validation error. */
export interface TError {
  /** Dot path of the value (`''`: the root). */
  path: string
  /**
   * The message: the code's template filled with `params` (English by default), or the app's
   * own text from an annotation (`custom: true`), translated when a translator is used.
   */
  message: string
  /**
   * Stable code (UPPER_SNAKE): a {@link TValidatorErrorCode} for the validator's own errors,
   * a plugin's own code, or `CUSTOM`. Optional only for errors made by hand.
   */
  code?: TValidatorErrorCode | (string & Record<never, never>)
  /** The values the code's message needs (limits, expected type, pattern, …); JSON-safe. */
  params?: Record<string, unknown>
  /**
   * `true` when `message` is the app's own text (an annotation's message argument,
   * `@expect.message`, a plugin's message) rather than the code's template: a translator
   * gets that text as the message id instead of the code.
   */
  custom?: boolean
  /** The errors of each union branch (a union error), in branch order. */
  details?: TError[]
}

/**
 * Translates one error: `id` is the error's `code` for a built-in message, or its message text
 * for app text (`custom`, or no code). Return `undefined` to keep the current message.
 */
export type TValidatorTranslate = (
  id: string,
  params: Record<string, unknown>,
  error: TError
) => string | undefined

/**
 * Fills a message template: each `{name}` becomes `params.name` (arrays: their items joined
 * with `, `). A placeholder without a param stays as it is.
 */
export function formatValidatorMessage(
  template: string,
  params: Record<string, unknown> | undefined
): string {
  if (params === undefined) {
    return template
  }
  const parts = BUILTIN_PARTS.get(template)
  if (parts === undefined) {
    return template.includes('{') ? template.replaceAll(PLACEHOLDER, fill(params)) : template
  }
  // (a built-in template, split once: no regex per error)
  let out = parts[0]
  for (let i = 1; i < parts.length; i += 2) {
    out += paramText(params, parts[i]) + parts[i + 1]
  }
  return out
}

const PLACEHOLDER = /\{(\w+)\}/g

/** The replacer of {@link PLACEHOLDER} over `params`. */
function fill(params: Record<string, unknown>) {
  return (_match: string, name: string) => paramText(params, name)
}

/** The text of placeholder `name` (the placeholder itself without the param). */
function paramText(params: Record<string, unknown>, name: string): string {
  if (!Object.hasOwn(params, name)) {
    return `{${name}}`
  }
  const value = params[name]
  return Array.isArray(value) ? value.map(String).join(', ') : String(value)
}

/**
 * The {@link VALIDATOR_MESSAGES} templates with placeholders, split at them: text, name, text,
 * name, …, text (`'a {b} c'.split(/\{(\w+)\}/)`).
 */
const BUILTIN_PARTS: ReadonlyMap<string, string[]> = new Map(
  Object.values(VALIDATOR_MESSAGES)
    .filter(template => template.includes('{'))
    .map(template => [template, template.split(/\{(\w+)\}/)])
)

/**
 * Returns `errors` with translated messages (new objects; `details` too): `translate` gets
 * each error's code (or its message text, for app text — see {@link TValidatorTranslate}),
 * params and the error itself. Errors it returns `undefined` for keep their message.
 *
 * @example
 * ```ts
 * const errors = localizeErrors(validator.errors, (id, params) =>
 *   i18n.exists(id) ? i18n.t(id, params) : undefined
 * )
 * ```
 */
export function localizeErrors(errors: TError[], translate: TValidatorTranslate): TError[] {
  return errors.map(error => {
    const id = error.custom || error.code === undefined ? error.message : error.code
    // (params copied: a translator changing them leaves the input as it was)
    const out: TError = { ...error }
    if (error.params !== undefined) {
      out.params = copyValue(error.params) as Record<string, unknown>
    }
    const message = translate(id, out.params ?? {}, out)
    if (message !== undefined) {
      out.message = message
    }
    if (error.details) {
      out.details = localizeErrors(error.details, translate)
    }
    return out
  })
}

/** A copy of `value`: plain objects and arrays copied, at any depth (error params). */
function copyValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(copyValue)
  }
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      out[key] = copyValue(item)
    }
    return out
  }
  return value
}

/**
 * A {@link TValidatorTranslate} over a map of message templates keyed by code (and, for app
 * text, by the text itself): `{name}` placeholders are filled from the error's params. Ids
 * missing from the map keep their message.
 *
 * @example
 * ```ts
 * // templates served per locale, e.g. { MIN_LENGTH: 'Mindestens {min} Zeichen', … }
 * localizeErrors(errors, messagesTranslator(templates))
 * ```
 */
export function messagesTranslator(messages: Record<string, string>): TValidatorTranslate {
  return (id, params) =>
    Object.hasOwn(messages, id) ? formatValidatorMessage(messages[id], params) : undefined
}

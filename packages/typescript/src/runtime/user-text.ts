/**
 * The annotations holding user-facing text (labels, descriptions, error messages): the arguments
 * their specs flag `userText`. Core's are known from the start ({@link CORE_USER_TEXT}); a plugin's
 * are registered by the generated modules that write them (`$ut`), or by the plugin itself
 * ({@link registerUserText}), so a translator finds them at runtime without the specs.
 */

/**
 * `true`: the value itself is the text; `'expression'`: the value is the source of a function the
 * client evaluates, its string literals the texts; a list: those fields of the value object are
 * (a name ending in `()`: that field is an expression).
 */
export type TUserTextFields = true | 'expression' | readonly string[]

/**
 * The user-facing text of `@atscript/core`'s annotations (its specs' `userText` arguments; a test
 * keeps them equal).
 */
export const CORE_USER_TEXT: ReadonlyMap<string, TUserTextFields> = new Map<
  string,
  TUserTextFields
>([
  ['meta.label', true],
  ['meta.description', true],
  ['meta.required', ['message']],
  ['expect.minLength', ['message']],
  ['expect.maxLength', ['message']],
  ['expect.min', ['message']],
  ['expect.max', ['message']],
  ['expect.exclusiveMin', ['message']],
  ['expect.exclusiveMax', ['message']],
  ['expect.int', ['message']],
  ['expect.minKeys', ['message']],
  ['expect.maxKeys', ['message']],
  ['expect.message', true],
  ['expect.pattern', ['message']],
  ['expect.array.uniqueItems', ['message']],
  ['expect.array.key', ['message']],
])

const USER_TEXT = new Map<string, TUserTextFields>(CORE_USER_TEXT)

/**
 * Registers metadata key `key` as holding user-facing text (see {@link TUserTextFields}; `true` by
 * default). Fields add up across calls; a whole-value kind replaces a field list, and an
 * expression wins over text (`name()` over `name`), whatever the order of the calls.
 * For plugins that write such metadata at runtime; generated modules register what they write.
 */
export function registerUserText(key: string, fields: TUserTextFields = true): void {
  const known = USER_TEXT.get(key)
  if (known === 'expression' || (known === true && typeof fields === 'object')) {
    return
  }
  if (typeof fields !== 'object') {
    USER_TEXT.set(key, fields)
    return
  }
  const all = new Set([...(typeof known === 'object' ? known : []), ...fields])
  USER_TEXT.set(
    key,
    [...all].filter(f => !all.has(`${f}()`))
  )
}

/**
 * Registers user-text keys written by a generated module (see {@link registerUserText}): `key` —
 * the value itself; `key()` — the value is an expression; `key:field` — that field of the value
 * object; `key:field()` — that field is an expression.
 */
export function $ut(...entries: string[]): void {
  for (const entry of entries) {
    const at = entry.indexOf(':')
    if (at !== -1) {
      registerUserText(entry.slice(0, at), [entry.slice(at + 1)])
    } else if (entry.endsWith('()')) {
      registerUserText(entry.slice(0, -2), 'expression')
    } else {
      registerUserText(entry)
    }
  }
}

/**
 * Where metadata key `key` holds user-facing text (see {@link TUserTextFields}; for a `multiple`
 * annotation, each item of its list), `undefined` when it holds none. Core keys are known from the
 * start; a plugin's once a module writing them is loaded (or the plugin registered them).
 */
export function userTextOf(key: string): TUserTextFields | undefined {
  return USER_TEXT.get(key)
}

/** Every metadata key holding user-facing text known so far (see {@link userTextOf}). */
export function userTextKeys(): ReadonlyMap<string, TUserTextFields> {
  return USER_TEXT
}

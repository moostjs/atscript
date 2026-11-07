/**
 * Translating a serialized type (or any JSON carrying serialized types) before it is served:
 * the user-facing text of its metadata is replaced, the string literals of its expressions are
 * collected for the client.
 */

import { mapEntries, mapList } from './copy-on-change'
import { userTextOf, type TUserTextFields } from './user-text'
import { formatCodeOf } from './validator-messages'

/**
 * Translates the user-facing text of serialized annotated types (the output of
 * `serializeAnnotatedType`, or any JSON holding such output) with `t`. Every `metadata` object
 * found at any depth is read with {@link userTextOf}:
 *
 * - a text key's value (each item of a `multiple` list; the named fields of a value object) is
 *   replaced by `t(text)` — except a primitive's built-in format message (`string.email`'s), which
 *   the validator reports by its code (`EMAIL`), translated on the client through `$i18n`;
 * - an expression key's value (function source evaluated by the client) stays as it is: the
 *   string literals in it (`'…'`, `"…"`, and `` `…` `` templates without `${…}`) are translated,
 *   and `texts` maps each literal translated to its translation — serve it to the client, which
 *   translates the expressions' results by exact match.
 *
 * `t` returns `undefined` (anything but a string) to keep a text. The input is never changed: the
 * result shares every part with no translated text, and is `json` itself when nothing was
 * translated.
 *
 * @example
 * ```ts
 * const { value, texts } = translateServed(serializeAnnotatedType(Product), text =>
 *   i18n.exists(text) ? i18n.t(text) : undefined
 * )
 * ```
 */
export function translateServed<T>(
  json: T,
  t: (text: string) => string | undefined
): { value: T; texts: Record<string, string> } {
  const texts: Record<string, string> = {}
  const value = walk(json, undefined, { t, texts }) as T
  return { value, texts }
}

/**
 * Translates the value of one metadata key (live, as a compiled type holds it — not serialized)
 * with `t`, by the rules {@link translateServed} applies to serialized metadata, so a client
 * translating compiled types reads one catalogue with the server: a text key's string (each item
 * of a `multiple` list; the named fields of a value object, e.g. `message` of `meta.required`) is
 * replaced by `t(text)` — except a primitive's built-in format message, which is reported by its
 * code. Returns `value` itself when the key holds no user text or nothing is translated; it is
 * never changed.
 *
 * Expressions are left as they are: their string literals are translated in a served type's
 * `texts`, and a client translates what an expression returns (by exact match), not its source.
 *
 * @example
 * ```ts
 * const label = translateUserText('meta.label', 'Street', text => dict[text]) // dict['Street']
 * ```
 */
export function translateUserText(
  key: string,
  value: unknown,
  t: (text: string) => string | undefined
): unknown {
  const mode = userTextOf(key)
  return mode === undefined ? value : walk(value, mode, { t })
}

/**
 * `texts` collects the literals of expressions, and `metadata` objects are walked: a served type.
 * Without it (one key's value, {@link translateUserText}) both are left alone.
 */
interface TCtx {
  t: (text: string) => string | undefined
  texts?: Record<string, string>
}

/** What a value is: a `metadata` object, user text (see {@link TUserTextFields}), or other JSON. */
type TMode = 'metadata' | TUserTextFields | undefined

/** `value` translated as `mode` says; the `metadata` objects within it translated too. */
function walk(value: unknown, mode: TMode, ctx: TCtx): unknown {
  if (Array.isArray(value)) {
    return mapList(value, item => walk(item, mode === 'metadata' ? undefined : mode, ctx))
  }
  if (typeof value === 'string') {
    if (mode === 'expression') {
      collectLiterals(value, ctx)
    } else if (mode === true && formatCodeOf(value) === undefined) {
      // (a built-in format message stays: the validator reports it by its code, `EMAIL`, …)
      return translate(value, ctx) ?? value
    }
    return value
  }
  if (typeof value !== 'object' || value === null) {
    return value
  }
  if (ctx.texts === undefined && typeof mode !== 'object') {
    // (one key's value, translateUserText: there are no `metadata` objects to look for)
    return value
  }
  return mapEntries(value as Record<string, unknown>, (key, item) =>
    walk(item, modeOf(key, mode), ctx)
  )
}

/**
 * The mode of the value at `key` of an object of `mode`: a metadata key's user text, a field of a
 * value object's, else `metadata` objects only (a non-string text value — a `ref` target — has
 * metadata).
 */
function modeOf(key: string, mode: TMode): TMode {
  if (typeof mode === 'object') {
    return mode.includes(`${key}()`) ? 'expression' : mode.includes(key) || undefined
  }
  return (mode === 'metadata' && userTextOf(key)) || (key === 'metadata' ? 'metadata' : undefined)
}

/** `t(text)` when it is a string (a plain-object dictionary also has `constructor`, …). */
function translate(text: string, ctx: TCtx): string | undefined {
  const out = ctx.t(text)
  return typeof out === 'string' ? out : undefined
}

/** Adds the translated string literals of expression `source` to `ctx.texts` (a served type only). */
function collectLiterals(source: string, ctx: TCtx): void {
  const { texts } = ctx
  if (!texts) {
    return
  }
  for (const literal of stringLiterals(source)) {
    if (!Object.hasOwn(texts, literal)) {
      const translated = translate(literal, ctx)
      if (translated !== undefined && translated !== literal) {
        texts[literal] = translated
      }
    }
  }
}

// ---------------------------------------------------------------------------
// String literals of an expression
// ---------------------------------------------------------------------------

/** Single-character escapes and what they stand for (a line continuation stands for nothing). */
const ESCAPES: Record<string, string> = {
  'n': '\n',
  't': '\t',
  'r': '\r',
  'b': '\b',
  'f': '\f',
  'v': '\v',
  '0': '\0',
  '\n': '',
  '\r': '',
  '\r\n': '',
}

/** An escape of a literal's raw text: `\u{…}`, `\u….`, `\x..`, or a single character. */
const ESCAPE = /\\(u\{[\dA-Fa-f]+\}|u[\dA-Fa-f]{4}|x[\dA-Fa-f]{2}|\r\n|[\s\S])/gu

/** The string a literal's raw text (between its quotes) evaluates to. */
function decode(raw: string): string {
  return raw.includes('\\')
    ? raw.replace(ESCAPE, (_, c: string) => {
        if (c.length < 3) {
          return Object.hasOwn(ESCAPES, c) ? ESCAPES[c] : c
        }
        const code = Number.parseInt(c.replace(/[ux{}]/g, ''), 16)
        return code > 0x10ffff ? '' : String.fromCodePoint(code)
      })
    : raw
}

/** A character of an identifier or a number. */
const IDENT = /[\p{ID_Continue}$]/u
/** A run of {@link IDENT} characters at `lastIndex`. */
const IDENT_RUN = /[\p{ID_Continue}$]+/uy

/** Keywords whose `(…)` a statement follows: a `/` after the `)` starts a regular expression. */
const CONTROL = new Set(['if', 'while', 'for', 'with'])

/** Keywords after which `/` starts a regular expression rather than a division. */
const REGEX_AFTER_WORD = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'case',
  'do',
  'else',
  'yield',
  'await',
])

class LiteralScanner {
  private i = 0
  /** A `/` here starts a regular expression (no operand just ended), not a division. */
  private regexOk = true
  /**
   * The open brackets: `c` — the `(` of an `if` / `while` / `for` / `with` (a `/` after its `)` is
   * a regex); `p` — another `(`; `{`; `$` — a template's `${`.
   */
  private readonly open: string[] = []

  constructor(
    private readonly src: string,
    private readonly out: Set<string>
  ) {}

  /** Scans code up to the end, or to the `}` closing a template's `${`. */
  code(): void {
    const src = this.src
    while (this.i < src.length) {
      const c = src[this.i]
      if (c === '/' && src[this.i + 1] === '/') {
        const end = src.indexOf('\n', this.i)
        this.i = end === -1 ? src.length : end
      } else if (c === '/' && src[this.i + 1] === '*') {
        const end = src.indexOf('*/', this.i + 2)
        this.i = end === -1 ? src.length : end + 2
      } else if (c === "'" || c === '"' || c === '`') {
        const text = this.literal(c)
        if (text !== undefined && text.trim() !== '') {
          this.out.add(text)
        }
        this.regexOk = false
      } else if (c === '/' && this.regexOk) {
        this.regex()
        this.regexOk = false
      } else if (IDENT.test(c)) {
        this.word()
      } else if ((c === '+' || c === '-') && src[this.i + 1] === c) {
        // (`a++ / 2`: a postfix `++` / `--` ends an operand)
        this.i += 2
        this.regexOk = false
      } else {
        this.i++
        if (/\s/.test(c)) {
          continue
        }
        if (c === '(' || c === '{') {
          this.open.push(c === '(' ? 'p' : c)
        } else if (c === ')' || c === '}') {
          const top = this.open.pop()
          if (top === '$') {
            return
          }
          this.regexOk = top === 'c'
          continue
        }
        this.regexOk = c !== ']'
      }
    }
  }

  /** An identifier, keyword or number at `i`; `i` past it (and past a control keyword's `(`). */
  private word(): void {
    const src = this.src
    IDENT_RUN.lastIndex = this.i
    IDENT_RUN.test(src)
    const word = src.slice(this.i, IDENT_RUN.lastIndex)
    this.i = IDENT_RUN.lastIndex
    this.regexOk = REGEX_AFTER_WORD.has(word)
    if (CONTROL.has(word)) {
      while (/\s/.test(src[this.i] ?? '')) {
        this.i++
      }
      if (src[this.i] === '(') {
        this.i++
        this.open.push('c')
        this.regexOk = true
      }
    }
  }

  /**
   * A `'…'` / `"…"` / `` `…` `` literal at `i`, decoded (`undefined`: a template with `${…}`, whose
   * code is scanned); `i` past it.
   */
  private literal(quote: string): string | undefined {
    const src = this.src
    const start = ++this.i
    let plain = true
    while (this.i < src.length && src[this.i] !== quote) {
      if (src[this.i] === '\\') {
        this.i += src.startsWith('\r\n', this.i + 1) ? 3 : 2
      } else if (quote === '`' && src.startsWith('${', this.i)) {
        plain = false
        this.i += 2
        this.open.push('$')
        this.code()
      } else {
        this.i++
      }
    }
    const end = this.i++
    return plain ? decode(src.slice(start, end)) : undefined
  }

  /** A regular expression literal starting at `i`; `i` past its flags. */
  private regex(): void {
    const src = this.src
    let inClass = false
    this.i++
    while (this.i < src.length && src[this.i] !== '\n') {
      const c = src[this.i++]
      if (c === '\\') {
        this.i++
      } else if (c === '[') {
        inClass = true
      } else if (c === ']') {
        inClass = false
      } else if (c === '/' && !inClass) {
        break
      }
    }
    while (this.i < src.length && /[a-z]/i.test(src[this.i])) {
      this.i++
    }
  }
}

/**
 * The string literals of JavaScript `source`, as the strings they evaluate to: `'…'`, `"…"` and
 * `` `…` `` templates without `${…}` (the literals inside a `${…}` count). Comments and regular
 * expression literals are skipped; empty and blank literals are left out.
 */
export function stringLiterals(source: string): string[] {
  const out = new Set<string>()
  new LiteralScanner(source, out).code()
  return [...out]
}

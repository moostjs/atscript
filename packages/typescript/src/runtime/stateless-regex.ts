/**
 * The regex a validator tests with: one whose `test` keeps no state between calls.
 *
 * With the `g` or `y` flag, `RegExp.prototype.test` starts at `lastIndex` and moves it
 * (past a match, or back to 0 after a miss), so one regex object shared by every check of a
 * pattern would accept and reject the same value on alternate calls. The flags are dropped
 * when the regex is compiled, which costs nothing per test: `g` does not change what `test`
 * finds from `lastIndex` 0, and `y` matches only at `lastIndex` 0 — at the start of the
 * value — so it becomes an anchor at the start of the input (`^`, or a look-behind under
 * `m`, where `^` also matches after a line break). Other regexes are returned as they are.
 */
export function statelessRegExp(re: RegExp): RegExp {
  if (!re.global && !re.sticky) {
    return re
  }
  const flags = re.flags.replace(/[gy]/g, '')
  if (!re.sticky) {
    return new RegExp(re.source, flags)
  }
  return new RegExp(`${re.multiline ? '(?<![\\s\\S])' : '^'}(?:${re.source})`, flags)
}

/**
 * The source of a pattern written with `flags` as a JSON Schema `pattern` (which has no flags),
 * matching the same strings as the validator's regex:
 *
 * - `s`: every `.` outside a character class becomes `[\s\S]`;
 * - `i`: every character that has case variants becomes a class of them (`a` → `[aA]`,
 *   `[a-f]` → `[a-fA-F]`, with `u` also `s` → `[sSſ]`, `\w` → `[\wſK]`); a pattern
 *   using what has no flag-free form — a backreference, a Unicode property escape or (with `u`)
 *   `\b` / `\B` / `\W` in a class, a range of more than 1024 characters with non-ASCII ones — is
 *   also wrapped in a modifier group `(?i:…)`;
 * - `m`: the pattern is wrapped in a modifier group `(?m:…)` (`^` / `$` at line breaks have no
 *   flag-free form without look-behinds);
 * - `y`: matches at the start of the value only (see {@link statelessRegExp}): `^(?:…)`;
 * - `g` changes nothing; `u` is the dialect of the pattern (JSON Schema validators commonly compile
 *   patterns with it — ajv does).
 *
 * Modifier groups (ES2025) are understood by JavaScript engines from 2024 on (Node.js 23+, V8 12.5+)
 * and by some other regex dialects (.NET, PCRE2, Python 3.6+), not by all.
 */
export function jsonSchemaPattern(pattern: string, flags: string | undefined): string {
  if (!flags) {
    return pattern
  }
  const unicode = flags.includes('u')
  const modifiers = new Set<string>()
  let body = pattern
  if (flags.includes('i') || flags.includes('s')) {
    const translated = translateFlags(pattern, unicode, flags.includes('i'), flags.includes('s'))
    if (translated) {
      body = translated.source
      if (translated.modifier) {
        modifiers.add('i')
      }
    } else {
      // (not parsed: the flags as a modifier group)
      for (const flag of 'is') {
        if (flags.includes(flag)) {
          modifiers.add(flag)
        }
      }
    }
  }
  if (flags.includes('m')) {
    modifiers.add('m')
  }
  if (modifiers.size > 0) {
    body = `(?${[...modifiers].sort().join('')}:${body})`
  }
  return flags.includes('y') ? `^(?:${body})` : body
}

/**
 * Characters case-insensitive matching relates to characters that case mapping does not lead to
 * from them (`k` → `K`, but `K` (U+212A) only folds to `k`): groups closing the search of
 * {@link caseVariants} (the regex engine then keeps those that match).
 */
const FOLD_GROUPS = [
  'kKK',
  'sSſ',
  'ÅåÅ',
  'ßẞ',
  'Ǆǅǆ',
  'Ǉǈǉ',
  'Ǌǋǌ',
  'Ǳǲǳ',
  'ͅΙιι',
  'ΐΐ',
  'Ββϐ',
  'Εεϵ',
  'Θθϑϴ',
  'Κκϰ',
  'µΜμ',
  'Ππϖ',
  'Ρρϱ',
  'Σςσ',
  'Φφϕ',
  'ΩωΩ',
  'ΰΰ',
  'Ввᲀ',
  'Ддᲁ',
  'Ооᲂ',
  'Ссᲃ',
  'Ттᲄᲅ',
  'Ъъᲆ',
  'Ѣѣᲇ',
  'Ṡṡẛ',
  'ᲈꙊꙋ',
  'ﬅﬆ',
  // (Greek with prosgegrammeni / ypogegrammeni: lowercase and titlecase)
  ...[0x1f80, 0x1f90, 0x1fa0].flatMap(base =>
    Array.from({ length: 8 }, (_, k) => String.fromCodePoint(base + k, base + k + 8))
  ),
  'ᾳᾼ',
  'ῃῌ',
  'ῳῼ',
]

let foldGroupOf: Map<string, string> | undefined

/** The characters matching `ch` under `i` (with `u`: case folding), `ch` first. */
const variantCache = new Map<string, string[]>()
function caseVariants(ch: string, unicode: boolean): string[] {
  const key = `${unicode ? 'u' : ''}${ch}`
  let out = variantCache.get(key)
  if (!out) {
    if (!foldGroupOf) {
      foldGroupOf = new Map()
      for (const group of FOLD_GROUPS) {
        for (const member of group) {
          foldGroupOf.set(member, group)
        }
      }
    }
    const single = (x: string) =>
      unicode ? x.length === String.fromCodePoint(x.codePointAt(0)!).length : x.length === 1
    const found = new Set([ch])
    const queue = [ch]
    while (queue.length > 0) {
      const x = queue.pop()!
      for (const y of [x.toLowerCase(), x.toUpperCase(), ...(foldGroupOf.get(x) ?? '')]) {
        if (single(y) && !found.has(y)) {
          found.add(y)
          queue.push(y)
        }
      }
    }
    const re = new RegExp(`^${escapeChar(ch, unicode)}$`, unicode ? 'iu' : 'i')
    out = [...found].filter(x => x === ch || re.test(x))
    variantCache.set(key, out)
  }
  return out
}

/** A character as a regex escape (`\uXXXX`, or `\u{…}` with `u` outside the BMP). */
function escapeChar(ch: string, unicode: boolean): string {
  const cp = ch.codePointAt(0)!
  return cp > 0xffff && unicode
    ? `\\u{${cp.toString(16).toUpperCase()}}`
    : `\\u${cp.toString(16).toUpperCase().padStart(4, '0')}`
}

/** A character as a member of a character class (escaped where needed). */
function classChar(ch: string, unicode: boolean): string {
  const cp = ch.codePointAt(0)!
  if (/[\\\][\-^]/.test(ch)) {
    return `\\${ch}`
  }
  if (cp < 0x20 || cp > 0x7e) {
    return escapeChar(ch, unicode)
  }
  return ch
}

/** `ch` outside a class, as it matches under `i` (a class of its case variants). */
function caseLiteral(ch: string, raw: string, unicode: boolean): string {
  const variants = caseVariants(ch, unicode)
  return variants.length === 1 ? raw : `[${variants.map(v => classChar(v, unicode)).join('')}]`
}

/** The ranges of a sorted list of code points, as class members. */
function classRanges(points: number[], unicode: boolean): string {
  let out = ''
  for (let k = 0; k < points.length; ) {
    let end = k
    while (end + 1 < points.length && points[end + 1] === points[end] + 1) {
      end++
    }
    const lo = String.fromCodePoint(points[k])
    const hi = String.fromCodePoint(points[end])
    out +=
      end === k ? classChar(lo, unicode) : `${classChar(lo, unicode)}-${classChar(hi, unicode)}`
    k = end + 1
  }
  return out
}

/** The largest range of non-ASCII characters whose case variants are spelled out. */
const MAX_RANGE = 1024

/** What `\w` also matches under `iu` (characters folding to a word character). */
const WORD_FOLDS = '\\u017F\\u212A'

/**
 * `pattern` with `i` (characters → classes of their case variants) and `s` (`.` → `[\s\S]`)
 * applied (`modifier`: what has no flag-free form, see {@link jsonSchemaPattern}), or
 * `undefined` when it is not parsed.
 */
function translateFlags(
  pattern: string,
  unicode: boolean,
  ignoreCase: boolean,
  dotAll: boolean
): { source: string; modifier: boolean } | undefined {
  let out = ''
  let i = 0
  let modifier = false
  const n = pattern.length
  /** The character at `i` (a code point with `u`). */
  const charAt = (at: number) =>
    unicode ? String.fromCodePoint(pattern.codePointAt(at)!) : pattern[at]

  /**
   * Reads an escape at `i` (after the backslash): its character (`ch`), or as written (`raw`)
   * with what it needs (`modifier`: no flag-free form under `i`), or `undefined` (not parsed).
   */
  const readEscape = (
    inClass: boolean
  ): { ch?: string; raw: string; modifier?: boolean; word?: boolean } | undefined => {
    const start = i - 1
    const c = pattern[i]
    if (c === undefined) {
      return undefined
    }
    i++
    const raw = () => pattern.slice(start, i)
    switch (c) {
      case 'd':
      case 'D':
      case 's':
      case 'S': {
        return { raw: raw() }
      }
      case 'w': {
        return { raw: raw(), word: true }
      }
      case 'W': {
        return { raw: raw(), word: true, modifier: inClass && unicode }
      }
      case 'b': {
        return inClass ? { ch: '\b', raw: raw() } : { raw: raw(), modifier: unicode }
      }
      case 'B': {
        return inClass ? undefined : { raw: raw(), modifier: unicode }
      }
      case 'p':
      case 'P': {
        if (!unicode) {
          return { ch: c, raw: raw() }
        }
        const end = pattern.indexOf('}', i)
        if (pattern[i] !== '{' || end < 0) {
          return undefined
        }
        i = end + 1
        return { raw: raw(), modifier: true }
      }
      case 'k': {
        const name = /^<[^>]*>/.exec(pattern.slice(i))
        if (name) {
          i += name[0].length
          return { raw: raw(), modifier: true }
        }
        return unicode ? undefined : { ch: 'k', raw: raw() }
      }
      case 'c': {
        const next = pattern[i]
        if (next && /[A-Za-z]/.test(next)) {
          i++
          return { ch: String.fromCodePoint(next.codePointAt(0)! % 32), raw: raw() }
        }
        return undefined
      }
      case 'x': {
        const hex = pattern.slice(i, i + 2)
        if (!/^[\da-fA-F]{2}$/.test(hex)) {
          return undefined
        }
        i += 2
        return { ch: String.fromCodePoint(Number.parseInt(hex, 16)), raw: raw() }
      }
      case 'u': {
        if (unicode && pattern[i] === '{') {
          const end = pattern.indexOf('}', i)
          if (end < 0) {
            return undefined
          }
          const cp = Number.parseInt(pattern.slice(i + 1, end), 16)
          i = end + 1
          return { ch: String.fromCodePoint(cp), raw: raw() }
        }
        const hex = pattern.slice(i, i + 4)
        if (!/^[\da-fA-F]{4}$/.test(hex)) {
          return undefined
        }
        i += 4
        let code = Number.parseInt(hex, 16)
        // (with `u`, a surrogate pair written as two escapes is one character)
        if (unicode && code >= 0xd800 && code <= 0xdbff) {
          const low = /^\\u([dD][c-fC-F][\da-fA-F]{2})/.exec(pattern.slice(i))
          if (low) {
            i += 6
            code = 0x10000 + ((code - 0xd800) << 10) + (Number.parseInt(low[1], 16) - 0xdc00)
          }
        }
        return { ch: String.fromCodePoint(code), raw: raw() }
      }
      case '0': {
        return /\d/.test(pattern[i] ?? '') ? undefined : { ch: '\0', raw: raw() }
      }
      case 'f':
      case 'n':
      case 'r':
      case 't':
      case 'v': {
        return { ch: { f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' }[c], raw: raw() }
      }
      default: {
        if (/[1-9]/.test(c)) {
          // a backreference (or, without `u`, maybe an octal escape)
          if (unicode || !inClass) {
            while (/\d/.test(pattern[i] ?? '')) {
              i++
            }
            return inClass ? undefined : { raw: raw(), modifier: true }
          }
          return undefined
        }
        // an identity escape: the character itself
        i = start + 1
        const ch = charAt(i)
        i += ch.length
        return { ch, raw: raw() }
      }
    }
  }

  /** Reads a character class at `i` (`[…]`), its characters with their case variants. */
  const readClass = (): string | undefined => {
    const start = i
    i++
    let negated = ''
    if (pattern[i] === '^') {
      negated = '^'
      i++
    }
    type TItem = { ch: string } | { raw: string; word?: boolean } | { dash: true }
    const items: TItem[] = []
    while (i < n && pattern[i] !== ']') {
      if (pattern[i] === '\\') {
        i++
        const esc = readEscape(true)
        if (!esc) {
          return undefined
        }
        modifier ||= !!esc.modifier && ignoreCase
        items.push(esc.ch === undefined ? { raw: esc.raw, word: esc.word } : { ch: esc.ch })
        continue
      }
      const ch = charAt(i)
      i += ch.length
      items.push(ch === '-' ? { dash: true } : { ch })
    }
    if (i >= n) {
      return undefined
    }
    i++
    if (!ignoreCase) {
      return pattern.slice(start, i)
    }
    const points = new Set<number>()
    let body = ''
    const addChar = (ch: string) => {
      for (const v of caseVariants(ch, unicode)) {
        points.add(v.codePointAt(0)!)
      }
    }
    for (let k = 0; k < items.length; k++) {
      const item = items[k]
      const dash = items[k + 1]
      const hi = items[k + 2]
      if ('ch' in item && dash && 'dash' in dash && hi && 'ch' in hi) {
        const lo = item.ch.codePointAt(0)!
        const top = hi.ch.codePointAt(0)!
        if (top > 0x7f && top - lo >= MAX_RANGE) {
          // (kept as written, matched case-insensitively by the modifier group)
          modifier = true
          body += `${classChar(item.ch, unicode)}-${classChar(hi.ch, unicode)}`
        } else {
          for (let cp = lo; cp <= top; cp++) {
            addChar(String.fromCodePoint(cp))
          }
        }
        k += 2
        continue
      }
      if ('dash' in item) {
        points.add(0x2d)
      } else if ('raw' in item) {
        body += item.raw
        if (item.word && unicode && item.raw === '\\w') {
          body += WORD_FOLDS
        }
      } else {
        addChar(item.ch)
      }
    }
    body += classRanges(
      [...points].sort((a, b) => a - b),
      unicode
    )
    return `[${negated}${body}]`
  }

  while (i < n) {
    const c = pattern[i]
    if (c === '\\') {
      i++
      const esc = readEscape(false)
      if (!esc) {
        return undefined
      }
      if (!ignoreCase) {
        out += esc.raw
      } else if (esc.ch !== undefined) {
        out += caseLiteral(esc.ch, esc.raw, unicode)
      } else {
        modifier ||= !!esc.modifier
        out +=
          esc.word && unicode
            ? esc.raw === '\\w'
              ? `[\\w${WORD_FOLDS}]`
              : `[^\\w${WORD_FOLDS}]`
            : esc.raw
      }
      continue
    }
    if (c === '[') {
      const cls = readClass()
      if (cls === undefined) {
        return undefined
      }
      out += cls
      continue
    }
    if (c === '(') {
      if (pattern[i + 1] === '?') {
        const header = /^\(\?(?::|=|!|<=|<!|<[^>]+>)/.exec(pattern.slice(i))
        if (!header) {
          // (a modifier group of the pattern itself)
          return undefined
        }
        out += header[0]
        i += header[0].length
        continue
      }
      out += c
      i++
      continue
    }
    if (c === '{') {
      const quantifier = /^\{\d+(?:,\d*)?\}/.exec(pattern.slice(i))
      if (quantifier) {
        out += quantifier[0]
        i += quantifier[0].length
        continue
      }
      // (without `u`, a `{` that is not a quantifier is the character)
    }
    if (c === '.' && dotAll) {
      out += '[\\s\\S]'
      i++
      continue
    }
    const ch = charAt(i)
    i += ch.length
    out += ignoreCase && !'^$|)*+?.]}{'.includes(ch) ? caseLiteral(ch, ch, unicode) : ch
  }
  return { source: out, modifier }
}

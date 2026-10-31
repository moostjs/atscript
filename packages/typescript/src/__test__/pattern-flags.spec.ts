import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build } from '@atscript/core'
import { describe, expect, it } from 'vitest'

import { tsPlugin } from '../plugin'
import { defineAnnotatedType } from '../runtime/annotated-type'
import { buildJsonSchema } from '../runtime/json-schema'
import { jsonSchemaPattern, statelessRegExp } from '../runtime/stateless-regex'
import { schemaDisagreements } from './json-schema-oracle'

/*
 * `@expect.pattern` flags, exhaustively: every combination of the flags `g i m s u y` × pattern
 * features (letters, classes and ranges, `.`, anchors, alternation, groups, look-arounds,
 * backreferences, class escapes, property escapes, cased and caseless non-ASCII characters,
 * character escapes, quantifiers) × values. The JSON Schema `pattern` (no flags) matches what the
 * validator matches, compiled the way JSON Schema validators compile patterns (ajv: with `u`; a
 * pattern written without `u` compiled without it — with `u`, characters outside the BMP count as
 * one). And the compiler reports a pattern iff the runtime cannot compile it, for every flag string.
 */

const FLAGS = 'gimsuy'
/** Every combination of the flags (in canonical order). */
const COMBINATIONS = Array.from({ length: 1 << FLAGS.length }, (_, mask) =>
  [...FLAGS].filter((_, b) => mask & (1 << b)).join('')
)

const PATTERNS = [
  'abc',
  'ABC',
  '^ab$',
  '^b|c$',
  'a.b',
  '^.$',
  '.+',
  '[a-c]+',
  '[^a-c]',
  '[0-z]',
  '[A-Za-z]',
  '[k-t]',
  '[S]',
  '[\\w-]',
  '[-a]',
  '[a\\-z]',
  '[.]',
  'x|',
  '(a)(b)?',
  '(?:ab)+',
  '(?=a)a',
  '(?!a)\\w',
  '(?<=a)b',
  '(?<!a)b',
  '(?<n>a)\\k<n>',
  '(a)\\1',
  '\\w+',
  '\\W',
  '\\bk',
  '\\Bs',
  '\\d\\s\\S\\D',
  '\\x41\\u0062',
  '\\cJ',
  '\\.',
  'a{2,3}',
  'a{2}$',
  'é',
  'ÉΣ',
  'ς',
  '中😀',
  'ſ',
  'K',
  'İ',
  '\\p{Lu}',
  '\\P{Ll}+',
  '\\u{1F600}',
  '[é-ü]',
  '[\\u0041-\\u005A]',
  '^$',
  '[^]',
  '[]',
  '\\0',
]

const VALUES = [
  '',
  'a',
  'A',
  'b',
  'B',
  'c',
  'ab',
  'AB',
  'aB',
  'abc',
  'ABC',
  'aBc',
  'aa',
  'aA',
  'ab\nAB',
  'a\nb',
  'b\nc',
  'x\nb',
  '\n',
  'axb',
  'ba',
  'bb',
  'k',
  'K',
  'K',
  's',
  'S',
  'ſ',
  'kS',
  'é',
  'É',
  'σ',
  'Σ',
  'ς',
  'ÉΣ',
  'éσ',
  'éς',
  'i',
  'I',
  'İ',
  'ı',
  '中😀',
  '😀',
  '\uD83D',
  'aaa',
  'x',
  'x|',
  '.',
  '-',
  '_',
  '0',
  'z',
  'Z',
  '\u0000',
]

/** The validator's verdict on `value` for `@expect.pattern pattern, flags`. */
function validatorVerdict(pattern: string, flags: string, value: string): boolean {
  const type = defineAnnotatedType()
    .designType('string')
    .annotate('expect.pattern', { pattern, flags }, true).$type
  return type.validator().validate(value, true)
}

describe('@expect.pattern flags in JSON schemas', () => {
  it('every flag combination × pattern feature × value: the schema matches like the validator', () => {
    let checked = 0
    let portable = 0
    const disagreements: string[] = []
    for (const flags of COMBINATIONS) {
      for (const pattern of PATTERNS) {
        try {
          new RegExp(pattern, flags)
        } catch {
          // (a compile error, see below)
          continue
        }
        const type = defineAnnotatedType()
          .designType('string')
          .annotate('expect.pattern', { pattern, flags }, true).$type
        const schemaPattern = buildJsonSchema(type).pattern as string
        expect(schemaPattern).toBe(jsonSchemaPattern(pattern, flags))
        if (!/\(\?[ims]+:/.test(schemaPattern) || /\(\?[ims]+:/.test(pattern)) {
          portable++
        }
        // How a JSON Schema validator compiles it (ajv: `new RegExp(pattern, 'u')`).
        const consumer = new RegExp(schemaPattern, flags.includes('u') ? 'u' : '')
        for (const value of VALUES) {
          const expected = validatorVerdict(pattern, flags, value)
          if (consumer.test(value) !== expected) {
            disagreements.push(
              `/${pattern}/${flags} → ${JSON.stringify(schemaPattern)} on ${JSON.stringify(value)}: validator ${expected}`
            )
          }
          checked++
        }
      }
    }
    expect(disagreements.slice(0, 20)).toEqual([])
    expect(checked).toBeGreaterThan(100_000)
    console.info(
      `[flags] ${checked} checks; ${portable} pattern/flag pairs without a modifier group`
    )
  })

  it('every cased character, alone and in a class, matches exactly what the flag matches', () => {
    // Over the characters case mapping or folding changes (the only ones related to others);
    // `ATSCRIPT_LARGE_TESTS=1`: over every code point (of the BMP, for the classes of the
    // characters; every one for the ASCII letters).
    const cased: string[] = []
    for (let cp = 0; cp <= 0x10ffff; cp++) {
      if (cp < 0xd800 || cp > 0xdfff) {
        const ch = String.fromCodePoint(cp)
        if (/[\p{CWCM}\p{CWCF}]/u.test(ch)) {
          cased.push(ch)
        }
      }
    }
    const large = !!process.env.ATSCRIPT_LARGE_TESTS
    const bmp = large ? Array.from({ length: 0x10000 }, (_, cp) => String.fromCodePoint(cp)) : []
    const escape = (ch: string, unicode: boolean) =>
      unicode
        ? `\\u{${ch.codePointAt(0)!.toString(16)}}`
        : `\\u${ch.codePointAt(0)!.toString(16).padStart(4, '0')}`
    let checked = 0
    for (const unicode of [false, true]) {
      const flags = unicode ? 'iu' : 'i'
      const candidates = cased.filter(ch => unicode || ch.length === 1)
      for (const ch of candidates) {
        const source = escape(ch, unicode)
        const re = new RegExp(`^${source}$`, flags)
        const alone = new RegExp(`^(?:${jsonSchemaPattern(source, flags)})$`, unicode ? 'u' : '')
        const inClass = new RegExp(
          `^${jsonSchemaPattern(`[${source}]`, flags)}$`,
          unicode ? 'u' : ''
        )
        const negated = new RegExp(
          `^${jsonSchemaPattern(`[^${source}]`, flags)}$`,
          unicode ? 'u' : ''
        )
        for (const d of large ? [...candidates, ...bmp] : candidates) {
          const expected = re.test(d)
          if (
            alone.test(d) !== expected ||
            inClass.test(d) !== expected ||
            negated.test(d) === expected
          ) {
            throw new Error(
              `U+${ch.codePointAt(0)!.toString(16)} (${flags}) on U+${d.codePointAt(0)!.toString(16)}`
            )
          }
          checked++
        }
      }
      // ASCII letters over every code point
      if (large) {
        for (const letter of 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ') {
          const re = new RegExp(`^${letter}$`, flags)
          const translated = new RegExp(`^${jsonSchemaPattern(letter, flags)}$`, unicode ? 'u' : '')
          for (let cp = 0; cp <= (unicode ? 0x10ffff : 0xffff); cp++) {
            if (unicode && cp >= 0xd800 && cp <= 0xdfff) {
              continue
            }
            const d = String.fromCodePoint(cp)
            if (re.test(d) !== translated.test(d)) {
              throw new Error(`${letter} (${flags}) on U+${cp.toString(16)}`)
            }
            checked++
          }
        }
      }
    }
    console.info(`[flags] ${checked} character checks (${cased.length} cased characters)`)
  }, 1_800_000)

  it('ranges of characters: every range of up to 1024 characters of a block, case-insensitively', () => {
    // Ranges whose ends are cased letters of Latin, Greek, Cyrillic … blocks (the variants of all
    // the characters in them), against the flag.
    let checked = 0
    for (const unicode of [false, true]) {
      const flags = unicode ? 'iu' : 'i'
      for (const [lo, hi] of [
        [0x41, 0x5a],
        [0x61, 0x7a],
        [0x30, 0x7a],
        [0xc0, 0xff],
        [0x100, 0x17f],
        [0x370, 0x3ff],
        [0x400, 0x4ff],
        [0x1e00, 0x1fff],
        [0x2100, 0x214f],
        [0x10400, 0x1044f],
        [0x6b, 0x212a],
      ]) {
        if (!unicode && hi > 0xffff) {
          continue
        }
        const esc = (cp: number) =>
          unicode ? `\\u{${cp.toString(16)}}` : `\\u${cp.toString(16).padStart(4, '0')}`
        const source = `[${esc(lo)}-${esc(hi)}]`
        const re = new RegExp(`^${source}$`, flags)
        const schema = jsonSchemaPattern(source, flags)
        const translated = new RegExp(`^${schema}$`, unicode ? 'u' : '')
        for (let cp = 0; cp <= (unicode ? 0x1ffff : 0xffff); cp++) {
          if (unicode && cp >= 0xd800 && cp <= 0xdfff) {
            continue
          }
          const d = String.fromCodePoint(cp)
          if (re.test(d) !== translated.test(d)) {
            throw new Error(`${source} (${flags}) → ${schema} on U+${cp.toString(16)}`)
          }
          checked++
        }
      }
    }
    console.info(`[flags] ${checked} range checks`)
  }, 600_000)
})

describe('@expect.pattern flags: JSON schemas checked by ajv', () => {
  it('every flag combination × pattern × value: runtime and bundled schemas accept what the validator does', async () => {
    // Interfaces of optional props, a prop per flag combination × pattern (32 per interface),
    // per `u` / no `u` (ajv compiles patterns with `u`; those written without it, without); a
    // value checked in the prop of its pattern.
    const CHUNK = 32
    const cases: Record<'u' | 'n', Array<{ pattern: string; flags: string }>> = { u: [], n: [] }
    for (const flags of COMBINATIONS) {
      for (const pattern of PATTERNS.filter(p => !p.includes('"'))) {
        try {
          new RegExp(pattern, flags)
        } catch {
          continue
        }
        cases[flags.includes('u') ? 'u' : 'n'].push({ pattern, flags })
      }
    }
    const lines: string[] = []
    for (const [kind, list] of Object.entries(cases)) {
      for (const [i, { pattern, flags }] of list.entries()) {
        if (i % CHUNK === 0) {
          lines.push(`${i > 0 ? '}\n' : ''}export interface Patterns${kind}${i / CHUNK} {`)
        }
        lines.push(
          `  @expect.pattern "${pattern}"${flags ? `, "${flags}"` : ''}`,
          `  p${i}?: string`
        )
      }
      lines.push('}')
    }
    const dir = mkdtempSync(path.join(tmpdir(), 'atscript-flags-ajv-'))
    try {
      writeFileSync(path.join(dir, 'p.as'), lines.join('\n'))
      const repo = await build({
        rootDir: dir,
        entries: ['p.as'],
        plugins: [tsPlugin({ jsonSchema: 'bundle' })],
      })
      const errors = [...(await repo.diagnostics()).values()].flat().filter(m => m.severity === 1)
      expect(errors.map(m => m.message)).toEqual([])
      const [js] = await repo.generate({ format: 'js' })
      writeFileSync(path.join(dir, 'p.as.js'), js.content)
      const module = await import(path.join(dir, 'p.as.js'))
      const stats = { checks: 0 }
      const disagreements: string[] = []
      for (const [kind, list] of Object.entries(cases)) {
        for (let chunk = 0; chunk * CHUNK < list.length; chunk++) {
          const values = list
            .slice(chunk * CHUNK, (chunk + 1) * CHUNK)
            .flatMap((_, i) => VALUES.map(value => ({ [`p${chunk * CHUNK + i}`]: value })))
          disagreements.push(
            ...schemaDisagreements(
              `Patterns${kind}${chunk}`,
              module[`Patterns${kind}${chunk}`],
              values,
              true,
              stats,
              kind === 'n'
            )
          )
        }
      }
      expect(disagreements.slice(0, 20)).toEqual([])
      expect(stats.checks).toBeGreaterThan(100_000)
      console.info(`[flags] ajv: ${stats.checks} checks`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 600_000)
})

describe('@expect.pattern: the compiler reports what the runtime cannot compile', () => {
  it('every flag string × pattern: an error iff the flags are not allowed or the regex does not compile', async () => {
    const allowed = new Set(COMBINATIONS)
    // Every flag string of the JS flags in canonical order, some out of order / repeated / unknown.
    const flagStrings = [
      ...Array.from({ length: 1 << 8 }, (_, mask) =>
        [...'dgimsuvy'].filter((_, b) => mask & (1 << b)).join('')
      ),
      // an explicit empty flags argument (a message can follow)
      'EMPTY',
      'mi',
      'ug',
      'ii',
      'q',
      'iq',
      'Y',
    ]
    const patterns = [
      ...PATTERNS,
      'a{',
      '\\-',
      '[\\w-a]',
      '\\k',
      '(?<n>a)\\k<m>',
      '\\u{61}',
      '\\p{Nope}',
      '(',
      'a)',
      '[',
      '*',
      '\\c',
      '\\8',
      '[\\p{L}--[a]]',
      '\\q{x}',
      '(?<a>x)(?<a>y)',
    ].filter(p => !p.includes('"'))
    const cases = flagStrings.flatMap(flags => patterns.map(pattern => ({ flags, pattern })))
    const dir = mkdtempSync(path.join(tmpdir(), 'atscript-flags-'))
    try {
      const lines = ['export interface Patterns {']
      for (const [i, { flags, pattern }] of cases.entries()) {
        const arg = flags === 'EMPTY' ? ', "", "message"' : flags ? `, "${flags}"` : ''
        lines.push(`  @expect.pattern "${pattern}"${arg}`, `  p${i}: string`)
      }
      lines.push('}')
      writeFileSync(path.join(dir, 'p.as'), lines.join('\n'))
      const repo = await build({ rootDir: dir, entries: ['p.as'], plugins: [tsPlugin()] })
      const errorLines = new Set(
        [...(await repo.diagnostics()).values()]
          .flat()
          .filter(m => m.severity === 1)
          .map(m => m.range.start.line)
      )
      const mismatches: string[] = []
      for (const [i, { flags, pattern }] of cases.entries()) {
        const runtimeFlags = flags === 'EMPTY' ? '' : flags
        let constructible = allowed.has(runtimeFlags) || runtimeFlags === ''
        if (constructible) {
          try {
            statelessRegExp(new RegExp(pattern, runtimeFlags))
          } catch {
            constructible = false
          }
        }
        // (the annotation of case `i` is on line `1 + 2i`, 0-based)
        const reported = errorLines.has(1 + 2 * i)
        if (reported === constructible) {
          mismatches.push(`/${pattern}/${flags}: reported ${reported}, compiles ${constructible}`)
        }
      }
      expect(mismatches.slice(0, 20)).toEqual([])
      console.info(`[flags] ${cases.length} flag/pattern pairs checked against the compiler`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

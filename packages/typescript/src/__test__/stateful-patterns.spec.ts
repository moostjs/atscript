import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build } from '@atscript/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { compileType } from '../../test/compiled-engine'
import { tsPlugin } from '../plugin'
import {
  defineAnnotatedType as $,
  type TAtscriptAnnotatedType,
  type TAtscriptTypeObject,
} from '../runtime/annotated-type'
import { compiledCheckFor } from '../runtime/compiled-check/registry'
import { buildJsonSchema } from '../runtime/json-schema'
import { deserializeAnnotatedType, serializeAnnotatedType } from '../runtime/serialize'
import { Validator, type TValidatorOptions } from '../runtime/validator'
import { COMPILED_ENV, fastCheckPasses } from '../runtime/validator-fast-check'
import { WalkValidator } from '../test-utils'

// A `g` / `y` regex keeps `lastIndex` between `test` calls: tested as written, the same value
// passed and failed on alternate calls (and the engines disagreed on it).

const str = (pattern: string, flags?: string) =>
  $()
    .designType('string')
    .tags('string')
    .annotate('expect.pattern', flags === undefined ? { pattern } : { pattern, flags }, true).$type

/** `value` checked by every engine, three times each: one result per engine. */
function results(type: TAtscriptAnnotatedType, value: unknown) {
  const opts = new Validator(type)['opts'] as TValidatorOptions
  const twin = { ...type } // no compiled check: the interpreted pre-check
  compileType(type)
  const check = compiledCheckFor(type, COMPILED_ENV)!
  expect(check).not.toBeNull()
  const out: Record<string, unknown[]> = { walk: [], validator: [], interp: [], compiled: [] }
  for (let i = 0; i < 3; i++) {
    out.walk.push(new WalkValidator(type).validate(value, true))
    out.validator.push(new Validator(type).validate(value, true))
    out.interp.push(fastCheckPasses(twin, value, opts))
    // 1: passes, 0: fails, 2: left to the walk
    out.compiled.push(check(value, 1, opts))
  }
  return out
}

const all = (expected: boolean) => ({
  walk: [expected, expected, expected],
  validator: [expected, expected, expected],
  interp: [expected, expected, expected],
  compiled: Array.from({ length: 3 }, () => (expected ? 1 : 0)),
})

describe('@expect.pattern with the g / y flags', () => {
  it('g: the same result on every call, in every engine', () => {
    expect(results($('object').prop('s', str('^x', 'g')).$type, { s: 'xa' })).toEqual(all(true))
    expect(results($('object').prop('s', str('^x', 'gi')).$type, { s: 'Xa' })).toEqual(all(true))
    expect(results($('object').prop('s', str('^x', 'g')).$type, { s: 'ax' })).toEqual(all(false))
  })

  it('y: matches at the start of the value only, on every call, in every engine', () => {
    const t = (flags: string) => $('object').prop('s', str('ab', flags)).$type
    expect(results(t('y'), { s: 'abc' })).toEqual(all(true))
    expect(results(t('y'), { s: 'xab' })).toEqual(all(false))
    expect(results(t('gy'), { s: 'abab' })).toEqual(all(true))
    // under `m`, `^` would also match after a line break: `y` does not
    expect(results(t('my'), { s: 'ab\nx' })).toEqual(all(true))
    expect(results(t('my'), { s: 'x\nab' })).toEqual(all(false))
    // alternatives stay anchored together
    const alt = $('object').prop('s', str('a|b', 'y')).$type
    expect(results(alt, { s: 'bx' })).toEqual(all(true))
    expect(results(alt, { s: 'xb' })).toEqual(all(false))
  })

  it('two validators of one pattern do not share a position', () => {
    const t = $('object').prop('s', str('x', 'g')).$type
    const a = new Validator(t)
    const b = new WalkValidator(t)
    for (let i = 0; i < 4; i++) {
      expect([a.validate({ s: 'x' }, true), b.validate({ s: 'x' }, true)]).toEqual([true, true])
    }
  })

  it('an invalid pattern still throws (the validator reports it as before)', () => {
    const t = $('object').prop('s', str('a)(b', 'y')).$type
    expect(() => new WalkValidator(t).validate({ s: 'a' }, true)).toThrow(SyntaxError)
  })

  it('deserialized metadata keeps the flags and validates the same', () => {
    const t = $('object').prop('g', str('^x', 'g')).prop('y', str('ab', 'y')).$type
    const restored = deserializeAnnotatedType(
      JSON.parse(JSON.stringify(serializeAnnotatedType(t)))
    ) as TAtscriptAnnotatedType<TAtscriptTypeObject>
    expect(restored.type.props.get('g')!.metadata.get('expect.pattern')).toEqual([
      { pattern: '^x', flags: 'g' },
    ])
    expect(results(restored, { g: 'xa', y: 'abc' })).toEqual(all(true))
    expect(results(restored, { g: 'xa', y: 'xab' })).toEqual(all(false))
  })

  it('JSON schema: a y pattern is anchored at the start (a schema pattern has no flags)', () => {
    const t = $('object')
      .prop('g', str('^x', 'g'))
      .prop('y', str('a|b', 'y'))
      .prop(
        'both',
        $()
          .designType('string')
          .tags('string')
          .annotate('expect.pattern', { pattern: 'c', flags: 'y' }, true)
          .annotate('expect.pattern', { pattern: 'd' }, true).$type
      ).$type
    const schema = buildJsonSchema(t) as any
    expect(schema.properties.g.pattern).toBe('^x')
    expect(schema.properties.y.pattern).toBe('^(?:a|b)')
    expect(schema.properties.both.allOf).toEqual([{ pattern: '^(?:c)' }, { pattern: 'd' }])
    // the schema pattern decides like the validator
    for (const value of ['a', 'bx', 'xb', 'xa', '']) {
      expect([value, new RegExp(schema.properties.y.pattern).test(value)]).toEqual([
        value,
        new Validator(t).validate({ g: 'x', y: value, both: 'cd' }, true),
      ])
    }
  })
})

const keyed = (pattern: RegExp) =>
  $('object').propPattern(pattern, $().designType('string').tags('string').$type).$type

const keyResults = (type: TAtscriptAnnotatedType, value: unknown) => {
  const opts: Partial<TValidatorOptions> = { unknownProps: 'error' }
  return Array.from({ length: 3 }, () => [
    new WalkValidator(type, opts).validate(value, true),
    new Validator(type, opts).validate(value, true),
  ])
}

describe('prop patterns with the g / y flags', () => {
  it('the same result on every call (built, and deserialized)', () => {
    for (const type of [keyed(/^k/g), keyed(/k/y)]) {
      const restored = deserializeAnnotatedType(
        JSON.parse(JSON.stringify(serializeAnnotatedType(type)))
      )
      for (const t of [type, restored]) {
        expect(keyResults(t, { ka: 'v', kb: 'w' })).toEqual(Array(3).fill([true, true]))
        expect(keyResults(t, { ak: 'v' })).toEqual(Array(3).fill([false, false]))
      }
    }
  })
})

describe('.as sources with g / y flags', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-stateful-'))
  beforeAll(() => {
    writeFileSync(
      path.join(dir, 'flags.as'),
      [
        'export interface Flags {',
        '  @expect.pattern "^x", "g"',
        '  g: string',
        '  @expect.pattern "ab", "y"',
        '  y: string',
        '  @expect.pattern "^c", "i"',
        '  i: string',
        '  keyed: {',
        '    [/^k/g]: string',
        '  }',
        '}',
      ].join('\n')
    )
  })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('the language server warns about the flags', async () => {
    const repo = await build({ rootDir: dir, entries: ['flags.as'], plugins: [tsPlugin()] })
    const diagnostics = await repo.diagnostics()
    const messages = [...diagnostics.values()]
      .flat()
      .map(m => `${m.severity} ${m.range.start.line}: ${m.message}`)
    expect(messages.sort()).toEqual([
      '2 1: Flag "g" has no effect on validation',
      '2 3: Flag "y" matches at the start of the value only (like "^")',
      '2 8: Flag "g" has no effect on validation',
    ])
  })

  for (const compileValidators of [false, true]) {
    it(`generated module (compileValidators: ${compileValidators}): every call agrees`, async () => {
      const repo = await build({
        rootDir: dir,
        entries: ['flags.as'],
        plugins: [tsPlugin({ compileValidators })],
      })
      const [js] = await repo.generate({ format: 'js' })
      const file = path.join(dir, `flags-${compileValidators}.as.js`)
      writeFileSync(file, js.content)
      const { Flags } = await import(file)
      const ok = { g: 'xa', y: 'abc', i: 'Cd', keyed: { ka: 'v' } }
      for (let i = 0; i < 3; i++) {
        expect(Flags.validator().validate(ok, true)).toBe(true)
        expect(new WalkValidator(Flags).validate(ok, true)).toBe(true)
        expect(Flags.validator().validate({ ...ok, y: 'xab' }, true)).toBe(false)
        expect(Flags.validator().validate({ ...ok, keyed: { ak: 'v' } }, true)).toBe(false)
      }
    })
  }
})

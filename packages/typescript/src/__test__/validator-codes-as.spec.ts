import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build } from '@atscript/core'
import { afterAll, describe, expect, it } from 'vitest'

import { boundCheck } from '../../test/compiled-engine'
import { tsPlugin } from '../plugin'
import type { TAtscriptAnnotatedType } from '../runtime/annotated-type'
import { buildJsonSchema } from '../runtime/json-schema'
import { Validator } from '../runtime/validator'
import { VALIDATOR_MESSAGES } from '../runtime/validator-messages'
import { WalkValidator } from '../test-utils'

/*
 * The validator error codes from `.as` sources: the annotations behind them (`@expect.message`,
 * `@expect.minKeys` / `maxKeys`, `@expect.int`'s message) are checked by their specs and reach the
 * generated modules — interpreted and with build-time compiled checks; the `string.*` primitives'
 * format messages have codes of their own.
 */

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

/** Builds `src` (a `t.as` in a temp dir) with `plugin`: the repo, its dir, its error messages. */
async function buildSrc(src: string, plugin: ReturnType<typeof tsPlugin>) {
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-codes-'))
  dirs.push(dir)
  writeFileSync(path.join(dir, 't.as'), src)
  const repo = await build({ rootDir: dir, entries: ['t.as'], plugins: [plugin] })
  const errors = [...(await repo.diagnostics()).values()]
    .flat()
    .filter(m => m.severity === 1)
    .map(m => m.message)
  return { repo, dir, errors }
}

/** Builds `src`: its error diagnostics (severity 1). */
async function diagnose(src: string): Promise<string[]> {
  const { errors } = await buildSrc(src, tsPlugin())
  return errors
}

/** Builds and loads `src` (no error diagnostics allowed). */
async function load(src: string, compileValidators = false) {
  const { repo, dir, errors } = await buildSrc(
    src,
    tsPlugin({ jsonSchema: false, compileValidators })
  )
  expect(errors).toEqual([])
  const [out] = await repo.generate({ format: 'js' })
  writeFileSync(path.join(dir, 't.as.js'), out.content)
  // (no module reset: the generated module registers its checks with the runtime under test)
  return (await import(path.join(dir, 't.as.js'))) as Record<string, TAtscriptAnnotatedType>
}

const SRC = `export interface Form {
  @expect.message 'Choose a valid status'
  status: 'active' | 'blocked'

  @expect.int 'Whole numbers only'
  count: number

  @expect.message 'Age is a number'
  age?: number.int

  @expect.minKeys 1, 'Add a label'
  @expect.maxKeys 2
  labels: {
    [*]: string
  }

  @expect.minKeys 1
  flags?: {
    a?: boolean
    b?: boolean
  }

  @expect.pattern '^x', '', 'Starts with x'
  ref?: string

  kind?: Kind
}

@expect.message 'Unknown kind'
export type Kind = 'x' | 'y'
`

const VALID = { status: 'active', count: 1, labels: { a: 'x' } }

describe('the annotations behind the codes, from .as', () => {
  for (const compileValidators of [false, true]) {
    it(`reach the validator${compileValidators ? ' (compiled checks)' : ''}`, async () => {
      const { Form } = await load(SRC, compileValidators)
      if (compileValidators) {
        expect(boundCheck(Form)).not.toBeNull()
      }
      const v = new Validator(Form)
      expect(v.validate(VALID, true)).toBe(true)
      expect(v.validate({ ...VALID, flags: { a: true } }, true)).toBe(true)
      const bad = {
        status: 'gone',
        count: 1.5,
        age: 'old',
        labels: {},
        flags: {},
        ref: 'y',
        kind: 'z',
      }
      expect(v.validate(bad, true)).toBe(false)
      expect(v.errors.map(e => [e.path, e.code, e.message, !!e.custom])).toEqual([
        ['status', 'UNION', 'Choose a valid status', true],
        ['count', 'INT', 'Whole numbers only', true],
        ['age', 'TYPE', 'Age is a number', true],
        ['labels', 'MIN_KEYS', 'Add a label', true],
        ['flags', 'MIN_KEYS', 'Expected at least 1 properties, got 0', false],
        // (a message without flags: an empty flags argument)
        ['ref', 'PATTERN', 'Starts with x', true],
        ['kind', 'UNION', 'Unknown kind', true],
      ])
      expect(v.validate({ ...VALID, labels: { a: 'x', b: 'y', c: 'z' } }, true)).toBe(false)
      expect(v.errors).toEqual([
        {
          path: 'labels',
          message: 'Expected at most 2 properties, got 3',
          code: 'MAX_KEYS',
          params: { max: 2, actual: 3 },
        },
      ])
      expect(buildJsonSchema(Form).properties.labels).toMatchObject({
        minProperties: 1,
        maxProperties: 2,
      })
    })
  }

  it('the primitives `@expect.int` (`number.int`) without a message: the default', async () => {
    const { Form } = await load(SRC)
    const v = new Validator(Form)
    expect(v.validate({ ...VALID, age: 1.5 }, true)).toBe(false)
    expect(v.errors).toEqual([
      { path: 'age', message: 'Expected integer, got 1.5', code: 'INT', params: { actual: 1.5 } },
    ])
  })

  it('the specs: where the annotations apply', async () => {
    expect(await diagnose(SRC)).toEqual([])
    expect(
      await diagnose(`export interface A {
  @expect.minKeys 1
  name: string
  @expect.maxKeys 1
  list: string[]
}
`)
    ).toEqual(['Expected type is (object), got "string"', 'Expected type is (object), got "array"'])
    expect(
      await diagnose(`@expect.message 'x'
export interface A {
  a: string
}
`)
    ).toEqual(['@expect.message applies only to prop, type nodes.'])
    // object annotations on inline objects in unions (nullable, and of inline objects only)
    expect(
      await diagnose(`export interface A {
  @expect.minKeys 1
  a?: { k?: number } | null
  @expect.maxKeys 2
  b?: { [*]: string } | null
  @expect.minKeys 1
  c: { k: 'a', x?: number } | { k: 'b', y?: number }
  @expect.minKeys 1
  d: { k?: number }
}
`)
    ).toEqual([])
    // … still not on a union with a non-object member
    expect(
      await diagnose(`export interface A {
  @expect.minKeys 1
  a?: { k?: number } | string
}
`)
    ).toEqual(['Expected type is (object), got union (object | string)'])
    // counts: non-negative integers, the minimum not above the maximum
    expect(
      await diagnose(`export interface A {
  @expect.minKeys 1.5
  a?: { k?: number }
  @expect.maxKeys -1
  b?: { k?: number }
  @expect.minKeys 3
  @expect.maxKeys 1
  c?: { k?: number }
  @expect.minKeys 1
  @expect.maxKeys 1
  d?: { k?: number }
}
`)
    ).toEqual([
      '@expect.minKeys expects a non-negative integer',
      '@expect.maxKeys expects a non-negative integer',
      '@expect.maxKeys is below @expect.minKeys (3)',
    ])
    // `@expect.message` takes its message; `@expect.int` at most one argument
    expect(
      await diagnose(`export interface A {
  @expect.message
  a: string
  @expect.int 'a', 'b'
  b: number
}
`)
    ).toEqual([
      '@expect.message requires at least 1 arguments, but got 0.',
      '@expect.int got 2 arguments, expected 1.',
    ])
  })
})

describe('the format messages of the string primitives have codes', () => {
  const FORMATS: Record<string, [string, string]> = {
    email: ['EMAIL', 'nope'],
    phone: ['PHONE', 'x'],
    date: ['DATE', 'x'],
    isoDate: ['ISO_DATE', 'x'],
    uuid: ['UUID', 'x'],
    url: ['URL', 'x'],
    ipv4: ['IPV4', 'x'],
    ipv6: ['IPV6', 'x'],
    ip: ['IP', 'x'],
  }

  it('every one of them (the message stays the primitive’s)', async () => {
    const props = Object.keys(FORMATS)
      .map(name => `  ${name}: string.${name}`)
      .join('\n')
    const { F } = await load(`export interface F {\n${props}\n}\n`)
    for (const [name, [code, bad]] of Object.entries(FORMATS)) {
      const v = new Validator(F, { partial: true })
      expect(v.validate({ [name]: bad }, true)).toBe(false)
      expect(v.errors, name).toMatchObject([
        { path: name, code, message: VALIDATOR_MESSAGES[code as keyof typeof VALIDATOR_MESSAGES] },
      ])
      expect(v.errors[0].custom, name).toBeUndefined()
    }
  })
})

const REQUIRED_SRC = `export interface Form {
  @meta.required 'Enter a name'
  name: string

  @meta.required 'Accept the terms'
  agreed: boolean

  @meta.required
  bare: string

  @meta.required 'Enter a nick'
  @expect.message 'Nick is text'
  nick: string

  @meta.required
  @expect.message 'Code expected'
  code: string

  @meta.required 'Pick one'
  choice: string | boolean

  @meta.required 'Title or nothing'
  title: string | null

  @meta.required 'Note or nothing'
  note: string | undefined

  @expect.message 'Text expected'
  plain: string

  count: number
}
`

const REQUIRED_VALID = {
  name: 'a',
  agreed: true,
  bare: 'b',
  nick: 'n',
  code: 'c',
  choice: 'x',
  title: 't',
  note: 'n',
  plain: 'p',
  count: 1,
}

const OPTIONAL_SRC = `export interface Opt {
  @meta.required
  @expect.message 'Code expected'
  code: string

  @meta.required
  @expect.message 'Code expected'
  maybe?: string

  @meta.required 'Name it'
  @expect.message 'Code expected'
  named?: string
}
`

describe('@meta.required covers a missing value', () => {
  /** `[path, code, message, custom]` of `value`'s errors; the walk agrees (verdict, errors). */
  function codes(Form: TAtscriptAnnotatedType, value: object, partial?: boolean) {
    const v = new Validator(Form, { partial, errorLimit: 100 })
    const walk = new WalkValidator(Form, { partial, errorLimit: 100 })
    const ok = v.validate(value, true)
    expect(walk.validate(value, true)).toBe(ok)
    expect(walk.errors).toEqual(v.errors)
    return v.errors.map(e => [e.path, e.code, e.message, !!e.custom])
  }

  const ALL = Object.keys(REQUIRED_VALID)
  const without = (keys: string[]) =>
    Object.fromEntries(Object.entries(REQUIRED_VALID).filter(([k]) => !keys.includes(k)))
  const set = (patch: object) => ({ ...REQUIRED_VALID, ...patch })

  for (const compileValidators of [false, true]) {
    const engine = compileValidators ? ' (compiled checks)' : ''

    it(`missing: REQUIRED with the annotation's message, TYPE without one${engine}`, async () => {
      const { Form } = await load(REQUIRED_SRC, compileValidators)
      if (compileValidators) {
        expect(boundCheck(Form)).not.toBeNull()
      }
      expect(codes(Form, REQUIRED_VALID)).toEqual([])
      expect(codes(Form, {})).toEqual([
        ['name', 'REQUIRED', 'Enter a name', true],
        ['agreed', 'REQUIRED_CHECKED', 'Accept the terms', true],
        ['bare', 'REQUIRED', 'Must not be empty', false],
        // (`@expect.message` stays for type mismatches)
        ['nick', 'REQUIRED', 'Enter a nick', true],
        // (a bare `@meta.required`: the `@expect.message` text)
        ['code', 'REQUIRED', 'Code expected', true],
        // (a union-level annotation: not `UNION`)
        ['choice', 'REQUIRED', 'Pick one', true],
        ['title', 'REQUIRED', 'Title or nothing', true],
        // (`note` accepts `undefined`: it passes)
        ['plain', 'TYPE', 'Text expected', true],
        ['count', 'TYPE', 'Expected number, got undefined', false],
      ])
    })

    it(`null: REQUIRED on a non-nullable def, passes on a nullable one${engine}`, async () => {
      const { Form } = await load(REQUIRED_SRC, compileValidators)
      const nulls = Object.fromEntries(ALL.map(k => [k, null]))
      expect(codes(Form, nulls)).toEqual([
        ['name', 'REQUIRED', 'Enter a name', true],
        ['agreed', 'REQUIRED_CHECKED', 'Accept the terms', true],
        ['bare', 'REQUIRED', 'Must not be empty', false],
        ['nick', 'REQUIRED', 'Enter a nick', true],
        ['code', 'REQUIRED', 'Code expected', true],
        ['choice', 'REQUIRED', 'Pick one', true],
        // (`title` accepts `null`)
        ['note', 'REQUIRED', 'Note or nothing', true],
        ['plain', 'TYPE', 'Text expected', true],
        ['count', 'TYPE', 'Expected number, got object', false],
      ])
    })

    it(`null on a required and an optional bare @meta.required: the same fallback${engine}`, async () => {
      const { Opt } = await load(OPTIONAL_SRC, compileValidators)
      if (compileValidators) {
        expect(boundCheck(Opt)).not.toBeNull()
      }
      // (the `@expect.message` text on both, `null` or missing)
      expect(codes(Opt, { code: null, maybe: null })).toEqual([
        ['code', 'REQUIRED', 'Code expected', true],
        ['maybe', 'REQUIRED', 'Code expected', true],
      ])
      expect(codes(Opt, { code: 'a' })).toEqual([])
      // (an empty string keeps the default message, as specified)
      expect(codes(Opt, { code: '', maybe: '' })).toEqual([
        ['code', 'REQUIRED', 'Must not be empty', false],
        ['maybe', 'REQUIRED', 'Must not be empty', false],
      ])
      // (the annotation's own message wins on both)
      expect(codes(Opt, { code: 'a', maybe: 'a', named: null })).toEqual([
        ['named', 'REQUIRED', 'Name it', true],
      ])
    })

    it(`empty / false and wrong types keep their codes${engine}`, async () => {
      const { Form } = await load(REQUIRED_SRC, compileValidators)
      expect(
        codes(
          Form,
          set({ name: ' ', agreed: false, bare: '', code: '', choice: '', title: '', note: '' })
        )
      ).toEqual([
        ['name', 'REQUIRED', 'Enter a name', true],
        ['agreed', 'REQUIRED_CHECKED', 'Accept the terms', true],
        ['bare', 'REQUIRED', 'Must not be empty', false],
        // (an empty value: the `@meta.required` default, as before)
        ['code', 'REQUIRED', 'Must not be empty', false],
        // (a union-level `@meta.required` checks the matched string)
        ['choice', 'REQUIRED', 'Pick one', true],
        ['title', 'REQUIRED', 'Title or nothing', true],
        ['note', 'REQUIRED', 'Note or nothing', true],
      ])
      expect(
        codes(Form, set({ name: 1, agreed: 'yes', nick: 5, code: 5, choice: 3, count: 'x' }))
      ).toEqual([
        ['name', 'TYPE', 'Expected string, got number', false],
        ['agreed', 'TYPE', 'Expected boolean, got string', false],
        ['nick', 'TYPE', 'Nick is text', true],
        ['code', 'TYPE', 'Code expected', true],
        [
          'choice',
          'UNION',
          'Value does not match any of the allowed types: [string(0)], [boolean(1)]',
          false,
        ],
        ['count', 'TYPE', 'Expected number, got string', false],
      ])
    })

    it(`partial mode accepts a missing field, not null${engine}`, async () => {
      const { Form } = await load(REQUIRED_SRC, compileValidators)
      expect(codes(Form, {}, true)).toEqual([])
      expect(codes(Form, without(['name', 'agreed', 'choice']), true)).toEqual([])
      expect(codes(Form, { name: null, agreed: null }, true)).toEqual([
        ['name', 'REQUIRED', 'Enter a name', true],
        ['agreed', 'REQUIRED_CHECKED', 'Accept the terms', true],
      ])
    })
  }

  it('the error carries no params; translators get the code', async () => {
    const { Form } = await load(REQUIRED_SRC)
    const v = new Validator(Form, {
      translate: id => (id === 'REQUIRED' ? 'Pflichtfeld' : undefined),
    })
    expect(v.validate(without(['bare']), true)).toBe(false)
    expect(v.errors).toEqual([
      { path: 'bare', message: 'Pflichtfeld', code: 'REQUIRED', params: {} },
    ])
  })

  it('@meta.required stays limited to strings and booleans', async () => {
    expect(
      await diagnose(`export interface A {
  @meta.required
  n: number
}
`)
    ).toEqual(['Expected type is (string | boolean), got "number"'])
  })
})

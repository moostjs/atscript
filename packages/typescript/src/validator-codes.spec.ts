import { describe, expect, it } from 'vitest'

import { boundCheck, compileType } from '../test/compiled-engine'
import { defineAnnotatedType as $, type TAtscriptAnnotatedType } from './runtime/annotated-type'
import { buildJsonSchema, fromJsonSchema } from './runtime/json-schema'
import { Validator, ValidatorError, type TValidatorPlugin } from './runtime/validator'
import {
  formatValidatorMessage,
  localizeErrors,
  messagesTranslator,
  VALIDATOR_ERROR_CODES,
  VALIDATOR_MESSAGES,
  type TError,
} from './runtime/validator-messages'

// Every error the validator reports carries a stable code and the params its message needs; the
// default message is the code's template filled with the params. (Runs with both engines: see
// `VALIDATOR_SPECS` in vitest.config.ts.)

const str = () => $().designType('string')
const num = () => $().designType('number')
const bool = () => $().designType('boolean')
const lit = (v: string | number) =>
  $()
    .designType(typeof v === 'number' ? 'number' : 'string')
    .value(v)
const obj = (props: Record<string, TAtscriptAnnotatedType> = {}) => {
  const h = $('object')
  for (const [k, v] of Object.entries(props)) {
    h.prop(k, v)
  }
  return h
}
const union = (...items: TAtscriptAnnotatedType[]) => {
  const h = $('union')
  for (const item of items) {
    h.item(item)
  }
  return h
}

const EMAIL = '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$'

/** [name, type, value, expected errors (path, code, params; custom message when given)] */
const CASES: Array<
  [string, () => TAtscriptAnnotatedType, unknown, Array<Partial<TError> & { code: string }>]
> = [
  [
    'REQUIRED (empty string)',
    () => str().annotate('meta.required', true).$type,
    '  ',
    [{ path: '', code: 'REQUIRED', params: {} }],
  ],
  [
    'REQUIRED (null on an optional field)',
    () => obj({ n: str().annotate('meta.required', true).optional().$type }).$type,
    { n: null },
    [{ path: 'n', code: 'REQUIRED', params: {} }],
  ],
  [
    'REQUIRED_CHECKED',
    () => bool().annotate('meta.required', true).$type,
    false,
    [{ path: '', code: 'REQUIRED_CHECKED', params: {} }],
  ],
  [
    'TYPE',
    () => obj({ s: str().$type }).$type,
    { s: 5 },
    [{ path: 's', code: 'TYPE', params: { expected: 'string', actual: 'number' } }],
  ],
  [
    'TYPE (null)',
    () => $().designType('null').$type,
    [],
    [{ path: '', code: 'TYPE', params: { expected: 'null', actual: 'array' } }],
  ],
  [
    'TYPE_ARRAY',
    () => $('array').of(str().$type).$type,
    'x',
    [{ path: '', code: 'TYPE_ARRAY', params: { actual: 'string' } }],
  ],
  [
    'TYPE_OBJECT',
    () => obj().$type,
    [],
    [{ path: '', code: 'TYPE_OBJECT', params: { actual: 'array' } }],
  ],
  [
    'TYPE_DECIMAL',
    () => $().designType('decimal').$type,
    1,
    [{ path: '', code: 'TYPE_DECIMAL', params: { actual: 'number' } }],
  ],
  [
    'NOT_FINITE',
    () => num().$type,
    Number.NaN,
    [{ path: '', code: 'NOT_FINITE', params: { actual: 'NaN' } }],
  ],
  [
    'DECIMAL_FORMAT',
    () => $().designType('decimal').$type,
    '1.2.3',
    [{ path: '', code: 'DECIMAL_FORMAT', params: { value: '1.2.3' } }],
  ],
  ['NEVER', () => $().designType('never').$type, 1, [{ path: '', code: 'NEVER', params: {} }]],
  [
    'LITERAL',
    () => lit('a').$type,
    'b',
    [{ path: '', code: 'LITERAL', params: { expected: 'a', actual: 'b' } }],
  ],
  [
    'UNION',
    () => union(str().$type, num().$type).$type,
    true,
    [
      {
        path: '',
        code: 'UNION',
        params: { expected: '[string(0)], [number(1)]' },
        details: [
          {
            path: '',
            message: 'Expected string, got boolean',
            code: 'TYPE',
            params: { expected: 'string', actual: 'boolean' },
          },
          {
            path: '',
            message: 'Expected number, got boolean',
            code: 'TYPE',
            params: { expected: 'number', actual: 'boolean' },
          },
        ],
      },
    ],
  ],
  [
    'UNEXPECTED_PROPERTY',
    () => obj({ a: str().$type }).$type,
    { a: 'x', b: 1 },
    [{ path: 'b', code: 'UNEXPECTED_PROPERTY', params: { property: 'b' } }],
  ],
  [
    'TUPLE_LENGTH',
    () => $('tuple').item(str().$type).item(num().$type).$type,
    ['a'],
    [{ path: '', code: 'TUPLE_LENGTH', params: { length: 2 } }],
  ],
  [
    'MIN_LENGTH',
    () => str().annotate('expect.minLength', { length: 3 }).$type,
    'ab',
    [{ path: '', code: 'MIN_LENGTH', params: { min: 3, actual: 2 } }],
  ],
  [
    'MAX_LENGTH',
    () => str().annotate('expect.maxLength', { length: 1 }).$type,
    'ab',
    [{ path: '', code: 'MAX_LENGTH', params: { max: 1, actual: 2 } }],
  ],
  [
    'MIN_ITEMS',
    () => $('array').of(str().$type).annotate('expect.minLength', { length: 2 }).$type,
    ['a'],
    [{ path: '', code: 'MIN_ITEMS', params: { min: 2, actual: 1 } }],
  ],
  [
    'MAX_ITEMS',
    () => $('array').of(str().$type).annotate('expect.maxLength', { length: 0 }).$type,
    ['a'],
    [{ path: '', code: 'MAX_ITEMS', params: { max: 0, actual: 1 } }],
  ],
  [
    'UNIQUE_ITEMS',
    () => $('array').of(num().$type).annotate('expect.array.uniqueItems', {}).$type,
    [1, 2, 1],
    [{ path: '2', code: 'UNIQUE_ITEMS', params: {} }],
  ],
  [
    'MIN_KEYS',
    () => obj({ a: str().optional().$type }).annotate('expect.minKeys', { count: 1 }).$type,
    {},
    [{ path: '', code: 'MIN_KEYS', params: { min: 1, actual: 0 } }],
  ],
  [
    'MAX_KEYS',
    () => $('object').propPattern(/./, num().$type).annotate('expect.maxKeys', { count: 2 }).$type,
    { a: 1, b: 2, c: 3 },
    [{ path: '', code: 'MAX_KEYS', params: { max: 2, actual: 3 } }],
  ],
  [
    'PATTERN',
    () => str().annotate('expect.pattern', { pattern: '^a' }, true).$type,
    'b',
    [{ path: '', code: 'PATTERN', params: { pattern: '^a' } }],
  ],
  [
    'PATTERN (with flags)',
    () => str().annotate('expect.pattern', { pattern: '^a', flags: 'i' }, true).$type,
    'b',
    [{ path: '', code: 'PATTERN', params: { pattern: '^a', flags: 'i' } }],
  ],
  [
    'EMAIL (a primitive format message)',
    () =>
      str().annotate('expect.pattern', { pattern: EMAIL, message: 'Invalid email format.' }, true)
        .$type,
    'nope',
    // (no params: the regex is the primitive's)
    [{ path: '', code: 'EMAIL', params: {} }],
  ],
  [
    'INT',
    () => num().annotate('expect.int', true).$type,
    1.5,
    [{ path: '', code: 'INT', params: { actual: 1.5 } }],
  ],
  [
    'MIN',
    () => num().annotate('expect.min', { minValue: 2 }).$type,
    1,
    [{ path: '', code: 'MIN', params: { min: 2, actual: 1 } }],
  ],
  [
    'MAX',
    () => num().annotate('expect.max', { maxValue: 2 }).$type,
    3,
    [{ path: '', code: 'MAX', params: { max: 2, actual: 3 } }],
  ],
  [
    'EXCLUSIVE_MIN',
    () => num().annotate('expect.exclusiveMin', { exclusiveMinValue: 0 }).$type,
    0,
    [{ path: '', code: 'EXCLUSIVE_MIN', params: { min: 0, actual: 0 } }],
  ],
  [
    'EXCLUSIVE_MAX',
    () => num().annotate('expect.exclusiveMax', { exclusiveMaxValue: 1 }).$type,
    1,
    [{ path: '', code: 'EXCLUSIVE_MAX', params: { max: 1, actual: 1 } }],
  ],
]

/** The default message of an expected error (its template filled with its params). */
function withMessages(errors: Array<Partial<TError> & { code: string }>): TError[] {
  return errors.map(e => ({
    path: e.path!,
    message:
      e.message ??
      formatValidatorMessage(
        VALIDATOR_MESSAGES[e.code as keyof typeof VALIDATOR_MESSAGES],
        e.params
      ),
    code: e.code,
    params: e.params,
    ...(e.details ? { details: e.details } : {}),
  }))
}

describe('validator error codes', () => {
  it('the code → template table', () => {
    expect(VALIDATOR_MESSAGES).toMatchSnapshot()
    expect(Object.keys(VALIDATOR_ERROR_CODES)).toEqual([
      ...Object.keys(VALIDATOR_MESSAGES),
      'CUSTOM',
    ])
    for (const [code, value] of Object.entries(VALIDATOR_ERROR_CODES)) {
      expect(value).toBe(code)
      expect(code).toMatch(/^[A-Z][A-Z0-9_]*$/)
    }
  })

  for (const [name, make, value, expected] of CASES) {
    it(`${name}: code, params and the default message`, () => {
      const v = new Validator(make())
      expect(v.validate(value, true)).toBe(false)
      expect(v.errors).toEqual(withMessages(expected))
    })
  }

  it('every built-in code but the format ones has a case above', () => {
    const covered = new Set(CASES.flatMap(([, , , errors]) => errors.map(e => e.code)))
    covered.add('UNION_DISCRIMINATOR') // (below)
    const formats = new Set([
      'EMAIL',
      'PHONE',
      'DATE',
      'ISO_DATE',
      'UUID',
      'URL',
      'IPV4',
      'IPV6',
      'IP',
    ])
    for (const code of Object.keys(VALIDATOR_MESSAGES)) {
      expect(covered.has(code) || formats.has(code), code).toBe(true)
    }
  })

  it("an annotation's message is app text: custom, the code and params kept", () => {
    const t = obj({
      a: str().annotate('expect.minLength', { length: 3, message: 'Too short' }).$type,
      b: num().annotate('expect.int', { message: 'Whole numbers only' }).$type,
      c: str().annotate('meta.required', { message: 'Fill me' }).$type,
      d: str().annotate('expect.pattern', { pattern: '^x', message: 'Starts with x' }, true).$type,
      e: $('array').of(num().$type).annotate('expect.array.uniqueItems', { message: 'No repeats' })
        .$type,
      f: num().annotate('expect.max', { maxValue: 1, message: 'At most one' }).$type,
      g: obj({ x: num().optional().$type }).annotate('expect.minKeys', {
        count: 1,
        message: 'Pick something',
      }).$type,
    }).$type
    const v = new Validator(t)
    expect(v.validate({ a: 'x', b: 1.5, c: ' ', d: 'y', e: [1, 1], f: 2, g: {} }, true)).toBe(false)
    expect(v.errors).toEqual([
      {
        path: 'a',
        message: 'Too short',
        code: 'MIN_LENGTH',
        params: { min: 3, actual: 1 },
        custom: true,
      },
      {
        path: 'b',
        message: 'Whole numbers only',
        code: 'INT',
        params: { actual: 1.5 },
        custom: true,
      },
      { path: 'c', message: 'Fill me', code: 'REQUIRED', params: {}, custom: true },
      {
        path: 'd',
        message: 'Starts with x',
        code: 'PATTERN',
        params: { pattern: '^x' },
        custom: true,
      },
      { path: 'e.1', message: 'No repeats', code: 'UNIQUE_ITEMS', params: {}, custom: true },
      {
        path: 'f',
        message: 'At most one',
        code: 'MAX',
        params: { max: 1, actual: 2 },
        custom: true,
      },
      {
        path: 'g',
        message: 'Pick something',
        code: 'MIN_KEYS',
        params: { min: 1, actual: 0 },
        custom: true,
      },
    ])
  })

  it('a plugin error: CUSTOM app text, or the code and params it gives', () => {
    const plugin: TValidatorPlugin = (ctx, def, value) => {
      if (value === 'plain') {
        ctx.error('Plain text')
        return false
      }
      if (value === 'coded') {
        ctx.error('Coded text', undefined, undefined, { code: 'MY_CODE', params: { n: 1 } })
        return false
      }
      return undefined
    }
    const v = new Validator(str().$type, { plugins: [plugin] })
    expect(v.validate('plain', true)).toBe(false)
    expect(v.errors).toEqual([
      { path: '', message: 'Plain text', code: 'CUSTOM', params: {}, custom: true },
    ])
    expect(v.validate('coded', true)).toBe(false)
    expect(v.errors).toEqual([
      { path: '', message: 'Coded text', code: 'MY_CODE', params: { n: 1 } },
    ])
  })

  it('params are JSON-safe (the error survives a JSON round trip)', () => {
    for (const [, make, value] of CASES) {
      const v = new Validator(make())
      v.validate(value, true)
      expect(JSON.parse(JSON.stringify(v.errors))).toEqual(v.errors)
    }
  })
})

describe('localizeErrors', () => {
  const t = obj({
    name: str().annotate('expect.minLength', { length: 3 }).$type,
    nick: str().annotate('expect.minLength', { length: 3, message: 'Too short' }).$type,
    age: num().annotate('expect.max', { maxValue: 120 }).$type,
    kind: union(lit('a').$type, lit('b').$type).$type,
  }).$type
  const failed = () => {
    const v = new Validator(t)
    expect(v.validate({ name: 'x', nick: 'y', age: 200, kind: 'c' }, true)).toBe(false)
    return v.errors
  }
  const DE: Record<string, string> = {
    'MIN_LENGTH': 'Mindestens {min} Zeichen, {actual} erhalten',
    'Too short': 'Zu kurz',
    'UNION': 'Kein erlaubter Wert',
    'LITERAL': 'Erwartet {expected}',
  }

  it('translates by code (the default messages) and by text (app text)', () => {
    const calls: unknown[] = []
    const out = localizeErrors(failed(), (id, params, error) => {
      calls.push([id, params, error.path])
      return messagesTranslator(DE)(id, params, error)
    })
    expect(out.map(e => [e.path, e.message])).toEqual([
      ['name', 'Mindestens 3 Zeichen, 1 erhalten'],
      ['nick', 'Zu kurz'],
      // (no translation: the default message stays)
      ['age', 'Expected maximum 120, got 200'],
      ['kind', 'Kein erlaubter Wert'],
    ])
    // details are translated too
    expect(out[3].details!.map(e => e.message)).toEqual(['Erwartet a', 'Erwartet b'])
    expect(calls.slice(0, 3)).toEqual([
      ['MIN_LENGTH', { min: 3, actual: 1 }, 'name'],
      ['Too short', { min: 3, actual: 1 }, 'nick'],
      ['MAX', { max: 120, actual: 200 }, 'age'],
    ])
  })

  it('returns new error objects (the originals unchanged), codes and params kept', () => {
    const errors = failed()
    const before = structuredClone(errors)
    const out = localizeErrors(errors, () => 'X')
    expect(errors).toEqual(before)
    expect(out.map(e => [e.message, e.code, e.params])).toEqual(
      errors.map(e => ['X', e.code, e.params])
    )
  })

  it('an error made by hand (no code) is translated by its text', () => {
    const out = localizeErrors([{ path: 'a', message: 'Hello' }], id =>
      id === 'Hello' ? 'Hallo' : undefined
    )
    expect(out).toEqual([{ path: 'a', message: 'Hallo' }])
  })

  it('the translate option translates the errors of a failed call (and the thrown error)', () => {
    const v = new Validator(t, { translate: messagesTranslator(DE) })
    expect(v.validate({ name: 'abc', nick: 'abc', age: 1, kind: 'a' }, true)).toBe(true)
    expect(v.validate({ name: 'x', nick: 'abc', age: 1, kind: 'a' }, true)).toBe(false)
    expect(v.errors).toEqual([
      {
        path: 'name',
        message: 'Mindestens 3 Zeichen, 1 erhalten',
        code: 'MIN_LENGTH',
        params: { min: 3, actual: 1 },
      },
    ])
    let thrown: unknown
    try {
      v.validate({ name: 'x', nick: 'abc', age: 1, kind: 'a' })
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(ValidatorError)
    expect((thrown as ValidatorError).message).toBe('name: Mindestens 3 Zeichen, 1 erhalten')
  })

  it("a translator changing params leaves the input's params as they were", () => {
    const errors: TError[] = [
      ...failed(),
      {
        path: 'k',
        message: 'm',
        code: 'UNION_DISCRIMINATOR',
        params: { allowed: ['a', 'b'], nested: { list: [1] } },
      },
    ]
    const before = structuredClone(errors)
    localizeErrors(errors, (_id, params) => {
      params.min = 99
      for (const value of Object.values(params)) {
        if (Array.isArray(value)) {
          value.push('changed')
        } else if (typeof value === 'object' && value !== null) {
          ;(value as { list: unknown[] }).list.push('changed')
        }
      }
      return undefined
    })
    expect(errors).toEqual(before)
  })

  it('formatValidatorMessage fills params (arrays joined) and keeps unknown placeholders', () => {
    expect(formatValidatorMessage('{a} of {b}: {c}', { a: 1, b: ['x', 'y'] })).toBe(
      '1 of x, y: {c}'
    )
  })
})

describe('discriminated union errors', () => {
  const cat = obj({
    kind: lit('cat').$type,
    lives: num().annotate('expect.max', { maxValue: 9 }).$type,
  })
  const dog = obj({ kind: lit('dog').$type, name: str().$type })
  const pet = () => union(cat.$type, dog.$type).$type

  it('reports the errors of the branch the discriminator picks, at their paths', () => {
    const v = new Validator(obj({ pet: pet() }).$type)
    expect(v.validate({ pet: { kind: 'cat', lives: 10 } }, true)).toBe(false)
    expect(v.errors).toEqual([
      {
        path: 'pet.lives',
        message: 'Expected maximum 9, got 10',
        code: 'MAX',
        params: { max: 9, actual: 10 },
      },
    ])
    expect(v.validate({ pet: { kind: 'dog', name: 1, extra: true } }, true)).toBe(false)
    expect(v.errors.map(e => [e.path, e.code])).toEqual([
      ['pet.name', 'TYPE'],
      ['pet.extra', 'UNEXPECTED_PROPERTY'],
    ])
  })

  it('an unknown or missing discriminator: one error with the allowed values', () => {
    const v = new Validator(obj({ pet: pet() }).$type)
    expect(v.validate({ pet: { kind: 'cow' } }, true)).toBe(false)
    expect(v.errors).toEqual([
      {
        path: 'pet.kind',
        message: 'Expected one of cat, dog, got cow',
        code: 'UNION_DISCRIMINATOR',
        params: { property: 'kind', allowed: ['cat', 'dog'], actual: 'cow' },
      },
    ])
    expect(v.validate({ pet: {} }, true)).toBe(false)
    expect(v.errors).toMatchObject([
      { path: 'pet.kind', code: 'UNION_DISCRIMINATOR', params: { actual: 'undefined' } },
    ])
    // at the root
    const root = new Validator(pet())
    expect(root.validate({ kind: 1 }, true)).toBe(false)
    expect(root.errors).toMatchObject([{ path: 'kind', code: 'UNION_DISCRIMINATOR' }])
  })

  it('a nullable discriminated union too; a non-object value: the union error', () => {
    const v = new Validator(union(cat.$type, dog.$type, $().designType('null').$type).$type)
    expect(v.validate(null, true)).toBe(true)
    expect(v.validate({ kind: 'cat', lives: 99 }, true)).toBe(false)
    expect(v.errors).toMatchObject([{ path: 'lives', code: 'MAX' }])
    expect(v.validate('cat', true)).toBe(false)
    expect(v.errors).toMatchObject([{ path: '', code: 'UNION' }])
    expect(v.errors[0].details).toHaveLength(3)
  })

  it('a union without a shared literal discriminator: the union error, unchanged', () => {
    const a = obj({ x: num().$type }).$type
    const b = obj({ y: str().$type }).$type
    const v = new Validator(union(a, b).$type)
    expect(v.validate({ x: 'no' }, true)).toBe(false)
    expect(v.errors).toEqual([
      {
        path: '',
        message: 'Value does not match any of the allowed types: [object(0)], [object(1)]',
        code: 'UNION',
        params: { expected: '[object(0)], [object(1)]' },
        details: [
          {
            path: 'x',
            message: 'Expected number, got string',
            code: 'TYPE',
            params: { expected: 'number', actual: 'string' },
          },
          {
            path: 'y',
            message: 'Expected string, got undefined',
            code: 'TYPE',
            params: { expected: 'string', actual: 'undefined' },
          },
          {
            path: 'x',
            message: 'Unexpected property',
            code: 'UNEXPECTED_PROPERTY',
            params: { property: 'x' },
          },
        ],
      },
    ])
    // a branch that may hold any object (here `any`): no discriminator either
    const anyToo = new Validator(union(cat.$type, dog.$type, $().designType('any').$type).$type)
    expect(anyToo.validate({ kind: 'cow' }, true)).toBe(true)
  })

  it('two literal props in every branch (ambiguous): the union error', () => {
    const a = obj({ k: lit('a').$type, v: lit(1).$type }).$type
    const b = obj({ k: lit('b').$type, v: lit(2).$type }).$type
    const v = new Validator(union(a, b).$type)
    expect(v.validate({ k: 'a', v: 2 }, true)).toBe(false)
    expect(v.errors).toMatchObject([{ path: '', code: 'UNION' }])
  })
})

describe('discriminated union errors: partial, optional tags, the error limit', () => {
  const cat = () =>
    obj({ kind: lit('cat').$type, lives: num().$type, name: str().optional().$type }).$type
  const dog = () => obj({ kind: lit('dog').$type, name: str().$type }).$type
  const holder = () => obj({ pet: union(cat(), dog()).$type }).$type

  it("partial ('deep', or true at the union's depth): a missing tag gives the union error", () => {
    for (const [partial, t, value, at] of [
      ['deep', holder(), { pet: { lives: 'x' } }, 'pet'],
      [true, union(cat(), dog()).$type, { lives: 'x' }, ''],
    ] as const) {
      const v = new Validator(t, { partial })
      expect(v.validate(value, true)).toBe(false)
      expect(v.errors).toMatchObject([{ path: at, code: 'UNION' }])
      // (the branch errors in details: the lives TYPE error is not hidden)
      expect(v.errors[0].details!.map(e => [e.path, e.code])).toContainEqual([
        at ? `${at}.lives` : 'lives',
        'TYPE',
      ])
    }
    // an unknown (present) tag is still reported at the discriminator
    const v = new Validator(holder(), { partial: 'deep' })
    expect(v.validate({ pet: { kind: 'cow' } }, true)).toBe(false)
    expect(v.errors).toMatchObject([{ path: 'pet.kind', code: 'UNION_DISCRIMINATOR' }])
    // partial: true below the top: the tag is required there
    const top = new Validator(holder(), { partial: true })
    expect(top.validate({ pet: { lives: 1 } }, true)).toBe(false)
    expect(top.errors).toMatchObject([{ path: 'pet.kind', code: 'UNION_DISCRIMINATOR' }])
  })

  it('a tag optional in some branch: no discriminator (the union error)', () => {
    const a = obj({ kind: lit('a').$type, x: num().$type }).$type
    const b = obj({ kind: lit('b').optional().$type, y: num().$type }).$type
    const v = new Validator(union(a, b).$type)
    expect(v.validate({ y: 1 }, true)).toBe(true)
    expect(v.validate({ y: 's' }, true)).toBe(false)
    expect(v.errors).toMatchObject([{ path: '', code: 'UNION' }])
    expect(v.errors[0].details!.map(e => [e.path, e.code])).toContainEqual(['y', 'TYPE'])
    // (JSON Schema keeps its discriminator)
    expect(buildJsonSchema(union(a, b).$type).discriminator).toMatchObject({ propertyName: 'kind' })
  })

  it("the picked branch's errors stop at the error limit", () => {
    const wide = obj({
      kind: lit('w').$type,
      a: num().$type,
      b: num().$type,
      c: num().$type,
    }).$type
    const t = obj({ first: num().$type, pet: union(wide, dog()).$type }).$type
    for (const errorLimit of [1, 2, 3]) {
      const v = new Validator(t, { errorLimit })
      expect(v.validate({ first: 'x', pet: { kind: 'w', a: 'x', b: 'x', c: 'x' } }, true)).toBe(
        false
      )
      expect(v.errors).toHaveLength(errorLimit)
    }
  })

  it('raw input copied into params is clipped (100 characters, then an ellipsis)', () => {
    const long = 'x'.repeat(150)
    const clipped = `${'x'.repeat(100)}…`
    const v = new Validator(lit('a').$type)
    expect(v.validate(long, true)).toBe(false)
    expect(v.errors[0].params).toEqual({ expected: 'a', actual: clipped })
    const d = new Validator($().designType('decimal').$type)
    expect(d.validate(long, true)).toBe(false)
    expect(d.errors[0].params).toEqual({ value: clipped })
    const u = new Validator(union(cat(), dog()).$type)
    expect(u.validate({ kind: long }, true)).toBe(false)
    expect(u.errors[0].params).toMatchObject({ actual: clipped })
    const k = new Validator(obj({}).$type)
    expect(k.validate({ [long]: 1 }, true)).toBe(false)
    expect(k.errors[0].params).toEqual({ property: clipped })
  })
})

describe('@expect.message', () => {
  it('replaces the type-mismatch message of a literal union, a literal and primitives', () => {
    const t = obj({
      status: union(lit('active').$type, lit('blocked').$type).annotate(
        'expect.message',
        'Choose a valid status'
      ).$type,
      one: lit('x').annotate('expect.message', 'Must be x').$type,
      age: num().annotate('expect.message', 'Age is a number').$type,
      list: $('array').of(str().$type).annotate('expect.message', 'A list please').$type,
      inner: obj().annotate('expect.message', 'An object please').$type,
    }).$type
    const v = new Validator(t)
    expect(v.validate({ status: 'gone', one: 'y', age: 'old', list: 'a', inner: 1 }, true)).toBe(
      false
    )
    expect(v.errors.map(e => [e.path, e.message, e.code, e.custom])).toEqual([
      ['status', 'Choose a valid status', 'UNION', true],
      ['one', 'Must be x', 'LITERAL', true],
      ['age', 'Age is a number', 'TYPE', true],
      ['list', 'A list please', 'TYPE_ARRAY', true],
      ['inner', 'An object please', 'TYPE_OBJECT', true],
    ])
    // the params stay: a translator can still use them
    expect(v.errors[0].params).toEqual({ expected: '[string(0)], [string(1)]' })
    expect(v.errors[2].params).toEqual({ expected: 'number', actual: 'string' })
  })

  it('leaves constraint failures to their own messages', () => {
    const t = num()
      .annotate('expect.message', 'A number please')
      .annotate('expect.max', { maxValue: 1 }).$type
    const v = new Validator(t)
    expect(v.validate(5, true)).toBe(false)
    expect(v.errors).toMatchObject([{ code: 'MAX', message: 'Expected maximum 1, got 5' }])
    expect(v.validate('5', true)).toBe(false)
    expect(v.errors).toMatchObject([{ code: 'TYPE', message: 'A number please', custom: true }])
  })

  it('on a discriminated union: the message of an unknown discriminator', () => {
    const a = obj({ k: lit('a').$type }).$type
    const b = obj({ k: lit('b').$type }).$type
    const v = new Validator(union(a, b).annotate('expect.message', 'Unknown kind').$type)
    expect(v.validate({ k: 'c' }, true)).toBe(false)
    expect(v.errors).toMatchObject([
      { path: 'k', message: 'Unknown kind', code: 'UNION_DISCRIMINATOR', custom: true },
    ])
  })
})

describe('@expect.minKeys / @expect.maxKeys', () => {
  const record = () =>
    $('object')
      .propPattern(/^[a-z]+$/, num().$type)
      .annotate('expect.minKeys', { count: 1 })
      .annotate('expect.maxKeys', { count: 2 }).$type
  const fixed = () =>
    obj({ a: num().optional().$type, b: num().optional().$type, c: num().optional().$type })
      .annotate('expect.minKeys', { count: 1 })
      .annotate('expect.maxKeys', { count: 2 }).$type

  for (const [name, make] of [
    ['a record (pattern props)', record],
    ['an object with optional props', fixed],
  ] as const) {
    it(`${name}: counts the value's own keys`, () => {
      const v = new Validator(make())
      expect(v.validate({ a: 1 }, true)).toBe(true)
      expect(v.validate({ a: 1, b: 2 }, true)).toBe(true)
      expect(v.validate({}, true)).toBe(false)
      expect(v.errors).toMatchObject([{ code: 'MIN_KEYS', params: { min: 1, actual: 0 } }])
      expect(v.validate({ a: 1, b: 2, c: 3 }, true)).toBe(false)
      expect(v.errors).toMatchObject([{ code: 'MAX_KEYS', params: { max: 2, actual: 3 } }])
      // the number form too
      const n = new Validator($('object').annotate('expect.maxKeys', 0 as any).$type, {
        unknownProps: 'ignore',
      })
      expect(n.validate({}, true)).toBe(true)
      expect(n.validate({ z: 1 }, true)).toBe(false)
    })
  }

  it('nested, and steering a union (both engines decide the same branch)', () => {
    const small = obj({ a: num().optional().$type, b: num().optional().$type }).annotate(
      'expect.maxKeys',
      { count: 1 }
    ).$type
    const big = obj({ a: num().optional().$type, b: str().optional().$type }).$type
    const t = obj({ v: union(small, big).$type }).$type
    const v = new Validator(t)
    expect(v.validate({ v: { a: 1 } }, true)).toBe(true)
    // (two keys: not `small`; `b` is not a string: not `big`)
    expect(v.validate({ v: { a: 1, b: 2 } }, true)).toBe(false)
    expect(v.validate({ v: { a: 1, b: 'x' } }, true)).toBe(true)
  })

  it('on a union: the object members', () => {
    const t = union(
      obj({ a: num().optional().$type }).$type,
      $().designType('null').$type
    ).annotate('expect.minKeys', { count: 1 }).$type
    const v = new Validator(t)
    expect(v.validate(null, true)).toBe(true)
    expect(v.validate({ a: 1 }, true)).toBe(true)
    expect(v.validate({}, true)).toBe(false)
    expect(v.errors).toMatchObject([{ code: 'MIN_KEYS' }])
  })

  it('a compiled check (bound, deciding without the walk)', () => {
    const t = obj({ m: record(), f: fixed() }).$type
    compileType(t)
    const check = boundCheck(t)!
    expect(check).not.toBeNull()
    const v = new Validator(t)
    const opts = v['opts']
    // 1: passes, 0: fails, 2: left to the walk (a record: its pattern props, checked first here)
    expect(check({ m: { a: 1 }, f: {} }, 1, opts)).toBe(2)
    expect(check({ m: 'x', f: {} }, 1, opts)).toBe(0)
    const flat = obj({ f: fixed() }).$type
    compileType(flat)
    const flatCheck = boundCheck(flat)!
    expect(flatCheck({ f: { a: 1 } }, 1, opts)).toBe(1)
    expect(flatCheck({ f: {} }, 1, opts)).toBe(0)
    expect(flatCheck({ f: { a: 1, b: 2, c: 3 } }, 1, opts)).toBe(0)
    // the root's own counts
    const root = fixed()
    compileType(root)
    expect(boundCheck(root)!({}, 1, opts)).toBe(0)
    expect(boundCheck(root)!({ a: 1 }, 1, opts)).toBe(1)
    expect(v.validate({ m: { a: 1 }, f: { a: 1 } }, true)).toBe(true)
    expect(v.validate({ m: { a: 1 }, f: {} }, true)).toBe(false)
    expect(v.errors).toMatchObject([{ path: 'f', code: 'MIN_KEYS' }])
    expect(v.validate({ m: {}, f: { a: 1 } }, true)).toBe(false)
    expect(v.errors).toMatchObject([{ path: 'm', code: 'MIN_KEYS' }])
  })

  it('JSON Schema: minProperties / maxProperties (and back)', () => {
    expect(buildJsonSchema(record())).toMatchObject({
      type: 'object',
      minProperties: 1,
      maxProperties: 2,
    })
    expect(buildJsonSchema(fixed())).toMatchObject({ minProperties: 1, maxProperties: 2 })
    const named = obj({ a: num().optional().$type }).id('Named').$type
    const holder = obj({ x: $().ref(named).annotate('expect.minKeys', { count: 1 }).$type }).$type
    expect(buildJsonSchema(holder).properties.x).toEqual({
      allOf: [{ $ref: '#/$defs/Named' }],
      minProperties: 1,
    })
    const back = fromJsonSchema({ type: 'object', minProperties: 1, maxProperties: 3 })
    expect(back.metadata.get('expect.minKeys')).toEqual({ count: 1 })
    expect(back.metadata.get('expect.maxKeys')).toEqual({ count: 3 })
  })
})

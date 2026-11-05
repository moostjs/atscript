import path from 'path'

import { prepareFixtures } from '@atscript/typescript/test-utils'
import { ValidatorError } from '@atscript/typescript/utils'
import { beforeAll, describe, expect, it } from 'vitest'

import { coercionPipe } from '../as-coercion.pipe'
import { validatorPipe } from '../as-validator.pipe'

const rootDir = path.join(__dirname, 'fixtures')

function callPipe(pipe: any, value: unknown, targetMeta: any) {
  return pipe(value, { targetMeta }, 'PARAM')
}

describe('validatorPipe normalizes before validating', () => {
  let SignUp: any
  let Email: any
  let Lookup: any

  beforeAll(async () => {
    await prepareFixtures({ rootDir, entries: ['normalize-pipe.as'] })
    ;({ SignUp, Email, Lookup } = await import(path.join(rootDir, 'normalize-pipe.as.js')))
  })

  it('returns the normalized body, validated in its normalized form', () => {
    const body = {
      email: '  Ann@Example.COM ',
      name: '  Ann  ',
      country: 'nl',
      tags: [' A@B.co ', 'c@d.CO'],
      password: '  keep me  ',
    }
    const result = callPipe(validatorPipe(), body, { type: SignUp, paramSource: 'BODY' })
    expect(result).toEqual({
      email: 'ann@example.com',
      name: 'Ann',
      country: 'NL',
      tags: ['a@b.co', 'c@d.co'],
      // (no normalizer: kept as sent)
      password: '  keep me  ',
    })
    // (the input is not mutated)
    expect(body.email).toBe('  Ann@Example.COM ')
  })

  it('reports constraint errors against the normalized value', () => {
    // ' A ' trims to 'A': shorter than @expect.minLength 2
    expect(() =>
      callPipe(
        validatorPipe(),
        { email: 'a@b.co', name: ' A ', tags: [], password: 'x' },
        { type: SignUp }
      )
    ).toThrow(ValidatorError)
  })

  it('judges union branches that normalize differently with the pipe options', () => {
    // `Lookup = ByName | ByCode`: as a partial update, `{ handle }` is a ByName
    const pipe = validatorPipe({ partial: true })
    expect(callPipe(pipe, { handle: 'Abc' }, { type: Lookup, paramSource: 'BODY' })).toEqual({
      handle: 'abc',
    })
  })

  it('normalizes a scalar alias param', () => {
    expect(callPipe(validatorPipe(), ' X@Y.CO ', { type: Email, paramSource: 'ROUTE' })).toBe(
      'x@y.co'
    )
  })

  it('passes input without normalizers on as the same object', () => {
    const body = { email: 'a@b.co', name: 'Ann', tags: ['c@d.co'], password: ' p ' }
    expect(callPipe(validatorPipe(), body, { type: SignUp })).toBe(body)
  })

  it('an own `__proto__` key in a JSON body is still rejected as an unknown property', () => {
    const body = JSON.parse(
      '{"__proto__": {"role": "admin"}, "email": "a@b.co", "name": " Ann ", "tags": [], "password": "x"}'
    )
    let returned: any
    expect(() => {
      returned = callPipe(validatorPipe(), body, { type: SignUp, paramSource: 'BODY' })
    }).toThrow(ValidatorError)
    expect(returned).toBeUndefined()
  })

  it('composes after coercionPipe: coerce → normalize → validate', () => {
    const coerced = callPipe(coercionPipe(), ' X@Y.CO ', { type: Email, paramSource: 'QUERY_ITEM' })
    expect(callPipe(validatorPipe(), coerced, { type: Email, paramSource: 'QUERY_ITEM' })).toBe(
      'x@y.co'
    )
  })
})

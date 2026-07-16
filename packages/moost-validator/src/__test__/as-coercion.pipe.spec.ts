import path from 'path'

import { prepareFixtures } from '@atscript/typescript/test-utils'
import { beforeAll, describe, expect, it } from 'vitest'

import { coercionPipe } from '../as-coercion.pipe'
import { validatorPipe } from '../as-validator.pipe'

const rootDir = path.join(__dirname, 'fixtures')

function callPipe(pipe: any, value: unknown, targetMeta: any) {
  return pipe(value, { targetMeta }, 'PARAM')
}

describe('coercionPipe', () => {
  let KafkaOffset: any
  let SearchQuery: any

  beforeAll(async () => {
    await prepareFixtures({ rootDir, entries: ['coerce-pipe.as'] })
    ;({ KafkaOffset, SearchQuery } = await import(path.join(rootDir, 'coerce-pipe.as.js')))
  })

  it('coerces ROUTE params to annotated scalar types', () => {
    const pipe = coercionPipe()
    expect(callPipe(pipe, '42', { type: KafkaOffset, paramSource: 'ROUTE' })).toBe(42)
  })

  it('coerces QUERY and QUERY_ITEM sources by default', () => {
    const pipe = coercionPipe()
    expect(
      callPipe(
        pipe,
        { offset: '5', active: 'true', term: 'x' },
        { type: SearchQuery, paramSource: 'QUERY' }
      )
    ).toEqual({ offset: 5, active: true, term: 'x' })
    expect(callPipe(pipe, '1', { type: KafkaOffset, paramSource: 'QUERY_ITEM' })).toBe(1)
  })

  it('leaves BODY untouched by default', () => {
    const pipe = coercionPipe()
    const body = { offset: '5', active: 'true', term: 'x' }
    expect(callPipe(pipe, body, { type: SearchQuery, paramSource: 'BODY' })).toBe(body)
  })

  it('coerces BODY when opted in via sources', () => {
    const pipe = coercionPipe({ sources: ['BODY'] })
    expect(
      callPipe(
        pipe,
        { offset: '5', active: 'true', term: 'x' },
        { type: SearchQuery, paramSource: 'BODY' }
      )
    ).toEqual({ offset: 5, active: true, term: 'x' })
    // and the default sources are replaced, not extended
    expect(callPipe(pipe, '1', { type: KafkaOffset, paramSource: 'ROUTE' })).toBe('1')
  })

  it('skips params without a paramSource (e.g. DI injections)', () => {
    const pipe = coercionPipe()
    expect(callPipe(pipe, '42', { type: KafkaOffset })).toBe('42')
  })

  it('falls back to design-type coercion for plain Number/Boolean/Date params', () => {
    const pipe = coercionPipe()
    expect(callPipe(pipe, '42', { type: Number, paramSource: 'ROUTE' })).toBe(42)
    expect(callPipe(pipe, 'true', { type: Boolean, paramSource: 'QUERY' })).toBe(true)
    const d = callPipe(pipe, '2024-01-15T10:00:00Z', { type: Date, paramSource: 'QUERY' })
    expect(d).toBeInstanceOf(Date)
    expect((d as Date).toISOString()).toBe('2024-01-15T10:00:00.000Z')
  })

  it('returns unparsable design-type input unchanged', () => {
    const pipe = coercionPipe()
    expect(callPipe(pipe, 'abc', { type: Number, paramSource: 'ROUTE' })).toBe('abc')
    expect(callPipe(pipe, 'yes', { type: Boolean, paramSource: 'ROUTE' })).toBe('yes')
    expect(callPipe(pipe, 'not-a-date', { type: Date, paramSource: 'ROUTE' })).toBe('not-a-date')
  })

  it('passes String and other design types through', () => {
    const pipe = coercionPipe()
    expect(callPipe(pipe, '42', { type: String, paramSource: 'ROUTE' })).toBe('42')
    expect(callPipe(pipe, '42', { type: Object, paramSource: 'ROUTE' })).toBe('42')
  })

  it('composes with validatorPipe: coerce then validate', () => {
    const coerce = coercionPipe()
    const validate = validatorPipe()
    const meta = { type: KafkaOffset, paramSource: 'ROUTE' }

    const good = callPipe(coerce, '42', meta)
    expect(callPipe(validate, good, meta)).toBe(42)

    const bad = callPipe(coerce, 'abc', meta)
    expect(() => callPipe(validate, bad, meta)).toThrow()

    // constraint violations survive coercion and are caught by the validator
    const negative = callPipe(coerce, '-5', meta)
    expect(negative).toBe(-5)
    expect(() => callPipe(validate, negative, meta)).toThrow()
  })
})

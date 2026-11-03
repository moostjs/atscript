import path from 'path'

import { beforeAll, describe, expect, it } from 'vitest'

import type { TAtscriptAnnotatedType, TAtscriptTypeObject } from '../runtime/annotated-type'
import { $blk } from '../runtime/blocks'
import { prepareFixtures } from '../test-utils'

/*
 * `@annotate.reset '<name>'`: the node an annotate entry (or the block itself) writes reads as if
 * it had no value of that annotation below the block — declared on it, inherited from the type it
 * references, from an `as` copy's target or from a lower-ranked block. The block's own value
 * applies over the reset. Both validator engines follow it (this spec runs in both).
 */

const rootDir = path.join(__dirname, 'fixtures', 'annotate-reset')

type T = TAtscriptAnnotatedType
let m: Record<string, T>

beforeAll(async () => {
  await prepareFixtures({
    rootDir,
    entries: ['model.as'],
    formats: ['js'],
    tsPluginOptions: { jsonSchema: 'lazy' },
  })
  m = await import(path.join(rootDir, 'model.as.js'))
})

const prop = (t: T, ...names: string[]): T => {
  let n = t
  for (const name of names) {
    n = (n.type as TAtscriptTypeObject).props.get(name)!
  }
  return n
}
const meta = (n: T) => Object.fromEntries(n.metadata.entries())
const valid = (t: T, value: unknown) => t.validator().validate(value, true)

const ACCOUNT = {
  name: 'nina',
  login: 'not-an-email',
  email: 'a@b.cd',
  token: 't',
  code: 'x',
  address: { city: 'Rome' },
  billing: { city: 'R' },
}

describe('@annotate.reset at runtime', () => {
  it('drops a declared value; the block’s own applies over it', () => {
    const name = prop(m.Account, 'name')
    expect(name.metadata.get('expect.pattern')).toEqual([{ pattern: '^n' }])
    expect(name.metadata.get('meta.label')).toBe('Full name')
    expect(valid(m.Account, ACCOUNT)).toBe(true)
    expect(valid(m.Account, { ...ACCOUNT, name: 'Nina' })).toBe(false)
  })

  it('drops a value inherited from the referenced type', () => {
    const login = prop(m.Account, 'login')
    expect(login.metadata.has('expect.pattern')).toBe(false)
    expect(login.metadata.get('expect.pattern')).toBeUndefined()
    expect([...login.metadata.keys()]).not.toContain('expect.pattern')
    // (the type itself keeps it)
    expect(m.Login.metadata.get('expect.pattern')).toHaveLength(1)
    expect(valid(m.Login, 'not-an-email')).toBe(false)
  })

  it('a later reset drops an earlier block’s and the declared values', () => {
    const code = prop(m.Account, 'code')
    expect(code.metadata.has('expect.pattern')).toBe(false)
    expect(valid(m.Account, { ...ACCOUNT, code: 'qq' })).toBe(true)
  })

  it('a path through a referrer resets only that referrer’s field', () => {
    const billing = prop(m.Account, 'billing', 'city')
    expect(meta(billing)).toEqual({})
    expect(meta(prop(m.Account, 'address', 'city'))).toEqual({
      'meta.label': 'City',
      'expect.minLength': { length: 2 },
    })
    expect(meta(prop(m.Address, 'city'))).toEqual({
      'meta.label': 'City',
      'expect.minLength': { length: 2 },
    })
    expect(valid(m.Account, ACCOUNT)).toBe(true)
    expect(valid(m.Account, { ...ACCOUNT, address: { city: 'R' } })).toBe(false)
  })

  it('a top-level reset of a mutating block drops the type’s own value', () => {
    expect(meta(m.Tag)).toEqual({ 'meta.description': 'A tag' })
  })

  it('an `as` copy resets in its own layer; the target keeps its values', () => {
    const copy = m.PublicAccount
    expect(meta(copy)).toEqual({ 'meta.label': 'Public account' })
    expect(meta(m.Account)).toEqual({ 'meta.label': 'Account', 'meta.description': 'An account' })
    expect(prop(copy, 'token').metadata.has('meta.sensitive')).toBe(false)
    expect(prop(m.Account, 'token').metadata.has('meta.sensitive')).toBe(true)
    expect(prop(copy, 'email').metadata.has('expect.pattern')).toBe(false)
    expect(valid(copy, { ...ACCOUNT, email: 'nope' })).toBe(true)
    expect(valid(m.Account, { ...ACCOUNT, email: 'nope' })).toBe(false)
  })

  it('references see the reset node', () => {
    expect(prop(m.Holder, 'account', 'login').metadata.has('expect.pattern')).toBe(false)
    expect(prop(m.Holder, 'login').metadata.has('expect.pattern')).toBe(false)
    expect(valid(m.Holder, { account: ACCOUNT, login: 'x' })).toBe(true)
  })

  it('JSON Schema follows the reset', () => {
    const schema = m.Account.toJsonSchema() as any
    expect(schema.properties.login.pattern).toBeUndefined()
    expect(schema.properties.name.pattern).toBe('^n')
    expect(m.PublicAccount.toJsonSchema().properties.email.pattern).toBeUndefined()
  })

  it('block ranks decide, not the order blocks load in', () => {
    const a = prop(m.Ranked, 'a')
    const block = (rank: number, anns: Array<[string, unknown] | [string, unknown, 1]>) =>
      $blk([rank, 'm'], 0, m.Ranked, [[anns, [['a', 0]]]])
    block(5, [
      ['annotate.reset', 'meta.label', 1],
      ['annotate.reset', 'expect.pattern', 1],
    ])
    expect(meta(a)).toEqual({})
    // (a lower-ranked block loading later is below the reset)
    block(1, [
      ['meta.label', 'low'],
      ['expect.pattern', { pattern: '^l' }, 1],
    ])
    expect(meta(a)).toEqual({})
    // (a higher-ranked one applies)
    block(9, [
      ['meta.label', 'high'],
      ['expect.pattern', { pattern: '^h' }, 1],
    ])
    expect(meta(a)).toEqual({ 'meta.label': 'high', 'expect.pattern': [{ pattern: '^h' }] })
    expect(valid(m.Ranked, { a: 'pq' })).toBe(false)
    expect(valid(m.Ranked, { a: 'hq' })).toBe(true)
  })

  it('on a field with bases, an append-key reset holds whatever order blocks load in', () => {
    const reset: Array<[string, unknown, 1]> = [['annotate.reset', 'expect.pattern', 1]]
    const value: Array<[string, unknown, 1]> = [['expect.pattern', { pattern: '^l' }, 1]]
    const block = (field: string, rank: number, anns: Array<[string, unknown, 1]>) =>
      $blk([rank, 'm'], 0, m.RankedRef, [[anns, [[field, 0]]]])
    // (the reset first, the lower-ranked value later)
    block('l1', 5, reset)
    block('l1', 1, value)
    expect(meta(prop(m.RankedRef, 'l1'))).toEqual({})
    // (the lower-ranked value first, the reset later)
    block('l2', 1, value)
    block('l2', 5, reset)
    expect(meta(prop(m.RankedRef, 'l2'))).toEqual({})
    expect(valid(m.RankedRef, { l1: 'x', l2: 'y' })).toBe(true)
    // (the type keeps its pattern)
    expect(m.Login.metadata.get('expect.pattern')).toHaveLength(1)
  })

  // (last: it changes the fixture's type)
  it('`metadata.delete` of a reset key shows the bases again', () => {
    const login = prop(m.Account, 'login')
    expect(prop(m.Holder, 'account', 'login')).toBe(login)
    expect(valid(m.Account, ACCOUNT)).toBe(true)
    login.metadata.delete('expect.pattern')
    expect(login.metadata.get('expect.pattern')).toHaveLength(1)
    expect(valid(m.Account, ACCOUNT)).toBe(false)
  })
})

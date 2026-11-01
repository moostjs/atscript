import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build } from '@atscript/core'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { tsPlugin } from '../plugin'
import { isPhantomType } from '../runtime/annotated-type'
import { buildJsonSchema } from '../runtime/json-schema'

/*
 * Generated code of type paths (`v?: T.a.b`) through unions (MODEL §11 Q2, §15 CHAIN-1): the
 * field (one branch has the path) or a union of the fields (several), branches that dead-end
 * deeper skipped, nested unions flattened.
 */

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

/** Builds `source` (one module) and imports its generated module. */
async function load(source: string): Promise<Record<string, any>> {
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-type-paths-'))
  dirs.push(dir)
  writeFileSync(path.join(dir, 'm.as'), source)
  const repo = await build({ rootDir: dir, entries: ['m.as'], plugins: [tsPlugin()] })
  const diagnostics = await repo.diagnostics()
  const errors = [...diagnostics.values()].flat().filter(m => m.severity === 1)
  expect(errors.map(m => m.message)).toEqual([])
  for (const out of await repo.generate({ format: 'js' })) {
    writeFileSync(path.join(dir, 'm.as.js'), out.content)
  }
  vi.resetModules()
  return import(path.join(dir, 'm.as.js'))
}

const types = `
interface I0 {
  @meta.label 'I0.h'
  h: string
}
interface I5 {
  @meta.label 'I5.h'
  h: number
}
interface I6 {
  other: string
}
interface I2 {
  work: I0
}
interface I3 {
  work: I5
}
interface I7 {
  work: I6
}
`

const label = (n: any) => n.metadata.get('meta.label')
const shape = (n: any) => [n.type.kind, n.type.designType, n.type.items?.length]
const branches = (n: any) => n.type.items.map((i: any) => [i.type.designType, label(i)])

describe('generated type paths through unions', () => {
  it('a prop typed by a nullable union: the field', async () => {
    const m = await load(`${types}
interface X {
  work?: I0 | null
}
export interface CH {
  v?: X.work.h
}
`)
    const v = m.CH.type.props.get('v')
    expect([v.type.designType, label(v)]).toEqual(['string', 'I0.h'])
    expect(m.CH.validator().validate({ v: 'a' }, true)).toBe(true)
    expect(m.CH.validator().validate({ v: 1 }, true)).toBe(false)
  })

  it('a branch that dead-ends deeper is skipped', async () => {
    const m = await load(`${types}
type W = I2 | I7
export interface CH {
  v?: W.work.h
}
`)
    const v = m.CH.type.props.get('v')
    expect([v.type.designType, label(v)]).toEqual(['string', 'I0.h'])
  })

  it('nested unions are flattened: the union of the fields', async () => {
    const m = await load(`${types}
type U = I2 | I3
type UU = U | I7
export interface CH {
  v?: UU.work.h
}
`)
    const v = m.CH.type.props.get('v')
    expect(branches(v)).toEqual([
      ['string', 'I0.h'],
      ['number', 'I5.h'],
    ])
    expect(m.CH.validator().validate({ v: 1 }, true)).toBe(true)
    expect(m.CH.validator().validate({ v: true }, true)).toBe(false)
  })

  it('a scalar merge with a field reached through a union merges that field', async () => {
    // (as the same merge through a type without the union, `w`; it was `never`)
    const m = await load(`${types}
type M0 = I2 | null
type M1 = I2
export interface CH {
  v?: M0.work.h & string.email
  w?: M1.work.h & string.email
}
`)
    const [v, w] = ['v', 'w'].map(k => m.CH.type.props.get(k))
    expect(shape(v)).toEqual(shape(w))
    expect(v.type.designType ?? v.type.items[0].type.designType).toBe('string')
    expect(m.CH.validator().validate({ v: 'a@b.c' }, true)).toBe(true)
    expect(m.CH.validator().validate({ v: 'abc' }, true)).toBe(false)
  })
})

describe('generated type paths: one position, phantom (MODEL §15 POS-1, U4)', () => {
  it('the same declared field through several branches is one field', async () => {
    const m = await load(`${types}
interface I8 extends I2 {
  z: string
}
interface I4 {
  @meta.label 'I4.k'
  k: string
}
interface I9 {
  work: I0
}
type U = I2 | I7
type UU = U | I2
type D = I2 | I2
type M0 = I2 | null
type MM = M0 | I2
type X8 = I8 | I2
type DM = (I2 | I3) & I4
type V = I2 | I9
annotate V {
  @meta.description 'blkV'
  work.h
}
export interface CH {
  a?: UU.work.h
  b?: D.work.h
  c?: MM.work.h
  d?: X8.work.h
  e?: DM.k
  f?: V.work.h
}
`)
    for (const k of ['a', 'b', 'c', 'd']) {
      const v = m.CH.type.props.get(k)
      expect([k, v.type.kind, v.type.designType, label(v)]).toEqual([k, '', 'string', 'I0.h'])
    }
    const e = m.CH.type.props.get('e')
    expect([e.type.kind, label(e)]).toEqual(['', 'I4.k'])
    // (the same block on every branch: one field, with the block's annotation)
    const f = m.CH.type.props.get('f')
    expect([f.type.kind, label(f), f.metadata.get('meta.description')]).toEqual([
      '',
      'I0.h',
      'blkV',
    ])
  })

  it('a block on some branches only: the union of the fields', async () => {
    const m = await load(`${types}
interface I9 {
  work: I0
}
type U = I2 | I9
annotate I2 {
  @meta.description 'blkI2'
  work.h
}
export interface CH {
  v?: U.work.h
}
`)
    const v = m.CH.type.props.get('v')
    expect(
      v.type.items.map((i: any) => [i.type.designType, i.metadata.get('meta.description')])
    ).toEqual([
      ['string', 'blkI2'],
      ['string', undefined],
    ])
    // (validation does not depend on blocks)
    expect(m.CH.validator().validate({ v: 'a' }, true)).toBe(true)
    expect(m.CH.validator().validate({ v: 1 }, true)).toBe(false)
  })

  it('a path naming several phantom fields is phantom, as one naming a phantom field', async () => {
    const m = await load(`
interface P0 {
  h: string
  p: phantom
}
interface P5 {
  h: number
  p: phantom
}
interface P2 {
  work: P0
}
interface P3 {
  work: P5
}
type U = P2 | P3
type M0 = P2 | null
export interface CH {
  x: string
  a?: U.work.p
  b?: M0.work.p
}
`)
    for (const k of ['a', 'b']) {
      expect([k, isPhantomType(m.CH.type.props.get(k))]).toEqual([k, true])
      expect(m.CH.validator().validate({ x: '1', [k]: 5 }, true)).toBe(false)
    }
    expect(Object.keys((buildJsonSchema(m.CH) as any).properties)).toEqual(['x'])
  })
})

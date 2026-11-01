import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build } from '@atscript/core'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { tsPlugin } from '../plugin'

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

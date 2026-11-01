import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { build } from '@atscript/core'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { tsPlugin } from '../plugin'

/*
 * A contributor of a merged field reached through several operands of one merge counts once
 * (MODEL §15 DEDUP-1): an inherited prop is its parent's own node, so `I5 & I6` with
 * `I5 extends I6` has one contributor for it, as `I6 & I6`.
 */

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

/** Builds `source` (one module) and imports its generated module. */
async function load(source: string): Promise<Record<string, any>> {
  const dir = mkdtempSync(path.join(tmpdir(), 'atscript-merge-dedupe-'))
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

describe('a merged field reached through several operands', () => {
  it('counts an inherited prop once: a union holding objects merges with a scalar', async () => {
    const m = await load(`
export interface I6 {
  a?: number | { n: string }
}
export interface I5 extends I6 {
  k?: string
}
export interface P {
  a: number.int
}
export type M = I5 & I6 & P
export type N = I6 & I6 & P
`)
    for (const name of ['M', 'N']) {
      const a = m[name].type.props.get('a')
      expect([name, a.type.designType]).toEqual([name, 'number'])
      expect(m[name].validator().validate({ a: 1 }, true)).toBe(true)
      expect(m[name].validator().validate({ a: 1.5 }, true)).toBe(false)
    }
  })
})

import { beforeAll, describe, expect, it } from 'vitest'

import type { TAtscriptDocConfig } from '../document'
import { AtscriptDoc } from '../document'
import { isPrimitive } from '../parser/nodes'
import { PluginManager } from '../plugin/plugin-manager'
import { OPAQUE_MERGE } from '../structure'

/*
 * `unknown`: a primitive for any value (TypeScript `unknown`). It merges with scalars like any
 * scalar; merging it with an object, an array or `null` is a compile error (TypeScript reads
 * `unknown & X` as X, a merge of values would reject everything).
 */

let docConfig: TAtscriptDocConfig

beforeAll(async () => {
  docConfig = await new PluginManager({}).getDocConfig()
})

function createDoc(source: string): AtscriptDoc {
  const doc = new AtscriptDoc('file:///proj/test.as', docConfig)
  doc.update(source)
  return doc
}

const messages = (doc: AtscriptDoc) => doc.getDiagMessages().map(m => m.message)

describe('unknown primitive', () => {
  it('is a primitive of final type any', () => {
    const doc = createDoc('export type J = unknown')
    const def = doc.unwindType('J')?.def
    expect(isPrimitive(def) && def.config.type).toBe('any')
  })

  it('builds as a field, an array item, a union member and an alias', () => {
    const doc = createDoc(`
type J = unknown
interface A {
  a: unknown
  b?: unknown
  c: unknown[]
  d: string | unknown
  e: J
  f: { a: unknown } & { a: string }
}`)
    expect(messages(doc)).toEqual([])
  })

  it('refuses a merge with an object, an array or null', () => {
    const doc = createDoc(`
type J = unknown
type M = { a: unknown } & { a: { x: string } }
type N = J & { x: string }
type O = (J | { y: string }) & { x: string }
type P = unknown[] & { x: string }[]
type R = unknown & null
`)
    expect(
      doc
        .getDiagMessages()
        .filter(m => m.severity === 1)
        .map(m => m.message)
    ).toEqual([
      `${OPAQUE_MERGE} at "M.a": write the other type alone`,
      `${OPAQUE_MERGE} in "N": write the other type alone`,
      `${OPAQUE_MERGE} in "O": write the other type alone`,
      `${OPAQUE_MERGE} in "P": write the other type alone`,
      `${OPAQUE_MERGE} in "R": write the other type alone`,
    ])
  })
})

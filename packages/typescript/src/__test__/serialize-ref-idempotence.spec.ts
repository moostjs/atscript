import { describe, expect, it } from 'vitest'

import { defineAnnotatedType as $, type TAtscriptAnnotatedType } from '../runtime/annotated-type'
import { deserializeAnnotatedType, serializeAnnotatedType } from '../runtime/serialize'

// With `refDepth`, the payload holds the FK target's tree too, and the two trees may share nodes
// (`annotate T as TA` shares T's nodes, its root refers to T): a node without an id shared by them
// is written once and referenced elsewhere, decided before anything is written — so serialize →
// deserialize → serialize gives the same payload (battery genall NOT-IDEMP `rec-cross-a#TA`).

/** `TA = {d1: D, d2: D}` → FK target `T = {b: X, d: D}`, `D = {x: X}`, `X = {q: string}` (no ids). */
function shared(): TAtscriptAnnotatedType {
  const x = $('object').prop('q', $().designType('string').$type).$type
  const d = $('object').prop('x', x).$type
  const t = $('object').prop('b', x).prop('d', d).id('T').$type
  const ta = $('object').prop('d1', d).prop('d2', d).id('TA').$type
  ta.ref = { type: () => t, field: '' }
  return ta
}

describe('serialize with refDepth: idempotent (round 24 part 3)', () => {
  for (const refDepth of [0, 1, 2]) {
    it(`refDepth ${refDepth}`, () => {
      const a = JSON.stringify(serializeAnnotatedType(shared(), { refDepth }))
      const b = JSON.stringify(
        serializeAnnotatedType(deserializeAnnotatedType(JSON.parse(a)), { refDepth })
      )
      expect(b).toBe(a)
    })
  }
})

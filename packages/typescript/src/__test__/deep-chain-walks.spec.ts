import { describe, expect, it } from 'vitest'

import { defineAnnotatedType as $, type TAtscriptAnnotatedType } from '../runtime/annotated-type'
import { createDataFromAnnotatedType } from '../runtime/default-value'
import { deserializeAnnotatedType, serializeAnnotatedType } from '../runtime/serialize'

// A chain of types as deep as the user writes it (round 24 part 2 built a 3000-deep chain of
// merging classes): the walks over the type tree that recursed once per level overflowed the
// call stack. They run on an explicit stack now (`runWalk`).

const DEPTH = 5000

/** `I0 = {v0?: number, x?: I1}`, …, `I<depth-1> = {v?: number}`. */
function chain(depth: number): TAtscriptAnnotatedType {
  let next: TAtscriptAnnotatedType | undefined
  for (let i = depth - 1; i >= 0; i--) {
    const h = $('object', undefined).prop(`v${i}`, $().designType('number').optional().$type)
    if (next) {
      h.prop('x', $('object').prop('n', next).optional().$type)
    }
    next = h.id(`I${i}`).$type
  }
  return next!
}

/** Deep equality of two JSON values, on an explicit stack (JSON.stringify of 5000 levels overflows). */
function sameJson(a: unknown, b: unknown): boolean {
  const pending: Array<[any, any]> = [[a, b]]
  while (pending.length > 0) {
    const [x, y] = pending.pop()!
    if (x === y) {
      continue
    }
    if (typeof x !== 'object' || typeof y !== 'object' || x === null || y === null) {
      return false
    }
    const kx = Object.keys(x)
    const ky = Object.keys(y)
    if (kx.length !== ky.length || kx.some((k, i) => k !== ky[i])) {
      return false
    }
    for (const k of kx) {
      pending.push([x[k], y[k]])
    }
  }
  return true
}

function depthOf(data: any): number {
  let n = 0
  while (data?.x !== undefined) {
    data = data.x.n
    n++
  }
  return n
}

describe('deep chains of types (round 24 part 3)', () => {
  it('serialize / deserialize round trip of a 5000-deep chain', () => {
    const t = chain(DEPTH)
    const a = serializeAnnotatedType(t)
    const b = serializeAnnotatedType(deserializeAnnotatedType(a))
    expect(sameJson(b, a)).toBe(true)
  })

  it('example data of a 5000-deep chain', () => {
    const data = createDataFromAnnotatedType(chain(DEPTH), { mode: 'example' })
    expect(depthOf(data)).toBe(DEPTH - 1)
  })
})

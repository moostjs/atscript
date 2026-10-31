import { describe, expect, it, vi } from 'vitest'

import { boundCheck, compileType } from '../../test/compiled-engine'
import {
  defineAnnotatedType as $,
  type TAtscriptAnnotatedType,
  type TAtscriptTypeObject,
} from '../runtime/annotated-type'
import { Validator, type TValidatorOptions } from '../runtime/validator'

// A union nested in its own branches, many branches each: a value failing deep down fails every
// branch of every union above it, so a walk deciding each union anew does (branches)^(depth) work
// and keeps every discarded branch's errors (dense oracle seeds 863 / 1210: ~36 branches a level,
// 0.3 s and > 2 GB per failed validation). The walk decides a union over the same value and path
// once per call, and a failed union's details stay bounded.

const lit = (v: string) => $().designType('string').value(v).$type

/** `U = {d: U, k: 'k0'} | … | {d: U, k: 'k<n-1>'} | 'end'`: `d` checked before `k`. */
function chainUnion(branches: number): TAtscriptAnnotatedType {
  const u = $('union')
  for (let i = 0; i < branches; i++) {
    u.item(
      $('object')
        .prop('d', u.$type)
        .prop('k', lit(`k${i}`)).$type
    )
  }
  u.item(lit('end'))
  return u.$type
}

/** `{d: {d: … {d: 'end', k: last}, k}, k}`, `depth` objects deep; the deepest `k` is `deepest`. */
function chainValue(depth: number, k: string, deepest: string): any {
  let v: any = 'end'
  for (let i = 0; i < depth; i++) {
    v = { d: v, k: i === 0 ? deepest : k }
  }
  return v
}

/** {@link chainValue} counting the reads of every `d` (`reads.n`). */
function countedChain(depth: number, k: string, deepest: string, reads: { n: number }): any {
  let v: any = 'end'
  for (let i = 0; i < depth; i++) {
    const d = v
    v = { k: i === 0 ? deepest : k }
    Object.defineProperty(v, 'd', {
      enumerable: true,
      get: () => {
        reads.n++
        return d
      },
    })
  }
  return v
}

/** Adds the unknown key `z` to every object of a chain value (made by the helpers above). */
function withUnknown(v: any): any {
  for (let o = v; typeof o === 'object'; o = o.d) {
    o.z = 1
  }
  return v
}

/** Whether no object of a chain value has the key `z` any more. */
function stripped(v: any): boolean {
  for (let o = v; typeof o === 'object'; o = o.d) {
    if ('z' in o) {
      return false
    }
  }
  return true
}

/** The walk (no pre-check), counting the object nodes it visits. */
class CountingWalk extends Validator {
  objects = 0
  protected validateObject(def: TAtscriptAnnotatedType<TAtscriptTypeObject>, value: any): boolean {
    this.objects++
    return super.validateObject(def, value)
  }
}

/** The errors `errors` stand for, details expanded (a shared error counted wherever it is). */
function expandedCount(errors: any[]): number {
  const memo = new Map<object, number>()
  const count = (e: any): number => {
    let n = memo.get(e)
    if (n === undefined) {
      n = 1 + (e.details ?? []).reduce((sum: number, d: any) => sum + count(d), 0)
      memo.set(e, n)
    }
    return n
  }
  return errors.reduce((sum, e) => sum + count(e), 0)
}

/**
 * The structure ids of error trees (one table: equal trees, shared or not, get one id) — paths,
 * messages, details in order.
 */
function structureIds(): (errors: any[]) => number {
  const ids = new Map<string, number>()
  const memo = new Map<object, number>()
  const intern = (key: string) => {
    let id = ids.get(key)
    if (id === undefined) {
      id = ids.size
      ids.set(key, id)
    }
    return id
  }
  const idOf = (e: any): number => {
    let id = memo.get(e)
    if (id === undefined) {
      id = intern(JSON.stringify([e.path, e.message, (e.details ?? []).map(idOf)]))
      memo.set(e, id)
    }
    return id
  }
  return errors => intern(JSON.stringify(errors.map(idOf)))
}

/** The distinct error objects reachable from `errors`. */
function distinctCount(errors: any[]): number {
  const seen = new Set<object>()
  const stack = [...errors]
  while (stack.length > 0) {
    const e = stack.pop()
    if (!seen.has(e)) {
      seen.add(e)
      stack.push(...(e.details ?? []))
    }
  }
  return seen.size
}

const OPTS: Array<Partial<TValidatorOptions>> = [
  {},
  { unknownProps: 'ignore' },
  { unknownProps: 'strip' },
]

describe('union backtracking (round 24 part 3)', () => {
  it('a value failing deep down: each union decided once per value and path', () => {
    const u = chainUnion(6)
    for (const opts of OPTS) {
      const w = new CountingWalk(u, opts)
      expect(w.validate(chainValue(7, 'k5', 'bad'), true)).toBe(false)
      // once the memo is made (16 wasted branches); was 2 015 538
      expect(w.objects).toBeLessThan(1000)
      expect(w.errors).toHaveLength(1)
      expect(w.errors[0].message).toBe(
        'Value does not match any of the allowed types: [object(0)], [object(1)], [object(2)], [object(3)], [object(4)], [object(5)], [string(6)]'
      )
    }
  })

  // No bound — a union decided once per value and path is ONE error
  // object wherever its outcome is reported, so the details are complete and their memory stays
  // proportional to the work (a DAG: the shared errors are one object each).
  it("a failed union's details are complete, the outcomes decided once shared", () => {
    const u = chainUnion(6)
    const w = new Validator(u)
    expect(w.validate(chainValue(7, 'k5', 'bad'), true)).toBe(false)
    // (every error of every alternative, as deciding each union anew: was bounded at ~1000)
    const anew = new Validator(u)
    ;(anew as any).wasteBranch = () => {}
    expect(anew.validate(chainValue(7, 'k5', 'bad'), true)).toBe(false)
    expect(expandedCount(w.errors)).toBe(expandedCount(anew.errors))
    expect(expandedCount(w.errors)).toBeGreaterThan(400_000)
    const ids = structureIds()
    expect(ids(w.errors)).toBe(ids(anew.errors))
    // (one object per error made: shared where an outcome was reused)
    expect(distinctCount(w.errors)).toBeLessThan(2000)
  })

  it('the same result as without backtracking for a valid value (and passes decided once)', () => {
    const u = chainUnion(6)
    for (const opts of OPTS) {
      const w = new CountingWalk(u, opts)
      expect(w.validate(chainValue(7, 'k5', 'k5'), true)).toBe(true)
      expect(w.objects).toBeLessThan(1000)
    }
  })

  // 'strip' records the strips of an accepted branch, and a memoized union records them again on
  // every reuse: a passing value with unknown keys is decided once per union, value and path too.
  it("'strip' with unknown keys at every level: passes decided once, every key stripped", () => {
    const u = chainUnion(6)
    const w = new CountingWalk(u, { unknownProps: 'strip' })
    const value = withUnknown(chainValue(7, 'k5', 'k5'))
    expect(w.validate(value, true)).toBe(true)
    expect(w.objects).toBeLessThan(1000)
    expect(stripped(value)).toBe(true)
  })

  it('ordinary unions: the full details, as before', () => {
    const u = chainUnion(2)
    const w = new Validator(u)
    expect(w.validate(chainValue(2, 'k1', 'bad'), true)).toBe(false)
    expect(w.errors).toMatchInlineSnapshot(`
      [
        {
          "details": [
            {
              "details": [
                {
                  "message": "Expected k0, got bad",
                  "path": "d.k",
                },
                {
                  "message": "Expected k1, got bad",
                  "path": "d.k",
                },
                {
                  "message": "Expected end, got [object Object]",
                  "path": "d",
                },
              ],
              "message": "Value does not match any of the allowed types: [object(0)], [object(1)], [string(2)]",
              "path": "d",
            },
            {
              "message": "Expected k0, got k1",
              "path": "k",
            },
            {
              "details": [
                {
                  "message": "Expected k0, got bad",
                  "path": "d.k",
                },
                {
                  "message": "Expected k1, got bad",
                  "path": "d.k",
                },
                {
                  "message": "Expected end, got [object Object]",
                  "path": "d",
                },
              ],
              "message": "Value does not match any of the allowed types: [object(0)], [object(1)], [string(2)]",
              "path": "d",
            },
            {
              "message": "Expected end, got [object Object]",
              "path": "",
            },
          ],
          "message": "Value does not match any of the allowed types: [object(0)], [object(1)], [string(2)]",
          "path": "",
        },
      ]
    `)
  })

  for (const engine of ['interpreted', 'compiled']) {
    it(`the ${engine} pre-check of a valid value: each nested union decided once`, () => {
      const u = chainUnion(6)
      if (engine === 'compiled') {
        compileType(u)
        expect(boundCheck(u)).not.toBeNull()
      }
      for (const opts of OPTS) {
        const reads = { n: 0 }
        // pre-check only: it passes
        expect(new Validator(u, opts).validate(countedChain(8, 'k5', 'k5', reads), true)).toBe(true)
        // was 2 015 538 reads
        expect(reads.n).toBeLessThan(1000)
      }
      // 'strip' with unknown keys at every level: decided by the pre-check, which records each
      // memoized union's strips again on a reuse
      const reads = { n: 0 }
      const value = withUnknown(countedChain(8, 'k5', 'k5', reads))
      const v = new Validator(u, { unknownProps: 'strip' })
      const walk = vi.spyOn(v as any, 'validateSafe')
      expect(v.validate(value, true)).toBe(true)
      expect(walk).not.toHaveBeenCalled()
      expect(reads.n).toBeLessThan(1000)
      expect(stripped(value)).toBe(true)
    })

    it(`the ${engine} pre-check and the walk of a value failing deep down`, () => {
      const u = chainUnion(6)
      if (engine === 'compiled') {
        compileType(u)
      }
      for (const opts of OPTS) {
        const reads = { n: 0 }
        const v = new Validator(u, opts)
        expect(v.validate(countedChain(8, 'k5', 'bad', reads), true)).toBe(false)
        expect(v.errors).toHaveLength(1)
        // was 6 046 614 reads
        expect(reads.n).toBeLessThan(2000)
      }
    })
  }
})

import path from 'path'

import { beforeAll, describe, expect, it } from 'vitest'

import { coerceForType } from '../runtime/coerce'
import { normalizeForType } from '../runtime/normalize'
import { prepareFixtures } from '../test-utils'

const rootDir = path.join(__dirname, 'fixtures')

/** `value` with its plain objects behind proxies counting the reads of their props. */
function counted(value: unknown, reads: { n: number }): unknown {
  if (Array.isArray(value)) {
    return value.map(item => counted(item, reads))
  }
  if (typeof value !== 'object' || value === null) {
    return value
  }
  const copy: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    copy[key] = counted(item, reads)
  }
  return new Proxy(copy, {
    get(target, key, receiver) {
      reads.n++
      return Reflect.get(target, key, receiver)
    },
  })
}

/** `{ child: …, kind }` nested `depth` deep, the literal key last. */
function chain(depth: number, kind: string): unknown {
  return depth === 0 ? { kind } : { child: chain(depth - 1, kind), kind }
}

/** `value` coerced against `type`; asserts that normalizing and validating the result passes. */
function roundTrip(type: any, value: unknown): unknown {
  const out = coerceForType(type, value)
  expect(type.validator().validate(normalizeForType(type, out), true)).toBe(true)
  return out
}

describe('coerceForType', () => {
  let KafkaOffset: any
  let Flag: any
  let Level: any
  let MaybeNumber: any
  let SearchQuery: any
  let CTree: any
  let RangeFilter: any
  let Versioned: any
  let NestedU: any
  let Opt: any
  let Mixed: any
  let PU: any
  let DU: any
  let Q: any
  let RN: any
  let LitNull: any
  let TupU: any
  let AnU: any
  let AzU: any
  let RU: any
  let IN2: any
  let SameObjects: any

  beforeAll(async () => {
    await prepareFixtures({ rootDir, entries: ['coerce.as'] })
    const m = await import(path.join(rootDir, 'coerce.as.js'))
    ;({ KafkaOffset, Flag, Level, MaybeNumber, SearchQuery, CTree, RangeFilter, Versioned } = m)
    ;({ NestedU, Opt, Mixed, PU, DU, Q, RN, LitNull, TupU } = m)
    ;({ AnU, AzU, RU, IN2, SameObjects } = m)
  })

  describe('number targets', () => {
    it('parses numeric strings', () => {
      expect(coerceForType(KafkaOffset, '42')).toBe(42)
      expect(coerceForType(KafkaOffset, '-7')).toBe(-7)
      expect(coerceForType(KafkaOffset, '3.14')).toBe(3.14)
    })

    it('trims surrounding whitespace', () => {
      expect(coerceForType(KafkaOffset, ' 42 ')).toBe(42)
    })

    it('leaves numbers untouched', () => {
      expect(coerceForType(KafkaOffset, 42)).toBe(42)
    })

    it('returns unparsable input untouched for the validator to report', () => {
      expect(coerceForType(KafkaOffset, 'abc')).toBe('abc')
      expect(coerceForType(KafkaOffset, '')).toBe('')
      expect(coerceForType(KafkaOffset, '  ')).toBe('  ')
      expect(coerceForType(KafkaOffset, 'Infinity')).toBe('Infinity')
      expect(coerceForType(KafkaOffset, 'NaN')).toBe('NaN')
      expect(coerceForType(KafkaOffset, null)).toBe(null)
      expect(coerceForType(KafkaOffset, undefined)).toBe(undefined)
      expect(coerceForType(KafkaOffset, true)).toBe(true)
    })

    it('does not validate constraints — that stays the validator job', () => {
      // @expect.min 0 / @expect.int are violated but coercion still parses
      expect(coerceForType(KafkaOffset, '-5')).toBe(-5)
      expect(coerceForType(KafkaOffset, '1.5')).toBe(1.5)
      expect(KafkaOffset.validator().validate(coerceForType(KafkaOffset, '-5'), true)).toBe(false)
      expect(KafkaOffset.validator().validate(coerceForType(KafkaOffset, '5'), true)).toBe(true)
    })
  })

  describe('boolean targets', () => {
    it.each([
      ['true', true],
      ['1', true],
      ['false', false],
      ['0', false],
    ])('parses %j', (input, expected) => {
      expect(coerceForType(Flag, input)).toBe(expected)
    })

    it('leaves booleans and unknown strings untouched', () => {
      expect(coerceForType(Flag, true)).toBe(true)
      expect(coerceForType(Flag, 'yes')).toBe('yes')
      expect(coerceForType(Flag, 'TRUE')).toBe('TRUE')
    })
  })

  describe('unions', () => {
    it('picks the first branch whose parse succeeds, honoring literals', () => {
      // Level = 1 | 2 | 'max'
      expect(coerceForType(Level, '1')).toBe(1)
      expect(coerceForType(Level, '2')).toBe(2)
      expect(coerceForType(Level, 'max')).toBe('max')
      expect(coerceForType(Level, '3')).toBe('3')
    })

    it('respects declared order — string branch first keeps strings', () => {
      // MaybeNumber = string | number
      expect(coerceForType(MaybeNumber, '5')).toBe('5')
      expect(coerceForType(MaybeNumber, 5)).toBe(5)
    })

    it('an object of a discriminated union is coerced against the branch it names', () => {
      // RangeFilter = ByFlag | ByRange — not the first object branch
      expect(roundTrip(RangeFilter, { kind: 'range', from: '1', to: '5' })).toEqual({
        kind: 'range',
        from: 1,
        to: 5,
      })
      expect(coerceForType(RangeFilter, { kind: 'flag', from: '1' })).toEqual({
        kind: 'flag',
        from: true,
      })
      // a non-string literal named by its string form
      expect(roundTrip(Versioned, { version: '2', n: '1' })).toEqual({ version: 2, n: 1 })
      expect(coerceForType(Versioned, { version: '1', n: '1' })).toEqual({ version: 1, n: true })
    })

    it('a discriminator naming no branch: declared order, as before', () => {
      expect(coerceForType(RangeFilter, { from: '1' })).toEqual({ from: true })
      // (no branch takes it: untouched, for the validator to report)
      const other = { kind: 'other', from: '1' }
      expect(coerceForType(RangeFilter, other)).toBe(other)
    })

    it('an object whose literal prop holds another value is not of that branch', () => {
      // a nested discriminated union: `NestedU = (Inner1 | Inner2) | Outer5`
      expect(roundTrip(NestedU, { t: 'o5', v: '1' })).toEqual({ t: 'o5', v: true })
      expect(coerceForType(NestedU, { t: 'i1', v: '1' })).toEqual({ t: 'i1', v: 1 })
      // an optional literal prop (no discriminator): `Opt = OptA | OptB`
      expect(roundTrip(Opt, { kind: 'b', x: '1' })).toEqual({ kind: 'b', x: 1 })
      expect(coerceForType(Opt, { x: '1' })).toEqual({ x: true })
    })

    it('an object not tried as a union branch is coerced whatever its literal props hold', () => {
      // `Q { @normalize.lowercase mode: 'asc'; limit: number }`
      expect(roundTrip(Q, { mode: 'ASC', limit: '5' })).toEqual({ mode: 'ASC', limit: 5 })
    })

    it("a literal prop is compared after the literal's own normalizers", () => {
      // `RN = FlagN | RangeN`, `@normalize.trim kind`
      expect(roundTrip(RN, { kind: ' flag ', from: '1' })).toEqual({ kind: ' flag ', from: true })
      expect(coerceForType(RN, { kind: 'range ', from: '1' })).toEqual({ kind: 'range ', from: 1 })
    })

    it('the literals of a nested union keep the normalizers on their way', () => {
      // `@normalize.lowercase type KindAX = 'a' | 'x'`; `kind: KindAX | null`, `kind: KindAX | 'z'`
      expect(roundTrip(AnU, { kind: 'X', n: '1' })).toEqual({ kind: 'X', n: 1 })
      expect(roundTrip(AzU, { kind: 'X', n: '1' })).toEqual({ kind: 'X', n: 1 })
      expect(roundTrip(AzU, { kind: 'b', n: '1' })).toEqual({ kind: 'b', n: true })
    })

    it('an object takes the first branch whose shape it has', () => {
      // (a required prop missing, a key the branch does not declare: not its shape)
      expect(roundTrip(CTree, { b: '1', children: [] })).toEqual({ b: true, children: [] })
      expect(roundTrip(RU, { y: 'true' })).toEqual({ y: true })
      expect(roundTrip(SameObjects, { a: ' q ', b: ' 1 ' })).toEqual({ a: ' q ', b: 1 })
      // `(IBase & IKU) | IOther`
      expect(roundTrip(IN2, { other: 'true' })).toEqual({ other: true })
      expect(roundTrip(IN2, { id: '1', kind: 'b', v: '0' })).toEqual({ id: 1, kind: 'b', v: false })
    })

    it('a partial patch (no branch whose shape it has) takes the first branch, as before', () => {
      // `RU = RA { kind: 'a'; x: number } | RB { y: boolean }`
      expect(coerceForType(RU, { x: '1' })).toEqual({ x: 1 })
      expect(coerceForType(RangeFilter, { from: '1' })).toEqual({ from: true })
    })

    it('a prop holding a union of literals and null rules out a branch too', () => {
      // `LitNull = LitNullA { kind: 'a' | null } | LitNullB { kind: 'b' }`
      expect(roundTrip(LitNull, { kind: 'b', n: '1' })).toEqual({ kind: 'b', n: true })
      expect(coerceForType(LitNull, { kind: null, n: '1' })).toEqual({ kind: null, n: 1 })
    })

    it('a tuple branch is ruled out by a literal item', () => {
      // `TupU = ['a', number] | ['b', boolean]`
      expect(coerceForType(TupU, ['b', '1'])).toEqual(['b', true])
      expect(coerceForType(TupU, ['a', '1'])).toEqual(['a', 1])
    })

    it('a discriminator value equal to a literal names that branch first', () => {
      // `Mixed = N1 { v: 1 } | S1 { v: '1' }`: "1" is S1's literal
      expect(coerceForType(Mixed, { v: '1', n: '1' })).toEqual({ v: '1', n: true })
      expect(coerceForType(Mixed, { v: 1, n: '1' })).toEqual({ v: 1, n: 1 })
    })
  })

  describe('object targets (@Query() DTOs)', () => {
    it('recurses into props, coercing string fields to their scalar targets', () => {
      const input = {
        offset: '10',
        limit: '50',
        active: 'true',
        term: 'shoes',
        price: '19.99',
        ids: ['1', '2'],
        nested: { depth: '3' },
      }
      const result = coerceForType(SearchQuery, input) as any
      expect(result).toEqual({
        offset: 10,
        limit: 50,
        active: true,
        term: 'shoes',
        price: '19.99', // decimal stays a string
        ids: [1, 2],
        nested: { depth: 3 },
      })
      expect(SearchQuery.validator().validate(result, true)).toBe(true)
    })

    it('is pure — the input object is not mutated', () => {
      const input = { offset: '10', active: 'true', term: 'x', price: '1', ids: [] }
      const result = coerceForType(SearchQuery, input) as any
      expect(result).not.toBe(input)
      expect(input.offset).toBe('10')
      expect(input.active).toBe('true')
    })

    it('returns the same reference when nothing changed', () => {
      const input = { offset: 10, active: true, term: 'x', price: '1', ids: [1] }
      expect(coerceForType(SearchQuery, input)).toBe(input)
    })

    it('keeps unknown props untouched', () => {
      const input = { offset: '10', active: 'true', term: 'x', price: '1', ids: [], extra: '5' }
      const result = coerceForType(SearchQuery, input) as any
      expect(result.extra).toBe('5')
    })

    it('does not recurse into non-plain objects', () => {
      const date = new Date()
      expect(coerceForType(SearchQuery, date)).toBe(date)
    })
  })

  describe('arrays', () => {
    it('coerces items and stays pure', () => {
      const arr = SearchQuery.type.props.get('ids')
      const input = ['1', '2', 'x']
      const result = coerceForType(arr, input)
      expect(result).toEqual([1, 2, 'x'])
      expect(input).toEqual(['1', '2', 'x'])
    })

    it('returns non-array input untouched', () => {
      const arr = SearchQuery.type.props.get('ids')
      expect(coerceForType(arr, '1,2')).toBe('1,2')
    })
  })

  describe('hardening', () => {
    it('an own `__proto__` key stays an own key (never the output’s prototype)', () => {
      const input = JSON.parse('{"__proto__": {"role": "admin"}, "offset": "5"}')
      const out = coerceForType(SearchQuery, input) as any
      expect(out.offset).toBe(5)
      expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
      expect(out.role).toBeUndefined()
      expect(Object.keys(out)).toContain('__proto__')
    })

    it('a recursive union is linear (one branch taken, no backtracking)', () => {
      // (`CTree = CNodeA | CNodeB`: B nodes, their literal prop last — A is ruled out by it)
      const mk = (d: number): any =>
        d === 0
          ? { b: '1', children: [], kind: 'b' }
          : { b: '1', children: [mk(d - 1), mk(0)], kind: 'b' }
      const reads = { n: 0 }
      const out = coerceForType(CTree, counted(mk(400), reads)) as any
      expect(out.b).toBe(true)
      expect(out.children[0].children[1].b).toBe(true)
      expect(CTree.validator().validate(out, true)).toBe(true)
      // (each object read a bounded number of times: 801 objects)
      expect(reads.n).toBeLessThan(801 * 12)
    })

    it('a union branch ruled out by a literal prop last is not walked into', () => {
      // `PU = PA | PB`, every node a PB: `{ child: …, kind: 'b' }`
      const reads = { n: 0 }
      const value = counted(chain(20, 'b'), reads)
      expect(coerceForType(PU, value)).toBe(value)
      expect(reads.n).toBeLessThan(21 * 12)
      // (`DU = DA | DB` discriminated, a tag naming no branch: untouched, nothing walked)
      const zReads = { n: 0 }
      const zValue = counted(chain(20, 'z'), zReads)
      expect(coerceForType(DU, zValue)).toBe(zValue)
      expect(zReads.n).toBeLessThan(12)
    })
  })
})

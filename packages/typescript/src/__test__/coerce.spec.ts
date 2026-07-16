import path from 'path'

import { beforeAll, describe, expect, it } from 'vitest'

import { coerceForType } from '../runtime/coerce'
import { prepareFixtures } from '../test-utils'

const rootDir = path.join(__dirname, 'fixtures')

describe('coerceForType', () => {
  let KafkaOffset: any
  let Flag: any
  let Level: any
  let MaybeNumber: any
  let SearchQuery: any

  beforeAll(async () => {
    await prepareFixtures({ rootDir, entries: ['coerce.as'] })
    ;({ KafkaOffset, Flag, Level, MaybeNumber, SearchQuery } = await import(
      path.join(rootDir, 'coerce.as.js')
    ))
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
})

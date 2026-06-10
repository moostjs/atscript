import path from 'path'

import { beforeAll, describe, expect, it } from 'vitest'

import { prepareFixtures } from '../test-utils'

const rootDir = path.join(__dirname, 'fixtures')

// string.date / string.isoDate ship alternative formats. Since every
// expect.pattern entry must match (conjunctive), the alternatives live in a
// single alternation regex — an array of patterns would be unsatisfiable.
describe('string.date / string.isoDate primitives', () => {
  let DateBox: any

  beforeAll(async () => {
    await prepareFixtures({ rootDir, entries: ['date-primitives.as'] })
    ;({ DateBox } = await import(path.join(rootDir, 'date-primitives.as.js')))
  })

  it.each([
    '2024-01-15', // YYYY-MM-DD
    '01/15/2024', // MM/DD/YYYY
    '15-01-2024', // DD-MM-YYYY
    '15 January 2024', // D Month YYYY
    '5 May 2024',
  ])('accepts date format %s', d => {
    const validator = DateBox.validator()
    expect(validator.validate({ d, iso: '2024-01-15T10:00:00Z' }, true)).toBe(true)
  })

  it.each([
    '2024-01-15T10:00:00Z',
    '2024-01-15T10:00:00.123Z',
    '2024-01-15T10:00:00+02:00',
    '2024-01-15T10:00:00.5-05:30',
  ])('accepts ISO date %s', iso => {
    const validator = DateBox.validator()
    expect(validator.validate({ d: '2024-01-15', iso }, true)).toBe(true)
  })

  it.each(['not a date', '2024-1-5', '15/01/24', ''])('rejects invalid date %j', d => {
    const validator = DateBox.validator()
    expect(validator.validate({ d, iso: '2024-01-15T10:00:00Z' }, true)).toBe(false)
    expect(validator.errors[0]).toMatchObject({ path: 'd', message: 'Invalid date format.' })
  })

  it.each(['2024-01-15', '2024-01-15 10:00:00', '2024-01-15T10:00:00'])(
    'rejects invalid ISO date %j',
    iso => {
      const validator = DateBox.validator()
      expect(validator.validate({ d: '2024-01-15', iso }, true)).toBe(false)
      expect(validator.errors[0]).toMatchObject({ path: 'iso', message: 'Invalid ISO date format.' })
    }
  )

  it('keeps a single conjunctive pattern entry per primitive', () => {
    const dPatterns = DateBox.type.props.get('d').metadata.get('expect.pattern')
    const isoPatterns = DateBox.type.props.get('iso').metadata.get('expect.pattern')
    expect(dPatterns).toHaveLength(1)
    expect(isoPatterns).toHaveLength(1)
  })
})

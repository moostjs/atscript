import { describe, expect, it } from 'vitest'

import { createInsertTextRule } from './utils'

describe('createInsertTextRule', () => {
  it('should return any word and no space if offset is 0', () => {
    const text = ''
    const offset = 0
    const rule = createInsertTextRule(text, offset, 2)

    expect(rule.test('hello')).toBe(true)
    expect(rule.apply('hello')).toBe('hello')
  })

  it('should return any word and no space if after "."', () => {
    const text = 'prefix.'
    const offset = text.length
    const rule = createInsertTextRule(text, offset, 2)

    expect(rule.test('hello')).toBe(true)
    expect(rule.apply('hello')).toBe('hello')
  })

  it('should detect a partial word and no comma scenario', () => {
    const text = 'const userN'
    const offset = text.length
    const rule = createInsertTextRule(text, offset, 2)

    expect(rule.test('userName')).toBe(true)
    expect(rule.test('userX')).toBe(false)

    expect(rule.apply('userName')).toBe('userName')

    expect(rule.apply('userX')).toBe('userX')
  })

  it('should handle dot or other punctuation as empty word', () => {
    const text = 'someObj.'
    const offset = text.length // after the dot
    const rule = createInsertTextRule(text, offset, 2)

    expect(rule.test('newProp')).toBe(true)
    expect(rule.apply('newProp')).toBe('newProp')
  })

  it('should handle a scenario with trailing space after comma (no space needed)', () => {
    const text = 'myArray, items'
    const newOffset = 7
    const rule = createInsertTextRule(text, newOffset, 2)

    expect(rule.test('myArray2')).toBe(true)
    expect(rule.apply('myArray2')).toBe('myArray2')
  })

  it('should handle end-of-line after comma (offset at end of doc)', () => {
    const text = 'myArray,'
    const offset = text.length
    const rule = createInsertTextRule(text, offset, 2)

    expect(rule.test('nextItem')).toBe(true)
    expect(rule.apply('nextItem')).toBe(' nextItem')
  })

  it('should add space when type 1', () => {
    const text = 'myArray,myV'
    const offset = text.length
    const rule = createInsertTextRule(text, offset, 1)

    expect(rule.test('myVar')).toBe(true)
    expect(rule.apply('myVar')).toBe(' myVar')
  })
})

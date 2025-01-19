import { describe, expect, it } from 'vitest'

import { addImport, charBefore, createInsertTextRule } from './utils'

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

describe('charBefore', () => {
  it('returns undefined if offset is 0 (no previous char)', () => {
    const text = 'abc'
    expect(charBefore(text, 0)).toBeUndefined()
  })

  it('returns undefined if offset is out of range', () => {
    const text = 'abc'
    expect(charBefore(text, 4)).toBeUndefined()
  })

  it('skips whitespace by default', () => {
    // 'a'     ' ' ' '
    //  0       1   2
    const text = 'a  '
    // Check char before last index (length=3 -> offset=3 means we look at index=2)
    // Index 2 is ' ', skip (whitespace)
    // Index 1 is ' ', skip (whitespace)
    // Index 0 is 'a', that's returned
    expect(charBefore(text, 3)).toBe('a')
  })

  it('finds the character if it should not be skipped (default)', () => {
    const text = 'abc'
    // offset=3 -> look at text[2] which is 'c', not in skip
    expect(charBefore(text, 3)).toBe('c')
    // offset=2 -> look at text[1] which is 'b'
    expect(charBefore(text, 2)).toBe('b')
  })

  it('skips custom string tokens', () => {
    const text = 'a--'
    // We'll skip '-' chars
    expect(charBefore(text, 3, ['-'])).toBe('a')
  })

  it('skips custom regex tokens', () => {
    const text = 'abc123'
    // We'll skip all digits
    // offset=6 -> text[5] = '3' (skip), text[4] = '2' (skip), text[3] = '1' (skip), text[2] = 'c' (return)
    expect(charBefore(text, 6, [/\d/u])).toBe('c')
  })

  it('returns undefined if all chars are skipped', () => {
    const text = '   '
    // Default skip includes whitespace
    expect(charBefore(text, 3)).toBeUndefined()
  })
})

describe('addImport', () => {
  it('adds a new import when none exists for fromPath', () => {
    const original = `
const foo = 123;
`
    const { range, newText } = addImport(original, 'MyIdentifier', './my-path')
    // Range is a dummy for this example
    expect(range).toEqual({
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    })
    // Check new import
    expect(newText).toMatch(/^import \{ MyIdentifier \} from '\.\/my-path'/u)
    expect(newText).toContain('const foo = 123;')
  })

  it('appends identifier to existing single-line import from same fromPath', () => {
    const original = `import { A, B } from './my-path'
export function test() {}`
    const { newText, range } = addImport(original, 'C', './my-path')
    expect(range).toEqual({
      start: { line: 0, character: 0 },
      end: { line: 0, character: 32 },
    })
    // Should become import { A, B, C } from './my-path'
    expect(newText).toMatchInlineSnapshot(`
      "import { A, B, C } from './my-path'"
    `)
    // Should remain on one line
    expect(newText).not.toMatch(/multiline/u)
  })

  it('does nothing if identifier already exists in import', () => {
    const original = `import { A, B } from './my-path'
    export type T = string`
    const { newText, range } = addImport(original, 'A', './my-path')
    expect(range).toEqual({
      start: { line: 0, character: 0 },
      end: { line: 0, character: 32 },
    })
    // Should remain unchanged
    expect(newText).toEqual("import { A, B } from './my-path'")
  })

  it('alphabetically sorts and switches to multiline if more than 3 imports', () => {
    const original = `import { Z, X, Y } from './my-path'
    export type T = string`
    const { newText } = addImport(original, 'A', './my-path')
    // We now have 4 identifiers -> multiline
    // Sorted: A, X, Y, Z
    expect(newText).toMatchInlineSnapshot(`
      "import {
        A,
        X,
        Y,
        Z
      } from './my-path'"
    `)
  })

  it('adds a new import line if existing import is for a different path', () => {
    const original = `import { A } from './other-path'`
    const { newText } = addImport(original, 'B', './my-path')
    // Expect original import plus new import
    expect(newText).toMatch(/import \{ A \} from '\.\/other-path'/u)
    expect(newText).toMatch(/import \{ B \} from '\.\/my-path'/u)
  })
})

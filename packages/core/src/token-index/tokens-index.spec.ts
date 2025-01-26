import { beforeEach, describe, expect, it } from 'vitest'

import { Token } from '../parser/token'
import { BlocksIndex } from './blocks-index'
import { TokensIndex } from './tokens-index'
import type { TRange } from './types'

class FakeToken extends Token {
  constructor(range: TRange) {
    super({
      text: '{',
      type: 'block',
      getRange: () => range,
    })
  }
}

describe('Blocks index', () => {
  let registry: BlocksIndex

  beforeEach(() => {
    registry = new BlocksIndex()
  })

  it('returns undefined when empty', () => {
    expect(registry.at(0, 0)).toBeUndefined()
  })

  it('finds a single block', () => {
    const block = new FakeToken({
      start: { line: 1, character: 0 },
      end: { line: 2, character: 0 },
    })
    registry.add(block)

    expect(registry.at(1, 0)).toBe(block)
    expect(registry.at(1, 10)).toBe(block)
    expect(registry.at(2, 0)).toBeUndefined() // end is exclusive
  })

  it('finds the most nested block', () => {
    const outer = new FakeToken({
      start: { line: 0, character: 0 },
      end: { line: 10, character: 0 },
    })
    const inner = new FakeToken({
      start: { line: 2, character: 0 },
      end: { line: 4, character: 0 },
    })
    const innermost = new FakeToken({
      start: { line: 3, character: 0 },
      end: { line: 3, character: 5 },
    })

    registry.add(outer)
    registry.add(inner)
    registry.add(innermost)

    // Position that hits all three blocks
    const found = registry.at(3, 2)
    // Expect the most deeply nested one
    expect(found).toBe(innermost)
  })

  it('handles multiple blocks, some non-overlapping', () => {
    const block1 = new FakeToken({
      start: { line: 0, character: 0 },
      end: { line: 5, character: 0 },
    })
    const block2 = new FakeToken({
      start: { line: 5, character: 0 },
      end: { line: 5, character: 1 },
    })
    const block3 = new FakeToken({
      start: { line: 1, character: 1 },
      end: { line: 2, character: 2 },
    })
    registry.add(block1)
    registry.add(block2)
    registry.add(block3)

    expect(registry.at(1, 1)).toBe(block3)
    expect(registry.at(3, 0)).toBe(block1)
    // line 5 char 0 is the start of block2, end of block1 exclusive -> belongs to block2
    expect(registry.at(5, 0)).toBe(block2)
    // outside all
    expect(registry.at(6, 10)).toBeUndefined()
  })
})

describe('Tokens index', () => {
  let index: TokensIndex

  beforeEach(() => {
    index = new TokensIndex()
  })

  it('returns undefined when empty', () => {
    expect(index.at(0, 0)).toBeUndefined()
  })

  it('finds a single token', () => {
    const token = new FakeToken({
      start: { line: 1, character: 0 },
      end: { line: 1, character: 10 },
    })
    index.add(token)

    expect(index.at(1, 0)).toBe(token)
    expect(index.at(1, 5)).toBe(token)
    expect(index.at(1, 10)).toBe(token) // end is inclusive
    expect(index.at(1, 11)).toBeUndefined()
  })

  it('handles tokens on multiple lines', () => {
    const token1 = new FakeToken({
      start: { line: 0, character: 0 },
      end: { line: 0, character: 5 },
    })
    const token2 = new FakeToken({
      start: { line: 1, character: 3 },
      end: { line: 1, character: 8 },
    })

    index.add(token1)
    index.add(token2)

    expect(index.at(0, 0)).toBe(token1)
    expect(index.at(0, 5)).toBe(token1)
    expect(index.at(1, 3)).toBe(token2)
    expect(index.at(1, 8)).toBe(token2) // end is inclusive
    expect(index.at(1, 9)).toBeUndefined()
    expect(index.at(2, 0)).toBeUndefined()
  })

  it('handles multiple tokens on the same line', () => {
    const token1 = new FakeToken({
      start: { line: 1, character: 0 },
      end: { line: 1, character: 5 },
    })
    const token2 = new FakeToken({
      start: { line: 1, character: 6 },
      end: { line: 1, character: 10 },
    })

    index.add(token1)
    index.add(token2)

    expect(index.at(1, 0)).toBe(token1)
    expect(index.at(1, 4)).toBe(token1)
    expect(index.at(1, 6)).toBe(token2)
    expect(index.at(1, 10)).toBe(token2)
    expect(index.at(1, 11)).toBeUndefined()
  })

  it('returns undefined for out-of-range queries', () => {
    const token = new FakeToken({
      start: { line: 3, character: 0 },
      end: { line: 3, character: 5 },
    })

    index.add(token)

    expect(index.at(2, 0)).toBeUndefined()
    expect(index.at(4, 0)).toBeUndefined()
    expect(index.at(3, 6)).toBeUndefined()
  })

  it('returns a token at or before the given position using the before method', () => {
    // We'll add two tokens on different lines:
    // token1 covers line 0, chars [0..5]
    // token2 covers line 1, chars [6..10]

    const token1 = new FakeToken({
      start: { line: 0, character: 0 },
      end: { line: 0, character: 5 },
    })
    const token2 = new FakeToken({
      start: { line: 1, character: 6 },
      end: { line: 1, character: 10 },
    })

    index.add(token1)
    index.add(token2)

    // Exact match on line 0, char 0
    expect(index.before(0, 0)).toBe(token1)

    // Exact match on line 0, char 5
    expect(index.before(0, 5)).toBe(token1)

    // No exact match at line 0, char 6;
    // token1 ends at char 5, so it is the closest before char 6
    expect(index.before(0, 6)).toBe(token1)

    // Exact match on line 1, char 6 (falls within token2)
    expect(index.before(1, 6)).toBe(token2)

    // No exact match at line 1, char 5;
    // token2 starts at char 6, so we check previous lines;
    // token1 is the closest match before line 1, char 5
    expect(index.before(1, 5)).toBe(token1)
  })
})

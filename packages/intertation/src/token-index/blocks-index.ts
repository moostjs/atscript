import type { Token } from '../parser/token'
import type { ITokensIndex, TPosition } from './types'

/**
 * Compares two positions.
 * @param a - The first position.
 * @param b - The second position.
 * @returns -1 if `a` is less than `b`, 1 if `a` is greater than `b`, 0 if they are equal.
 */
function comparePos(a: TPosition, b: TPosition): number {
  if (a.line < b.line) {
    return -1
  }
  if (a.line > b.line) {
    return 1
  }
  if (a.character < b.character) {
    return -1
  }
  if (a.character > b.character) {
    return 1
  }
  return 0
}

/**
 * Checks if a given position (line, character) is contained within a token's range.
 * @param token - The token to check.
 * @param line - The line number of the position.
 * @param character - The character number of the position.
 * @returns `true` if the position is within the token's range, `false` otherwise.
 */
function contains(token: Token, line: number, character: number): boolean {
  const startCmp = comparePos(token.range.start, { line, character })
  const endCmp = comparePos(token.range.end, { line, character })
  return startCmp <= 0 && endCmp > 0
}

/**
 * Determines if token `a` is more nested than token `b`.
 * @param a - The first token.
 * @param b - The second token.
 * @returns `true` if `a` is more nested than `b`, `false` otherwise.
 */
function moreNested(a: Token, b: Token): boolean {
  const startCmp = comparePos(a.range.start, b.range.start)
  const endCmp = comparePos(a.range.end, b.range.end)
  return startCmp >= 0 && endCmp <= 0
}

/**
 * Implementation of `IBlocksIndex` that manages a collection of tokens and provides efficient methods to add tokens
 * and query the most nested token at a specific position.
 */
export class BlocksIndex implements ITokensIndex {
  private readonly blocks: Token[] = []

  /**
   * Adds a new token to the index. The token collection is maintained in sorted order by start position.
   * @param block - The token to add.
   */
  add(block: Token): void {
    let left = 0
    let right = this.blocks.length
    while (left < right) {
      const mid = (left + right) >> 1
      if (comparePos(this.blocks[mid].range.start, block.range.start) < 0) {
        left = mid + 1
      } else {
        right = mid
      }
    }
    this.blocks.splice(left, 0, block)
  }

  /**
   * Finds the most nested token at a specific position.
   * @param line - The line number of the position.
   * @param character - The character number of the position.
   * @returns The most nested token at the given position, or `undefined` if no token is found.
   */
  at(line: number, character: number): Token | undefined {
    const candidates: Token[] = []
    for (const block of this.blocks) {
      if (comparePos(block.range.start, { line, character }) > 0) {
        break
      }
      if (contains(block, line, character)) {
        candidates.push(block)
      }
    }

    if (candidates.length === 0) {
      return undefined
    }

    let result = candidates[0]
    for (let i = 1; i < candidates.length; i++) {
      if (moreNested(candidates[i], result)) {
        result = candidates[i]
      }
    }

    return result
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  before(line: number, character: number): Token | undefined {
    throw new Error('Not implemented')
  }
}

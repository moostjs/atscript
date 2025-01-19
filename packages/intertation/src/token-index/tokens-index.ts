/* eslint-disable sonarjs/cognitive-complexity */
/* eslint-disable complexity */
import type { Token } from '../parser/token'
import type { ITokensIndex } from './types'

/**
 * A class that implements a flat index for tokens, allowing quick access to tokens
 * at a specific line and character. Tokens in this index are not nested.
 */
export class TokensIndex implements ITokensIndex {
  /**
   * An array where each index corresponds to a line number, storing a set of tokens
   * associated with that line.
   */
  tokensMap = [] as Array<Set<Token> | undefined>

  /**
   * Adds a token to the index. The token is stored based on its starting line.
   * @param token - The token to add to the index.
   */
  add(token: Token): void {
    const line = token.range.start.line
    // Initialize the line set if it doesn't exist
    this.tokensMap[line] = this.tokensMap[line] ?? new Set()
    this.tokensMap[line].add(token)
  }

  /**
   * Retrieves a token at a specific line and character, if one exists.
   * @param line - The line number to search in.
   * @param character - The character position within the line to search for.
   * @returns The token at the specified line and character, or `undefined` if none exists.
   */
  at(line: number, character: number): Token | undefined {
    const tokens = this.tokensMap[line]
    if (!tokens) {
      return undefined
    }
    // Find a token that contains the character position
    return Array.from(tokens).find(
      t => t.range.start.character <= character && t.range.end.character >= character
    )
  }

  /**
   * Retrieves either the token at the specified (line, character), or if none exists,
   * the closest token that ends on or before that position. This method checks:
   *   1. If a token spans (line, character), return it immediately.
   *   2. Otherwise, look within the same line for tokens that end before `character`.
   *   3. If still none found, move upwards to previous lines and return the token that ends last.
   * @param line - The line number to search in.
   * @param character - The character position within the line to search for.
   * @returns The found token, or `undefined` if no suitable token is found.
   */
  before(line: number, character: number): Token | undefined {
    // 1. Check if there's a token exactly at (line, character).
    const current = this.at(line, character)
    if (current) {
      return current
    }

    // 2. Within the same line, find the token that ends closest to (but not after) `character`.
    const tokensAtLine = this.tokensMap[line]
    if (tokensAtLine) {
      let candidate: Token | undefined
      for (const t of tokensAtLine) {
        if (
          t.range.end.character < character &&
          (!candidate || t.range.end.character > candidate.range.end.character)
        ) {
          candidate = t
        }
      }
      if (candidate) {
        return candidate
      }
    }

    // 3. Move upwards through previous lines to find the last token on the nearest previous line.
    //    We pick the token that ends the latest on that line.
    for (let l = line - 1; l >= 0; l--) {
      const tokens = this.tokensMap[l]
      if (tokens && tokens.size > 0) {
        let candidate: Token | undefined
        for (const t of tokens) {
          if (!candidate || t.range.end.character > candidate.range.end.character) {
            candidate = t
          }
        }
        if (candidate) {
          return candidate
        }
      }
    }

    // No tokens found at or before the requested position.
    return undefined
  }
}

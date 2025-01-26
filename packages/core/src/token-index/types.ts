import type { Token } from '../parser/token'
import type { TLexicalToken } from '../tokenizer/types'

/**
 * Interface for a token index system that allows adding tokens and querying the most nested token at a specific position.
 */
export interface ITokensIndex {
  /**
   * Adds a new token to the index.
   * @param token - The token to add.
   */
  add: (token: Token) => void

  /**
   * Finds token at a specific position.
   * @param line - The line number of the position.
   * @param character - The character number of the position.
   * @returns The token at the given position, or `undefined` if no token is found.
   */
  at: (line: number, character: number) => Token | undefined

  /**
   * Finds token before specific position.
   * @param line - The line number of the position.
   * @param character - The character number of the position.
   * @returns The token at the given position, or `undefined` if no token is found.
   */
  before: (line: number, character: number) => Token | undefined
}

export type TRange = ReturnType<TLexicalToken['getRange']>
export type TPosition = TRange['start']

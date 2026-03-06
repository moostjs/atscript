import type { ParsedNode } from '@prostojs/parser'
import { Node } from '@prostojs/parser'

import type { TLexicalToken } from '../types'
import { AIdentifierToken } from './a-identifier.token'
import { BlockToken } from './block.token'
import { commentNodes } from './comment.token'
import { IdentifierToken } from './identifier.token'
import { NumberToken } from './number.token'
import { PunctuationToken } from './punctuation.token'
import { QueryToken } from './query.token'
import { RegExpToken } from './regexp.token'
import { TextToken } from './text.node'

export const tokens = {
  aIdentifier: AIdentifierToken,
  punctuation: PunctuationToken,
  comments: commentNodes.all,
  inlineComment: commentNodes.inline,
  blockComment: commentNodes.block,
  block: BlockToken,
  identifier: IdentifierToken,
  number: NumberToken,
  text: TextToken,
  regexp: RegExpToken,
  query: QueryToken,
  root: undefined as unknown as Node<TLexicalToken>,
}

export const root = new Node<TLexicalToken>({
  name: 'root',
  skip: /\s/u,
  eofClose: true,
  recognizes: [
    ...commentNodes.all,
    BlockToken,
    QueryToken,
    AIdentifierToken,
    IdentifierToken,
    TextToken,
    NumberToken,
    PunctuationToken,
  ],
})

tokens.root = root

BlockToken.recognize(
  RegExpToken,
  ...commentNodes.all,
  BlockToken,
  QueryToken,
  AIdentifierToken,
  IdentifierToken,
  TextToken,
  NumberToken,
  PunctuationToken,
)

QueryToken.recognize(
  RegExpToken,
  BlockToken,
  IdentifierToken,
  TextToken,
  NumberToken,
  PunctuationToken,
)

/**
 * Recursively extract TLexicalToken[] from a ParsedNode tree.
 * Replaces the v0.5 mapContent('children', callback) + global loop.
 *
 * v0.6 Position has { offset, line, column }.
 * line is 1-based, column is 1-based.
 * VSCode expects 0-based line, 0-based character.
 */
export function extractTokens(node: ParsedNode): TLexicalToken[] {
  return node.content.map(item => {
    if (typeof item === 'string') {
      return {
        type: 'unknown',
        text: item,
      } as TLexicalToken
    }
    const data = item.data as TLexicalToken
    data.getRange = () => ({
      start: {
        line: item.start.line - 1,
        character: item.start.column - 1 + (data.startOffset ?? 0),
      },
      end: {
        line: item.end.line - 1,
        character: item.end.column - 1 + (data.endOffset ?? 0),
      },
    })
    data.children = extractTokens(item)
    return data
  })
}

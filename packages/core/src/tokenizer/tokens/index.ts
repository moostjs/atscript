import type { ParsedNode, Position } from '@prostojs/parser'
import { Node } from '@prostojs/parser'

import type { TLexicalToken } from '../types'
import { AIdentifierToken } from './a-identifier.token'
import { BlockToken } from './block.token'
import { commentNodes } from './comment.token'
import { IdentifierToken } from './identifier.token'
import { NumberToken } from './number.token'
import { PunctuationToken } from './punctuation.token'
import { QueryBlockToken } from './query-block.token'
import { QueryOperatorToken } from './query-operator.token'
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
  queryBlock: QueryBlockToken,
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
  PunctuationToken
)

// QueryBlockToken goes before BlockToken so that "(" is claimed by the
// query-aware block, while "[" and "{" still fall through to the generic one.
QueryToken.recognize(
  RegExpToken,
  QueryOperatorToken,
  QueryBlockToken,
  BlockToken,
  IdentifierToken,
  TextToken,
  NumberToken,
  PunctuationToken
)

// Nested parentheses recurse through QueryBlockToken itself.
// Comments are not recognized inside queries (mirrors QueryToken).
QueryBlockToken.recognize(
  RegExpToken,
  QueryOperatorToken,
  QueryBlockToken,
  IdentifierToken,
  TextToken,
  NumberToken,
  PunctuationToken
)

/** 1-based parser position → 0-based VSCode position, shifted by `offset` characters. */
function toPos(p: Position, offset = 0) {
  return { line: p.line - 1, character: p.column - 1 + offset }
}

/**
 * Recursively extract TLexicalToken[] from a ParsedNode tree.
 * Replaces the v0.5 mapContent('children', callback) + global loop.
 *
 * v0.6 Position has { offset, line, column }.
 * line is 1-based, column is 1-based.
 * VSCode expects 0-based line, 0-based character.
 */
export function extractTokens(node: ParsedNode): TLexicalToken[] {
  const content = node.content
  return content.map((item, index) => {
    if (typeof item === 'string') {
      // Unrecognized text is stored by the parser as a plain string with no
      // position of its own. Derive a range from the surrounding siblings
      // (falling back to the parent's own boundaries) so that diagnostics
      // can point at it instead of at line 0.
      const prev = content[index - 1]
      const next = content[index + 1]
      const start = typeof prev === 'object' ? prev.end : node.start
      const end = typeof next === 'object' ? next.start : node.end
      return {
        type: 'unknown',
        text: item,
        getRange: () => ({ start: toPos(start), end: toPos(end) }),
      } as TLexicalToken
    }
    const data = item.data as TLexicalToken
    data.getRange = () => ({
      start: toPos(item.start, data.startOffset),
      end: toPos(item.end, data.endOffset),
    })
    data.children = extractTokens(item)
    return data
  })
}

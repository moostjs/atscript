import type { ParsedNode, Position } from '@prostojs/parser'
import { Node } from '@prostojs/parser'

import type { TLexicalToken } from '../types'
import { AIdentifierToken } from './a-identifier.token'
import { BlockToken } from './block.token'
import { commentNodes } from './comment.token'
import { IdentifierToken } from './identifier.token'
import { NumberToken } from './number.token'
import { PunctuationToken } from './punctuation.token'
import { QueryArithmeticToken } from './query-arith.token'
import { QueryBlockToken } from './query-block.token'
import { QueryOperatorToken } from './query-operator.token'
import { QueryToken } from './query.token'
import { QueryRegExpToken, RegExpToken } from './regexp.token'
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
//
// Inside queries a regexp literal is only recognized after `matches`, and the
// arithmetic operators (`*`, `-`) come after `NumberToken` so an adjacent sign
// still lexes as a signed number (`-5`).
QueryToken.recognize(
  QueryRegExpToken,
  QueryOperatorToken,
  QueryBlockToken,
  BlockToken,
  IdentifierToken,
  TextToken,
  NumberToken,
  QueryArithmeticToken,
  PunctuationToken
)

// Nested parentheses recurse through QueryBlockToken itself.
// Comments are not recognized inside queries (mirrors QueryToken).
QueryBlockToken.recognize(
  QueryRegExpToken,
  QueryOperatorToken,
  QueryBlockToken,
  IdentifierToken,
  TextToken,
  NumberToken,
  QueryArithmeticToken,
  PunctuationToken
)

/** 1-based parser position → 0-based VSCode position, shifted by `offset` characters. */
function toPos(p: Position, offset = 0) {
  return { line: p.line - 1, character: p.column - 1 + offset }
}

/**
 * A comment's source span as `[start, end)` offsets, delimiters included. For a comment
 * that runs to the end of its line or of the input (`// …`, unclosed `/* …`) `end` is
 * one past that point, so a cursor right at the end still counts as inside.
 */
export interface TCommentSpan {
  start: number
  end: number
}

/**
 * Recursively extract TLexicalToken[] from a ParsedNode tree.
 * Replaces the v0.5 mapContent('children', callback) + global loop.
 *
 * Comments are dropped here, so the parser never sees them; their spans go to
 * `comments` (in source order) when given. A block comment spanning a line break
 * becomes a synthetic `'\n'` punctuation token, so it ends a line like the break
 * itself would.
 *
 * v0.6 Position has { offset, line, column }.
 * line is 1-based, column is 1-based.
 * VSCode expects 0-based line, 0-based character.
 */
export function extractTokens(node: ParsedNode, comments?: TCommentSpan[]): TLexicalToken[] {
  const content = node.content
  const tokens: TLexicalToken[] = []
  content.forEach((item, index) => {
    if (typeof item === 'string') {
      // Unrecognized text is stored by the parser as a plain string with no
      // position of its own. Derive a range from the surrounding siblings
      // (falling back to the parent's own boundaries) so that diagnostics
      // can point at it instead of at line 0.
      const prev = content[index - 1]
      const next = content[index + 1]
      const start = typeof prev === 'object' ? prev.end : node.start
      const end = typeof next === 'object' ? next.start : node.end
      tokens.push({
        type: 'unknown',
        text: item,
        getRange: () => ({ start: toPos(start), end: toPos(end) }),
      } as TLexicalToken)
      return
    }
    const data = item.data as TLexicalToken
    data.getRange = () => ({
      start: toPos(item.start, data.startOffset),
      end: toPos(item.end, data.endOffset),
    })
    if (data.type === 'comment') {
      // a closed block comment is its text plus `/*` and `*/`
      const closed =
        item.node === commentNodes.block &&
        item.end.offset - item.start.offset === data.text.length + 4
      comments?.push({ start: item.start.offset, end: item.end.offset + (closed ? 0 : 1) })
      if (/[\n\r]/u.test(data.text)) {
        tokens.push({ type: 'punctuation', text: '\n', getRange: data.getRange })
      }
      return
    }
    data.children = extractTokens(item, comments)
    tokens.push(data)
  })
  return tokens
}

import { Node } from '@prostojs/parser'

import type { TLexicalToken } from '../types'

/**
 * Builds a block node that opens on any key of `pairs` and closes on the
 * matching value; the opening character is kept as the token's `text`.
 */
export function createBlockToken(pairs: Record<string, string>): Node<TLexicalToken> {
  const opening = Object.keys(pairs)
    .map(c => c.replace(/[\\^$.*+?()[\]{}|/-]/gu, '\\$&'))
    .join('')
  return new Node<TLexicalToken>({
    name: 'block',
    start: { token: new RegExp(`(?<text>[${opening}])`, 'u'), omit: true },
    end: {
      token: ctx => pairs[ctx.node.data.text] || '',
      omit: true,
    },
    skip: /\s/u,
    eofClose: true,
    data: { type: 'block' as const, text: '' } as TLexicalToken,
  })
}

/**
 * Block node
 */
export const BlockToken = createBlockToken({ '{': '}', '(': ')', '[': ']' })

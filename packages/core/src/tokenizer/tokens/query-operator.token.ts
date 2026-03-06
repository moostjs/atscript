import { Node } from '@prostojs/parser'

import type { TLexicalToken } from '../types'

/**
 * Query operator token — matches symbolic comparison operators
 * inside backtick-delimited query expressions.
 *
 * Multi-character operators (!=, >=, <=) are matched as single tokens.
 * Only recognized inside QueryToken — not in root or BlockToken.
 */
export const QueryOperatorToken = new Node<TLexicalToken>({
  name: 'punctuation',
  start: { token: /(?<text>!=|>=|<=|[=><])/u, omit: true },
  end: { token: '', omit: true },
  eofClose: true,
  data: { type: 'punctuation' as const, text: '' } as TLexicalToken,
})

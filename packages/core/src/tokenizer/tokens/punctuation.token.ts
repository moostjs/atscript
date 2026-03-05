import { Node } from '@prostojs/parser'

import type { TLexicalToken } from '../types'

export type TPunctuation = '\n' | '&' | '+' | ',' | '\\' | '.' | '/' | ':' | '=' | '?' | '|' | ';'

/**
 * Punctuation node
 */
export const PunctuationToken = new Node<TLexicalToken & { text: TPunctuation }>({
  name: 'punctuation',
  start: { token: /(?<text>[\n!&+,./:;=?|])/u, omit: true },
  end: { token: '', omit: true },
  eofClose: true,
  data: { type: 'punctuation' as const, text: '' as TPunctuation } as TLexicalToken & {
    text: TPunctuation
  },
})

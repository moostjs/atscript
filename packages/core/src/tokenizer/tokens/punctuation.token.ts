import { BasicNode } from '@prostojs/parser'

import type { TLexicalToken } from '../types'

export type TPunctuation = '\n' | '&' | '+' | ',' | '\\' | '.' | '/' | ':' | '=' | '?' | '|' | ';'

/**
 * Punctuation node
 */
export const PunctuationToken = new BasicNode<TLexicalToken & { text: TPunctuation }>({
  tokens: [/(?<text>[\n!&+,./:;=?|])/u, ''],
  tokenOE: 'omit-omit',
  icon: '...',
}).onMatch(context => {
  context.customData.type = 'punctuation'
})

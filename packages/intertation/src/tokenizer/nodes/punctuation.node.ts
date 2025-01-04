import { BasicNode } from '@prostojs/parser'

import type { TNodeData } from '../types'

export type TPunctuation =
  | '\n'
  | '&'
  | '+'
  | ','
  | '\\'
  | '-'
  | '.'
  | '/'
  | ':'
  | '='
  | '?'
  | '|'
  | ';'

/**
 * Punctuation node
 */
export const PunctuationNode = new BasicNode<TNodeData & { text: TPunctuation }>({
  tokens: [/(?<text>[\n&+,\-./:;=?|])/u, ''],
  tokenOE: 'omit-omit',
  icon: '...',
}).onMatch(context => {
  context.customData.node = 'punctuation'
})

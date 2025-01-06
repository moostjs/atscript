import { BasicNode } from '@prostojs/parser'

import type { TLexicalToken } from '../types'

/**
 * Text node single or doublequoted
 */
export const TextToken = new BasicNode<TLexicalToken & { quote: string }>({
  icon: 'T',
  tokens: [/(?<quote>["'])/u, context => context.getCustomData().quote || ''],
  // saying that we want to ignore backslashed end token
  backSlash: '-ignore',
  tokenOE: 'omit-omit',
})
  .mapContent('text', 'join-clear')
  .onMatch(context => {
    context.customData.type = 'text'
  })

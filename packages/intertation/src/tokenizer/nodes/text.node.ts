import { BasicNode } from '@prostojs/parser'

import type { TNodeData } from '../types'

/**
 * Text node single or doublequoted
 */
export const TextNode = new BasicNode<TNodeData & { quote: string }>({
  icon: 'T',
  tokens: [/(?<quote>["'])/u, context => context.getCustomData().quote || ''],
  // saying that we want to ignore backslashed end token
  backSlash: '-ignore',
  tokenOE: 'omit-omit',
})
  .mapContent('text', 'join-clear')
  .onMatch(context => {
    context.customData.node = 'text'
  })

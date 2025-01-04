import { BasicNode } from '@prostojs/parser'

import type { TNodeData } from '../types'

/**
 * Number node
 */
export const NumberNode = new BasicNode<TNodeData>({
  icon: 'N',
  tokens: [/\d[\p{ID_Continue}$]*/u, /[^\p{ID_Continue}$]/u],
  tokenOE: 'consume-eject',
})
  .mapContent('text', 'join-clear')
  .onMatch(context => {
    context.customData.node = 'number'
  })

import { BasicNode } from '@prostojs/parser'

import type { TNodeData } from '../types'

/**
 * Identifier node
 */
export const IdentifierNode = new BasicNode<TNodeData>({
  icon: 'I',
  tokens: [/[\p{ID_Start}$_][\p{ID_Continue}$]*/u, /[^\p{ID_Continue}$]/u],
  tokenOE: 'consume-eject',
})
  .mapContent('text', 'join-clear')
  .onMatch(context => {
    context.customData.node = 'identifier'
  })

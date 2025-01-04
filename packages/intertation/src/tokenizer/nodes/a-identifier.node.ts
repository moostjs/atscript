import { BasicNode } from '@prostojs/parser'

import type { TNodeData } from '../types'

/**
 * Annotation (@) Identifier node
 */
export const AIdentifierNode = new BasicNode<TNodeData>({
  icon: '@',
  tokens: [/@[\p{ID_Start}$_][\p{ID_Continue}$.]*/u, /[^\p{ID_Continue}$.]/u],
  tokenOE: '-eject',
})
  .mapContent('text', 'join-clear')
  .onMatch(context => {
    context.customData.node = 'annotation'
  })

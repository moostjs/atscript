import { BasicNode } from '@prostojs/parser'

import type { TLexicalToken } from '../types'

/**
 * Annotation (@) Identifier node
 */
export const AIdentifierToken = new BasicNode<TLexicalToken>({
  icon: '@',
  tokens: [/@[\p{ID_Continue}$.]*/u, /[^\p{ID_Continue}$.]/u],
  tokenOE: '-eject',
})
  .mapContent('text', 'join-clear')
  .onMatch(context => {
    context.customData.type = 'annotation'
  })

import { BasicNode } from '@prostojs/parser'

import type { TLexicalToken } from '../types'

/**
 * Identifier node
 */
export const IdentifierToken = new BasicNode<TLexicalToken>({
  icon: 'I',
  tokens: [/[\p{ID_Start}$_][\p{ID_Continue}$]*/u, /[^\p{ID_Continue}$]/u],
  tokenOE: 'consume-eject',
})
  .mapContent('text', 'join-clear')
  .onMatch(context => {
    context.customData.type = 'identifier'
  })

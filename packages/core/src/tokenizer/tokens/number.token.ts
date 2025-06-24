import { BasicNode } from '@prostojs/parser'

import type { TLexicalToken } from '../types'

/**
 * Number node
 */
export const NumberToken = new BasicNode<TLexicalToken>({
  icon: 'N',
  // tokens: [/\d[\p{ID_Continue}$]*/u, /[^\p{ID_Continue}$]/u],
  tokens: [/[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/u, /[^\d]/u],
  tokenOE: '-eject',
})
  .mapContent('text', 'join-clear')
  .onMatch(context => {
    context.customData.type = 'number'
  })

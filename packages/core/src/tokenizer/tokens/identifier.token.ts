import { Node } from '@prostojs/parser'

import type { TLexicalToken } from '../types'

/**
 * Identifier node
 */
export const IdentifierToken = new Node<TLexicalToken>({
  name: 'identifier',
  start: { token: /[\p{ID_Start}$_][\p{ID_Continue}$]*/u },
  end: { token: /[^\p{ID_Continue}$]/u, eject: true },
  eofClose: true,
  data: { type: 'identifier' as const, text: '' } as TLexicalToken,
  mapContent: 'text',
})

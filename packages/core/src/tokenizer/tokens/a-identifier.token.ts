import { Node } from '@prostojs/parser'

import type { TLexicalToken } from '../types'

/**
 * Annotation (@) Identifier node
 */
export const AIdentifierToken = new Node<TLexicalToken>({
  name: 'annotation',
  start: { token: /@[\p{ID_Continue}$.]*/u },
  end: { token: /[^\p{ID_Continue}$.]/u, eject: true },
  eofClose: true,
  data: { type: 'annotation' as const, text: '' } as TLexicalToken,
  mapContent: 'text',
})

import { Node } from '@prostojs/parser'

import type { TLexicalToken } from '../types'

/**
 * Number node
 */
export const NumberToken = new Node<TLexicalToken>({
  name: 'number',
  start: { token: /[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/u },
  end: { token: /[^\d]/u, eject: true },
  eofClose: true,
  data: { type: 'number' as const, text: '' } as TLexicalToken,
  mapContent: 'text',
})

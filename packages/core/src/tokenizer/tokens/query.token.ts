import { Node } from '@prostojs/parser'

import type { TLexicalToken } from '../types'

/**
 * Query node — backtick-delimited filter expressions
 * Content inside backticks is tokenized into children.
 */
export const QueryToken = new Node<TLexicalToken>({
  name: 'query',
  start: { token: /`/u, omit: true },
  end: { token: /`/u, omit: true },
  skip: /\s/u,
  eofClose: true,
  data: { type: 'query' as const, text: '' } as TLexicalToken,
})

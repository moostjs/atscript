import { Node } from '@prostojs/parser'

import type { TLexicalToken } from '../types'

const inline = new Node<TLexicalToken>({
  name: 'inline-comment',
  start: { token: '//', omit: true },
  end: { token: /$/mu, omit: true },
  eofClose: true,
  data: { type: 'comment' as const, text: '' } as TLexicalToken,
  mapContent: 'text',
})

const block = new Node<TLexicalToken>({
  name: 'block-comment',
  start: { token: '/*', omit: true },
  end: { token: '*/', omit: true },
  eofClose: true,
  data: { type: 'comment' as const, text: '' } as TLexicalToken,
  mapContent: 'text',
})

/**
 * Block and inline comments
 */
export const commentNodes = {
  inline,
  block,
  all: [inline, block],
}

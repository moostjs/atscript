import { Node } from '@prostojs/parser'

import type { TLexicalToken } from '../types'

const pairs = {
  '{': '}',
  '(': ')',
  '[': ']',
}

/**
 * Block node
 */
export const BlockToken = new Node<TLexicalToken>({
  name: 'block',
  start: { token: /(?<text>[([{])/u, omit: true },
  end: {
    token: ctx => pairs[ctx.node.data.text as '{'] || '',
    omit: true,
  },
  skip: /\s/u,
  eofClose: true,
  data: { type: 'block' as const, text: '' } as TLexicalToken,
})

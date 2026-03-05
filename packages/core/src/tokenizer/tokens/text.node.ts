import { Node } from '@prostojs/parser'

import type { TLexicalToken } from '../types'

/**
 * Text node single or doublequoted
 */
export const TextToken = new Node<TLexicalToken & { quote: string; end: string }>({
  name: 'text',
  start: { token: /(?<quote>["'])/u, omit: true },
  end: {
    token: ctx => new RegExp(`(?<end>${ctx.node.data.quote || ''}|\\n)`),
    omit: true,
    backslash: true,
  },
  eofClose: true,
  data: { type: 'text' as const, quote: '', end: '', text: '' } as TLexicalToken & {
    quote: string
    end: string
  },
  mapContent: 'text',
}).onClose(node => {
  // only flagging multiline if the string ended with new line
  node.data.multiline = node.data.end === '\n'
})

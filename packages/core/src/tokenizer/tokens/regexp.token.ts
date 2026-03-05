import { Node } from '@prostojs/parser'

import type { TLexicalToken } from '../types'

const REGEXP_LITERAL_RE = /\/(?![/*])(?:\\.|\[.*?]|[^/\\\n\r[])*\/[dgimsuy]*/

/**
 * RegExp literal – `/pattern/flags`
 *   • Starts with `/` but *not* `//` or `/*`
 *   • Ends with `/` followed by zero-or-more valid flags
 */
export const RegExpToken = new Node<TLexicalToken & { flags?: string }>({
  name: 'regexp',
  start: { token: REGEXP_LITERAL_RE, omit: true },
  end: { token: '', omit: true },
  eofClose: true,
  data: { type: 'regexp' as const, text: '' } as TLexicalToken & { flags?: string },
}).onOpen((node, match) => {
  node.data.text = match?.text ?? ''
})

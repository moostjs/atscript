import { BasicNode } from '@prostojs/parser'

import type { TLexicalToken } from '../types'

const REGEXP_LITERAL_RE = /\/(?![/*])(?:\\.|\[.*?]|[^/\\\n\r[])*\/[dgimsuy]*/

/**
 * RegExp literal – `/pattern/flags`
 *   • Starts with `/` but *not* `//` or `/*`
 *   • Ends with `/` followed by zero-or-more valid flags
 */
export const RegExpToken = new BasicNode<TLexicalToken & { flags?: string }>({
  label: 'regexp',
  icon: 'RG',
  tokens: [REGEXP_LITERAL_RE, ''],
  tokenOE: 'omit-omit',
}).onMatch(ctx => {
  ctx.customData.type = 'regexp'
  ctx.customData.text = ctx.matched[0]
})

import { Node } from '@prostojs/parser'

import type { TLexicalToken } from '../types'

/**
 * Lookbehind: the end token is preceded by an EVEN run of backslashes (zero included).
 * An odd run means the last backslash escapes the quote (or newline), so the string
 * goes on; `"a\\"` ends at its last quote. The parser's own `backslash` option only
 * checks the single preceding char, so it can't tell `\"` from `\\"`. The lookbehind
 * can see the source before the search position, which always holds the opening quote.
 */
const EVEN_BACKSLASHES = '(?<=(?:^|[^\\\\])(?:\\\\\\\\)*)'

const END_RE: Record<string, RegExp> = {
  '"': new RegExp(`${EVEN_BACKSLASHES}(?<end>"|\\n)`, 'u'),
  "'": new RegExp(`${EVEN_BACKSLASHES}(?<end>'|\\n)`, 'u'),
}

/**
 * Text node single or doublequoted.
 * Content is RAW: escapes are not decoded (`\"` stays `\"`, `\\` stays `\\`).
 */
export const TextToken = new Node<TLexicalToken & { quote: string; end: string }>({
  name: 'text',
  start: { token: /(?<quote>["'])/u, omit: true },
  end: {
    token: ctx => END_RE[ctx.node.data.quote] ?? END_RE['"'],
    omit: true,
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

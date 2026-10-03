import { Node } from '@prostojs/parser'

import type { TLexicalToken } from '../types'

/**
 * Arithmetic operator token — `*` and `-` inside backtick expressions
 * (`+` and `/` are already generic punctuation).
 *
 * Registered after `NumberToken`, so a sign written adjacent to a number
 * (`-5`, `+1`) still lexes as a signed number; the expression parser splits a
 * signed number found in binary-operator position (`a -5` → `a - 5`).
 * Only recognized inside queries — not in root or generic blocks.
 */
export const QueryArithmeticToken = new Node<TLexicalToken>({
  name: 'punctuation',
  start: { token: /(?<text>[*-])/u, omit: true },
  end: { token: '', omit: true },
  eofClose: true,
  data: { type: 'punctuation' as const, text: '' } as TLexicalToken,
})

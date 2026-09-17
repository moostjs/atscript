import { Node } from '@prostojs/parser'

import type { TLexicalToken } from '../types'

/**
 * Query block node — parenthesized sub-expressions inside backtick queries.
 *
 * Produces exactly the same token shape as `BlockToken` (`type: 'block'`,
 * `text: '('`) so every consumer keeps working, but it recognizes
 * `QueryOperatorToken` inside, which makes `!=`, `>=`, `<=`, `>`, `<`
 * work within parentheses (the generic block only knows `PunctuationToken`,
 * whose charset has no `<` / `>`).
 *
 * Only registered inside `QueryToken` (and itself, for nested parens) —
 * the generic `BlockToken` is left untouched so tokenization of `(`/`[`/`{`
 * outside queries does not change.
 */
export const QueryBlockToken = new Node<TLexicalToken>({
  name: 'block',
  start: { token: /(?<text>\()/u, omit: true },
  end: { token: ')', omit: true },
  skip: /\s/u,
  eofClose: true,
  data: { type: 'block' as const, text: '' } as TLexicalToken,
})

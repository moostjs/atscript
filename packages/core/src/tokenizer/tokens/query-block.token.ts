import { createBlockToken } from './block.token'

/**
 * Query block node — parenthesized sub-expressions inside backtick queries.
 *
 * Same definition as `BlockToken` narrowed to `(`, so it produces the same
 * token shape (`type: 'block'`, `text: '('`) and every consumer keeps working,
 * but it recognizes `QueryOperatorToken` inside (see `tokens/index.ts`), which
 * makes `!=`, `>=`, `<=`, `>`, `<` work within parentheses — the generic block
 * only knows `PunctuationToken`, whose charset has no `<` / `>`.
 *
 * Only registered inside `QueryToken` (and itself, for nested parens) —
 * the generic `BlockToken` is left untouched so tokenization of `(`/`[`/`{`
 * outside queries does not change.
 */
export const QueryBlockToken = createBlockToken({ '(': ')' })

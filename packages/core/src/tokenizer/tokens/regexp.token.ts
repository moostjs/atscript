import { Node } from '@prostojs/parser'

import type { TLexicalToken } from '../types'

const REGEXP_LITERAL_RE = /\/(?![/*])(?:\\.|\[.*?]|[^/\\\n\r[])*\/[dgimsuy]*/

/**
 * Regexp literal inside a backtick expression: only directly after the
 * `matches` keyword (the one operator that takes a regexp), so `/` elsewhere
 * stays the division operator (`a / b / c` is not the regexp `/ b /`).
 * The lookbehind works because the parser scans the full source from the
 * current position.
 */
const QUERY_REGEXP_LITERAL_RE = new RegExp(`(?<=\\bmatches\\s*)${REGEXP_LITERAL_RE.source}`)

/** A regexp-literal token node starting at `start`. */
function regExpNode(start: RegExp) {
  return new Node<TLexicalToken & { flags?: string }>({
    name: 'regexp',
    start: { token: start, omit: true },
    end: { token: '', omit: true },
    eofClose: true,
    data: { type: 'regexp' as const, text: '' } as TLexicalToken & { flags?: string },
  }).onOpen((node, match) => {
    node.data.text = match?.text ?? ''
  })
}

/**
 * RegExp literal – `/pattern/flags`
 *   • Starts with `/` but *not* `//` or `/*`
 *   • Ends with `/` followed by zero-or-more valid flags
 */
export const RegExpToken = regExpNode(REGEXP_LITERAL_RE)

/** RegExp literal inside backtick expressions — recognized only after `matches`. */
export const QueryRegExpToken = regExpNode(QUERY_REGEXP_LITERAL_RE)

import { printTree } from '@prostojs/parser'

import type { TCommentSpan } from './tokens'
import { extractTokens, root } from './tokens'

export type { TCommentSpan } from './tokens'

/** Lexes `source`; comment spans are collected into `comments` when given. */
export function tokenize(source: string, debug = false, comments?: TCommentSpan[]) {
  const result = root.parse(source)
  if (debug) {
    console.log(printTree(result))
  }
  return extractTokens(result, comments)
}

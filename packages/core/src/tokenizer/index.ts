import { printTree } from '@prostojs/parser'

import { extractTokens, root } from './tokens'

export function tokenize(source: string, debug = false) {
  const result = root.parse(source)
  if (debug) {
    console.log(printTree(result))
  }
  return extractTokens(result)
}

import { BasicNode } from '@prostojs/parser'

import type { TLexicalToken } from '../types'

/**
 * Text node single or doublequoted
 */
export const TextToken = new BasicNode<TLexicalToken & { quote: string; end: string }>({
  icon: 'T',
  tokens: [
    /(?<quote>["'])/u,
    context => new RegExp(`(?<end>${context.getCustomData().quote || ''}|\\n)`),
  ],
  // saying that we want to ignore backslashed end token
  backSlash: '-ignore',
  tokenOE: 'omit-omit',
})
  .mapContent('text', 'join-clear')
  .onMatch(context => {
    context.customData.type = 'text'
  })
  .onPop(context => {
    // only flagging multiline if the string ended with new line
    context.customData.multiline = context.customData.end === '\n'
  })

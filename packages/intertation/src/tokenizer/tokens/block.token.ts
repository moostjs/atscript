import { BasicNode } from '@prostojs/parser'

import type { TLexicalToken } from '../types'

const pairs = {
  '{': '}',
  '(': ')',
  '[': ']',
}

/**
 * Block node
 */
export const BlockToken = new BasicNode<TLexicalToken>({
  label: 'block',
  icon: '→',
  tokens: [/(?<text>[([{])/u, context => pairs[context.getCustomData().text as '{'] || ''],
  tokenOE: 'omit-omit',
  skipToken: /\s/u,
}).onMatch(context => {
  context.customData.type = 'block'
})

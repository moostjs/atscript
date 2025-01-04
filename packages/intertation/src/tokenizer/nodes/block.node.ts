import { BasicNode } from '@prostojs/parser'

import type { TNodeData } from '../types'

const pairs = {
  '{': '}',
  '(': ')',
  '[': ']',
}

/**
 * Block node
 */
export const BlockNode = new BasicNode<TNodeData>({
  label: 'block',
  icon: '→',
  tokens: [/(?<text>[([{])/u, context => pairs[context.getCustomData().text as '{'] || ''],
  tokenOE: 'omit-omit',
  skipToken: /\s/u,
}).onMatch(context => {
  context.customData.node = 'block'
})

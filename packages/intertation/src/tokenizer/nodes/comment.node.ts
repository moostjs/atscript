import { BasicNode } from '@prostojs/parser'

import type { TNodeData } from '../types'

const inline = new BasicNode<TNodeData>({
  // label only for tree view
  label: 'inline-comment',
  // icon only for tree view
  icon: '“',
  // start/end tokens
  tokens: ['//', /$/mu],
  // Omit/Eject options for tokens
  tokenOE: 'omit-omit',
})
  .mapContent('text', 'join-clear')
  .popsAtEOFSource(true)
  .onMatch(context => {
    context.customData.node = 'comment'
  })

const block = new BasicNode<TNodeData>({
  label: 'block-comment',
  icon: '“',
  tokens: ['/*', '*/'],
  tokenOE: 'omit-omit',
})
  .mapContent('text', 'join-clear')
  .popsAtEOFSource(true)
  .onMatch(context => {
    context.customData.node = 'comment'
  })

/**
 * Block and inline comments
 */
export const commentNodes = {
  inline,
  block,
  all: [inline, block],
}

import { BasicNode } from '@prostojs/parser'

import type { TLexicalToken } from '../types'

const inline = new BasicNode<TLexicalToken>({
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
    context.customData.type = 'comment'
  })

const block = new BasicNode<TLexicalToken>({
  label: 'block-comment',
  icon: '“',
  tokens: ['/*', '*/'],
  tokenOE: 'omit-omit',
})
  .mapContent('text', 'join-clear')
  .popsAtEOFSource(true)
  .onMatch(context => {
    context.customData.type = 'comment'
  })

/**
 * Block and inline comments
 */
export const commentNodes = {
  inline,
  block,
  all: [inline, block],
}

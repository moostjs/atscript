import type { TPunctuation } from '../../tokenizer/tokens/punctuation.token'
import type { Token } from '../token'
import { isGroup } from '.'
import { SemanticNode } from './node'

export class SemanticGroup extends SemanticNode {
  isGroup = true

  constructor(
    protected nodes: SemanticNode[] = [],
    private operator?: TPunctuation
  ) {
    super('group')
  }

  get length() {
    return this.nodes.length
  }

  get first() {
    return this.nodes[0]
  }

  get op() {
    return this.operator
  }

  define(node: SemanticNode): this {
    if (isGroup(node)) {
      this.nodes = node.unwrap()
      this.operator = node.op
    } else {
      this.nodes = [node]
    }
    return this
  }

  wrap(node: SemanticNode, token: Token) {
    node.define(this)
    node.saveToken(token, 'identifier')
    return this
  }

  unwrap() {
    return this.nodes
  }

  protected renderChildren() {
    let s = '  (\n'
    s += this.nodes.map(n => n.toString(2)).join(` <${this.operator || ''}>\n`)
    s += '\n  )'
    return s
  }
}

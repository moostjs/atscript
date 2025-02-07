/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { AtscriptDoc } from '../../document'
import { isProp, SemanticNode, SemanticRefNode } from '.'
import { SemanticGroup } from './group-node'
import { SemanticPropNode } from './prop-node'
import { Token } from '../token'

export class SemanticStructureNode extends SemanticGroup {
  constructor() {
    super()
    this.entity = 'structure'
  }

  public readonly props = new Map<string, SemanticPropNode>()

  /**
   * Shortcut to set props, used as utility
   */
  public setProps(props: SemanticPropNode[]) {
    this.nodes = props
    for (const prop of props) {
      this.props.set(prop.id!, prop)
    }
  }

  registerAtDocument(doc: AtscriptDoc): void {
    super.registerAtDocument(doc)
    const block = this.token('identifier')!
    block.blockType = 'structure'
    doc.blocksIndex.add(block)
    for (const node of this.nodes) {
      const token = node.token('identifier')
      if (!token) {
        doc.registerMessage(block, 'Has empty prop node')
        continue
      }
      const name = token.text
      if (typeof name !== 'string') {
        doc.registerMessage(token, 'Prop node has no name')
        continue
      }
      if (this.props.has(name)) {
        doc.registerMessage(token, 'Duplicate prop identifier')
        continue
      }
      if (!isProp(node)) {
        doc.registerMessage(token, 'Non-prop node')
        continue
      }
      this.props.set(name, node)
    }
  }

  addVirtualProp(opts: {
    name: string
    type: string | SemanticNode
    documentation?: string
    refToken?: Token
  }) {
    const token = opts.refToken || this.token('identifier')!
    const propToken = token.clone({
      type: 'identifier',
      text: opts.name,
    })
    const prop = new SemanticPropNode()
    if (opts.documentation) {
      prop.setDocumentation(opts.documentation)
    }
    prop.saveToken(propToken, 'identifier')
    if (typeof opts.type === 'string') {
      const ref = new SemanticRefNode()
      const [first, ...rest] = opts.type.split('.')
      const refToken = token.clone({
        type: 'identifier',
        text: first,
      })
      ref.saveToken(refToken, 'identifier')
      for (const chain of rest) {
        const chainToken = token.clone({
          type: 'identifier',
          text: chain,
        })
        ref.addChain(chainToken)
      }
      prop.define(ref)
    } else {
      prop.define(opts.type)
    }
    this.nodes.push(prop)
    this.props.set(opts.name, prop)
  }
}

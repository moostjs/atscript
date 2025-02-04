/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { AnscriptDoc } from '../../document'
import { isProp } from '.'
import { SemanticGroup } from './group-node'
import type { SemanticPropNode } from './prop-node'

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

  registerAtDocument(doc: AnscriptDoc): void {
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
}

/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { ItnDocument } from '../../document'
import { isProp } from '.'
import { SemanticGroup } from './group-node'
import type { SemanticPropNode } from './prop-node'

export class SemanticStructureNode extends SemanticGroup {
  constructor() {
    super()
    this.entity = 'structure'
  }

  public readonly props = new Map<string, SemanticPropNode>()

  registerAtDocument(doc: ItnDocument): void {
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

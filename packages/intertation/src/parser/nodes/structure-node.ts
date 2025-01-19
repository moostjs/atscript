/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { ItnDocument } from '../../document'
import { SemanticGroup } from './group-node'
import type { SemanticNode } from './node'

export class SemanticStructureNode extends SemanticGroup {
  constructor() {
    super()
    this.entity = 'structure'
  }

  public readonly props = new Map<string, SemanticNode>()

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
      this.props.set(name, node)
    }
  }
}

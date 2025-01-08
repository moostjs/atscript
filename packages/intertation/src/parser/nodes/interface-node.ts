import type { ItnDocument } from '../../document'
import { SemanticNode } from './node'

export class SemanticInterfaceNode extends SemanticNode {
  constructor() {
    super('interface')
  }

  registerAtDocument(doc: ItnDocument): void {
    doc.registerDefinition(this.token('identifier'))
    if (this.token('export')) {
      doc.registerExport(this)
    }
  }
}

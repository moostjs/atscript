import type { AtscriptDoc } from '../../document'
import { SemanticNode } from './semantic-node'

export class SemanticTypeNode extends SemanticNode {
  constructor() {
    super('type')
  }

  registerAtDocument(doc: AtscriptDoc): void {
    super.registerAtDocument(doc)
    const token = this.token('identifier')
    doc.registerDefinition(token)
    if (token && this.token('export')) {
      token.exported = true
      doc.registerExport(this)
    }
    if (this.definition) {
      //
    }
  }
}

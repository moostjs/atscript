import type { AnscriptDoc } from '../../document'
import { SemanticNode } from './node'

export class SemanticTypeNode extends SemanticNode {
  constructor() {
    super('type')
  }

  registerAtDocument(doc: AnscriptDoc): void {
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

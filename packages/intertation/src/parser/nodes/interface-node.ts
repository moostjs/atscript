/* eslint-disable @typescript-eslint/class-methods-use-this */
import type { ItnDocument } from '../../document'
import { isStructure } from '.'
import { SemanticNode } from './node'

export class SemanticInterfaceNode extends SemanticNode {
  constructor() {
    super('interface')
  }

  registerAtDocument(doc: ItnDocument): void {
    super.registerAtDocument(doc)
    const token = this.token('identifier')
    doc.registerDefinition(token)
    if (token && this.token('export')) {
      token.exported = true
      doc.registerExport(this)
    }
  }

  get props() {
    if (this.definition) {
      return isStructure(this.definition) ? this.definition.props : new Map<string, SemanticNode>()
    }
    return new Map<string, SemanticNode>()
  }
}

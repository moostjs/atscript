/* eslint-disable @typescript-eslint/class-methods-use-this */
import type { ItnDocument } from '../../document'
import type { Token } from '../token'
import { SemanticNode } from './node'

export class SemanticInterfaceNode extends SemanticNode {
  constructor() {
    super('interface')
  }

  registerAtDocument(doc: ItnDocument): void {
    const token = this.token('identifier')
    doc.registerDefinition(token)
    if (token && this.token('export')) {
      token.exported = true
      doc.registerExport(this)
    }
  }
}

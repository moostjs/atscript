/* eslint-disable @typescript-eslint/class-methods-use-this */
import type { ItnDocument } from '../../document'
import type { Token } from '../token'
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

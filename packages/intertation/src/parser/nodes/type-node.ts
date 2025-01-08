import type { ItnDocument } from '../../document'
import type { Token } from '../token'
import { isGroup } from '.'
import { SemanticNode } from './node'

export class SemanticTypeNode extends SemanticNode {
  constructor() {
    super('type')
  }

  registerAtDocument(doc: ItnDocument): void {
    doc.registry.register(this.token('identifier'))
    if (this.token('export')) {
      doc.registerExport(this)
    }
  }
}

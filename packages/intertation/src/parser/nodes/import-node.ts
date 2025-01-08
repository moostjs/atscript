/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { ItnDocument } from '../../document'
import type { Token } from '../token'
import { SemanticNode } from './node'

export class SemanticImportNode extends SemanticNode {
  constructor() {
    super('import')
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  get referredIdentifiers(): Token[] {
    return []
  }

  registerAtDocument(doc: ItnDocument): void {
    const tokens = this.definition ? this.getIdentifiersRecursive(this.definition) : []
    doc.registerImport(this.token('path')!, tokens)
  }
}

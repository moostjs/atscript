/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { ItnDocument } from '../../document'
import { SemanticNode } from './node'

export class SemanticImportNode extends SemanticNode {
  constructor() {
    super('import')
  }

  registerAtDocument(doc: ItnDocument): void {
    const tokens = this.referredIdentifiers
    doc.registerImport(this.token('path')!, tokens)
  }
}

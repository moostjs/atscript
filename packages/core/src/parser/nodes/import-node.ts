/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { AtscriptDoc } from '../../document'
import { SemanticNode } from './semantic-node'

export class SemanticImportNode extends SemanticNode {
  constructor() {
    super('import')
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  // get referredIdentifiers(): Token[] {
  //   return []
  // }

  registerAtDocument(doc: AtscriptDoc): void {
    const imports = this.definition ? this.getIdentifiersRecursive(this.definition) : []
    doc.registerImport({
      from: this.token('path')!,
      imports,
      block: this.token('inner')!,
    })
  }
}

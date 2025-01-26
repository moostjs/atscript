/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { AnscriptDoc } from '../../document'
import { SemanticNode } from './node'

export class SemanticImportNode extends SemanticNode {
  constructor() {
    super('import')
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  // get referredIdentifiers(): Token[] {
  //   return []
  // }

  registerAtDocument(doc: AnscriptDoc): void {
    const imports = this.definition ? this.getIdentifiersRecursive(this.definition) : []
    doc.registerImport({
      from: this.token('path')!,
      imports,
      block: this.token('inner')!,
    })
  }
}

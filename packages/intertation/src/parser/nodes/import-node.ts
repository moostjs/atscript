/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { ItnDocument } from '../../document'
import type { Token } from '../token'
import { SemanticNode } from './node'

export class SemanticImportNode extends SemanticNode {
  constructor() {
    super('import')
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  // get referredIdentifiers(): Token[] {
  //   return []
  // }

  registerAtDocument(doc: ItnDocument): void {
    const imports = this.definition ? this.getIdentifiersRecursive(this.definition) : []
    doc.registerImport({
      from: this.token('path')!,
      imports,
      block: this.token('inner')!,
    })
  }
}

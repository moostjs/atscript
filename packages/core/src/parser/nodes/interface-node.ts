/* eslint-disable @typescript-eslint/class-methods-use-this */
import type { AtscriptDoc } from '../../document'
import { isStructure } from '.'
import { SemanticNode } from './node'
import type { SemanticPropNode } from './prop-node'

export class SemanticInterfaceNode extends SemanticNode {
  constructor() {
    super('interface')
  }

  registerAtDocument(doc: AtscriptDoc): void {
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
      return isStructure(this.definition)
        ? this.definition.props
        : new Map<string, SemanticPropNode>()
    }
    return new Map<string, SemanticPropNode>()
  }
}

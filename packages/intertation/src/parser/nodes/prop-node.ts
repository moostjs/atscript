/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import type { ItnDocument } from '../../document'
import { isRef, isStructure } from '.'
import { SemanticNode } from './node'

export class SemanticPropNode extends SemanticNode {
  constructor() {
    super('prop')
  }

  registerAtDocument(doc: ItnDocument): void {
    super.registerAtDocument(doc)
    const token = this.token('identifier')
    if (token && token.type === 'text' && token.multiline) {
      doc.registerMessage(token, 'Unexpected end of string')
    }
  }

  get nestedProps() {
    if (this.definition && isStructure(this.definition)) {
      return this.definition.props
    }
  }

  get nestedType() {
    if (this.definition && isRef(this.definition)) {
      return this.definition
    }
  }
}

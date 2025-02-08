/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import type { AtscriptDoc } from '../../document'
import { isRef, isStructure } from '.'
import { SemanticNode } from './semantic-node'

export class SemanticPropNode extends SemanticNode {
  constructor() {
    super('prop')
  }

  registerAtDocument(doc: AtscriptDoc): void {
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

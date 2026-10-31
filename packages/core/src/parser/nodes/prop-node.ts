import { isRef, isStructure } from '.'
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import type { AtscriptDoc } from '../../document'
import { statefulRegexFlagsMessage } from '../utils'
import { SemanticNode } from './semantic-node'

export class SemanticPropNode extends SemanticNode {
  constructor() {
    super('prop')
  }

  registerAtDocument(doc: AtscriptDoc): void {
    super.registerAtDocument(doc)
    doc.registerProp(this)
    const token = this.token('identifier')
    if (token) {
      doc.tokensIndex.add(token)
      if (token.type === 'text' && token.multiline) {
        doc.registerMessage(token, 'Unexpected end of string')
      }
      const flagsMessage = token.pattern && statefulRegexFlagsMessage(token.pattern.flags, 'key')
      if (flagsMessage) {
        doc.registerMessage(token, flagsMessage, 2)
      }
    }
  }

  get isPattern() {
    return !!this.token('identifier')?.pattern
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

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import type { AnscriptDoc } from '../../document'
import { SemanticNode } from './node'

export class SemanticConstNode extends SemanticNode {
  constructor() {
    super('const')
  }

  registerAtDocument(doc: AnscriptDoc): void {
    const token = this.token('identifier')
    if (token && token.type === 'text' && token.multiline) {
      doc.registerMessage(token, 'Unexpected end of string')
    }
  }
}

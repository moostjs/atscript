import { isStructure } from '.'
/* eslint-disable @typescript-eslint/class-methods-use-this */
import type { AtscriptDoc } from '../../document'
import type { SemanticPropNode } from './prop-node'
import { SemanticNode } from './semantic-node'
import type { Token } from '../token'

export class SemanticInterfaceNode extends SemanticNode {
  private _extendsTokens: Token[] = []

  constructor() {
    super('interface')
  }

  addExtendsToken(token: Token) {
    this._extendsTokens.push(token)
  }

  get extendsTokens(): Token[] {
    return this._extendsTokens
  }

  get hasExtends(): boolean {
    return this._extendsTokens.length > 0
  }

  registerAtDocument(doc: AtscriptDoc): void {
    super.registerAtDocument(doc)
    this.__typeId = doc.nextTypeId()
    const token = this.token('identifier')
    doc.registerDefinition(token)
    if (token && this.token('export')) {
      token.exported = true
      doc.registerExport(this)
    }
    // Register extends tokens as references for go-to-definition and find-usages
    for (const t of this._extendsTokens) {
      t.isReference = true
      doc.referred.push(t)
      doc.tokensIndex.add(t)
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

  toString(level = 0, prefix = '●') {
    let s = super.toString(level, prefix)
    if (this._extendsTokens.length > 0) {
      const extendsStr = this._extendsTokens.map(t => t.text).join(', ')
      s = s.replace('[interface]', `[interface extends ${extendsStr}]`)
    }
    return s
  }
}

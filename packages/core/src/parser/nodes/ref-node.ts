/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { AtscriptDoc } from '../../document'
import type { Token } from '../token'
import { SemanticNode } from './node'

export class SemanticRefNode extends SemanticNode {
  constructor() {
    super('ref')
  }

  get referredIdentifiers(): Token[] {
    return [this.token('identifier')!]
  }

  protected _chain = [] as Token[]

  protected _dots = [] as Token[]

  registerAtDocument(doc: AtscriptDoc): void {
    super.registerAtDocument(doc)
    this.token('identifier')!.index = 0
    this._chain.forEach(c => {
      doc.tokensIndex.add(c)
    })
    this._dots.forEach(d => {
      doc.tokensIndex.add(d)
    })
  }

  addChain(token: Token) {
    token.parentNode = this
    token.isChain = true
    token.index = this._chain.length + 1
    this._chain.push(token)
  }

  addDot(token: Token) {
    token.parentNode = this
    token.isChain = true
    token.index = this._chain.length
    this._dots.push(token)
  }

  get chain(): Token[] {
    return this._chain
  }

  get hasChain(): boolean {
    return this._chain.length > 0
  }

  toString(level = 0, prefix = '●') {
    const indent = ' '.repeat(level * 2)
    let s = `${this.renderAnnotations()}${prefix} [${this.entity}] "${
      this.token('identifier')?.text ?? ''
    }"`
    this.tokens?.forEach((t, key) => {
      s += key === 'identifier' ? '' : ` ${key}: ${t.text} <${t.type}>`
    })
    // eslint-disable-next-line sonarjs/no-nested-template-literals
    s += this.hasChain ? `.${this.chain.map(c => `["${c.text}"]`).join('.')}` : ''
    return indent + s.split('\n').join(`\n${indent}`)
  }
}

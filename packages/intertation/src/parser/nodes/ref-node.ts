import type { Token } from '../token'
import { SemanticNode } from './node'

export class SemanticRefNode extends SemanticNode {
  constructor() {
    super('ref')
  }

  get referredIdentifiers(): Token[] {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return [this.token('identifier')!]
  }

  protected _chain = [] as Token[]

  addChain(token: Token) {
    this._chain.push(token)
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

/* eslint-disable @typescript-eslint/no-confusing-void-expression */
import type { ItnDocument } from '../../document'
import type { Token } from '../token'
import { isGroup } from '.'
import type { TAnnotationTokens, TNodeEntity, TSemanticToken } from './types'

export class SemanticNode {
  constructor(public entity: TNodeEntity) {}

  protected tokens?: Map<TSemanticToken, Token>

  protected isGroup = false

  protected definition?: SemanticNode

  protected annotations?: Map<string, TAnnotationTokens>

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  registerAtDocument(doc: ItnDocument): void {
    if (this.definition) {
      this.definition.registerAtDocument(doc)
    }
  }

  get id() {
    return this.token('identifier')?.text
  }

  get referredIdentifiers(): Token[] {
    if (isGroup(this)) {
      return this.getIdentifiersRecursive(this)
    }
    return this.definition ? this.getIdentifiersRecursive(this.definition) : []
  }

  getIdentifiersRecursive(node: SemanticNode): Token[] {
    if (isGroup(node)) {
      const r = [] as Token[]
      for (const n of node.unwrap()) {
        r.push(...this.getIdentifiersRecursive(n))
      }
      return r
    } else {
      return node.referredIdentifiers
    }
  }

  annotate(name: string, token: Token) {
    if (!this.annotations) {
      this.annotations = new Map()
    }
    const a = {
      token,
      args: [],
    } as TAnnotationTokens
    this.annotations.set(name, a)
    return (arg: Token) => {
      a.args.push(arg)
    }
  }

  hasAnnotation(name: string) {
    return this.annotations?.has(name)
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this, @typescript-eslint/class-literal-property-style
  get length() {
    return 0
  }

  define(node: SemanticNode) {
    this.definition = node
    return this
  }

  get def() {
    return this.definition
  }

  get identifier() {
    return this.token('identifier')?.text
  }

  saveToken(token: Token, semantic: TSemanticToken) {
    if (!this.tokens) {
      this.tokens = new Map()
    }
    this.tokens.set(semantic, token)
    return this
  }

  wrap(node: SemanticNode, token: Token) {
    this.define(node)
    this.saveToken(token, 'identifier')
    return this
  }

  token(s: TSemanticToken) {
    return this.tokens?.get(s)
  }

  has(s: TSemanticToken) {
    return this.tokens?.has(s)
  }

  toString(level = 0, prefix = '●') {
    const indent = ' '.repeat(level * 2)
    let s = `${this.renderAnnotations()}${prefix} [${this.entity}] "${
      this.token('identifier')?.text ?? ''
    }"`
    this.tokens?.forEach((t, key) => {
      s += key === 'identifier' ? '' : ` ${key}: ${t.text} <${t.type}>`
    })
    s += this.renderChildren()
    return indent + s.split('\n').join(`\n${indent}`)
  }

  renderAnnotations() {
    if (this.annotations) {
      return `${Array.from(
        this.annotations.entries(),
        ([name, { args }]) =>
          // eslint-disable-next-line sonarjs/no-nested-template-literals
          `@${name} ${args.map(a => (a.type === 'text' ? `"${a.text}"` : a.text)).join(' ')}`
      ).join('\n')}\n`
    }
    return ''
  }

  protected renderChildren() {
    if (this.definition) {
      return isGroup(this.definition)
        ? `\n${this.definition.toString(1, '=')}\n`
        : `${this.definition.toString(0, ':')}`
    }
    return ''
  }
}

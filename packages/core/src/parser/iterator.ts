/* eslint-disable max-params */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import type { TPunctuation } from '../tokenizer/tokens/punctuation.token'
import type { TLexicalToken } from '../tokenizer/types'
import type { TExpect, TMessages } from './types'

interface TNodeIteratorIssues {
  unexpectedEOB?: boolean
}

export class NodeIterator {
  constructor(
    private readonly nodes: TLexicalToken[],
    public readonly messages: TMessages = [],
    public readonly badNodes = new Map<TLexicalToken, string>(),
    public readonly issues: TNodeIteratorIssues = {},
    public readonly parent?: TLexicalToken,
    private i = -1
  ) {}

  $?: TLexicalToken

  get index() {
    return this.i
  }

  get lastNode(): TLexicalToken | undefined {
    return this.nodes[this.nodes.length - 1]
  }

  unexpectedEOB() {
    this.issues.unexpectedEOB = true
  }

  unfork(fork: NodeIterator) {
    this.i = fork.index
    this.update()
  }

  accepted() {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-boolean-literal-compare
    if (this.$ && this.$.accepted !== false) {
      this.$.accepted = true
      this.badNodes.delete(this.$)
    }
  }

  toString() {
    return this.$ ? `[${this.$.type}] ${this.$.text}` : `void`
  }

  update() {
    this.$ = this.nodes[this.i]
    return this
  }

  move(v = 1) {
    this.i += v
    this.$ = this.nodes[this.i]
    return this
  }

  next(skip?: string[]) {
    return this.fork().move().skip(skip)
  }

  fork(nodes?: TLexicalToken[]) {
    return new NodeIterator(
      nodes || this.nodes,
      this.messages,
      this.badNodes,
      this.issues,
      nodes ? this.$ : this.parent,
      nodes ? 0 : this.i
    ).update()
  }

  skip(pun?: string[]) {
    while (
      this.$?.type === 'comment' ||
      (this.$?.type === 'punctuation' && pun?.length && pun.includes(this.$.text))
    ) {
      this.move()
    }
    return this
  }

  skipUntil(pun: TPunctuation[]) {
    while (this.$ && !this.satisfies({ node: 'punctuation', text: pun })) {
      this.move()
    }
  }

  unexpected(force = false, msg = 'Unexpected token') {
    if (force && this.$) {
      this.$.accepted = false
    }
    if (this.$ && !this.badNodes.has(this.$)) {
      this.badNodes.set(this.$, msg)
    }
  }

  shouldHaveError(depth: number) {
    for (let i = this.i; i <= depth; i++) {
      if (i < this.nodes.length) {
        this.nodes[i].accepted = false
      }
    }
  }

  nodesLeft() {
    return this.nodes.length > 0 && this.index < this.nodes.length
  }

  satisfies(...rules: TExpect[]) {
    for (const rule of rules) {
      const passed = Array.isArray(rule.node)
        ? rule.node.includes(this.$?.type as 'text')
        : this.$?.type === rule.node
      if (passed && rule.text === undefined) {
        return true
      }
      if (
        passed && Array.isArray(rule.text)
          ? rule.text.includes(this.$?.text as 'text')
          : this.$?.text === rule.text
      ) {
        return true
      }
    }
    return false
  }

  confirmIssues() {
    if (this.issues.unexpectedEOB) {
      const node = this.lastNode || this.parent
      const pos = node?.getRange().end || { character: 1, line: 1 }
      this.messages.push({
        severity: 1,
        message: `Unexpected end of block`,
        range: {
          start: pos,
          end: pos,
        },
      })
      this.issues.unexpectedEOB = false
    }
  }

  getErrors(): TMessages {
    this.badNodes.forEach((msg, node) => {
      if (node.accepted) {
        this.badNodes.delete(node)
      }
    })
    return Array.from(this.badNodes.entries(), ([node, msg]) => ({
      severity: 1,
      message: msg,
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      range: node.getRange?.() || {
        start: { character: 1, line: 1 },
        end: { character: 1, line: 1 },
      },
    })).concat(this.messages) as TMessages
  }
}

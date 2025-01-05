/* eslint-disable max-params */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import type { TNodeData } from '../tokenizer/types'
import type { TExpect, TMessages } from './types'

export class NodeIterator {
  constructor(
    private readonly nodes: TNodeData[],
    public readonly messages: TMessages = [],
    public readonly badNodes: Map<TNodeData, string> = new Map(),
    private i = -1
  ) {}

  $?: TNodeData

  get index() {
    return this.i
  }

  unfork(fork: NodeIterator) {
    this.i = fork.index
    this.update()
  }

  isUnexpected(text: string) {
    if (this.$ && !this.$.accepted && !this.badNodes.has(this.$)) {
      this.badNodes.set(this.$, text)
    }
  }

  accepted() {
    if (this.$) {
      this.$.accepted = true
      this.badNodes.delete(this.$)
    }
  }

  toString() {
    return this.$ ? `[${this.$.node}] ${this.$.text}` : `void`
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

  /** @deprecated */
  killNextNode(n = 1) {
    this.nodes.splice(this.i + 1, n)
  }

  next(skip?: string[]) {
    return this.fork().move().skip(skip)
  }

  fork(nodes?: TNodeData[]) {
    return new NodeIterator(
      nodes || this.nodes,
      this.messages,
      this.badNodes,
      nodes ? 0 : this.i
    ).update()
  }

  skip(pun?: string[]) {
    while (
      this.$?.node === 'comment' ||
      (this.$?.node === 'punctuation' && pun?.length && pun.includes(this.$.text))
    ) {
      this.move()
    }
    return this
  }

  error(msg: string) {
    this.isUnexpected(msg)
    // this.messages.push({
    //   type: 'error',
    //   message: msg,
    //   // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    //   range: this.$?.getRange?.() || {
    //     start: { character: 1, line: 1 },
    //     end: { character: 1, line: 1 },
    //   },
    // })
  }

  nodesLeft() {
    return this.nodes.length > 0 && this.index < this.nodes.length
  }

  satisfies(...rules: TExpect[]) {
    for (const rule of rules) {
      const passed = Array.isArray(rule.node)
        ? rule.node.includes(this.$?.node as 'text')
        : this.$?.node === rule.node
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

  getErrors(): TMessages {
    return Array.from(this.badNodes.entries(), ([node, msg]) => ({
      type: 'error',
      message: msg,
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      range: node.getRange?.() || {
        start: { character: 1, line: 1 },
        end: { character: 1, line: 1 },
      },
    }))
  }
}

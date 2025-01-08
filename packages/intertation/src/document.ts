/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { IdRegistry } from './parser/id-registry'
import { NodeIterator } from './parser/iterator'
import type { SemanticNode } from './parser/nodes'
import { pipes } from './parser/pipes'
import { runPipes } from './parser/pipes/core.pipe'
import type { Token } from './parser/token'
import type { TMessages, TSeverity } from './parser/types'
import { tokenize } from './tokenizer'

export interface TItnDocumentConfig {
  reserved?: string[]
  globalTypes?: string[]
}

export class ItnDocument {
  constructor(
    public readonly id: string,
    private readonly config: TItnDocumentConfig
  ) {
    this.registry = new IdRegistry(config.reserved, config.globalTypes)
  }

  public readonly registry: IdRegistry

  public semanticMessages: TMessages = []

  public messages: TMessages = []

  public imports = new Map<string, { from: Token; tokens: Token[] }>()

  public readonly exports = new Map<string, SemanticNode>()

  public referred = [] as Token[]

  public readonly dependencies = new Set<ItnDocument>()

  public readonly dependants = new Set<ItnDocument>()

  updateDependencies(docs: ItnDocument[]) {
    const newDependencies = new Set(docs)
    this.dependencies.forEach(d => {
      if (!newDependencies.has(d)) {
        d.dependants.delete(this)
        this.dependencies.delete(d)
      }
    })
    newDependencies.forEach(d => {
      d.dependants.add(this)
      this.dependencies.add(d)
    })
  }

  update(text: string, debug = false) {
    this.cleanup()
    const rawTokens = tokenize(text, debug)
    const ni = new NodeIterator(rawTokens, []).move()
    const nodes = runPipes([pipes.importPipe, pipes.type, pipes.interfaceType], ni)
    this.semanticMessages = ni.getErrors()
    this.registerNodes(nodes)
  }

  cleanup() {
    this.exports.clear()
    this.registry.clear()
    this.messages = []
    this.referred = []
    this.imports.clear()
    this._allMessages = undefined
  }

  private registerNodes(nodes: SemanticNode[]) {
    for (const node of nodes) {
      node.registerAtDocument(this)
      node.referredIdentifiers.forEach(t => {
        this.referred.push(t)
      })
    }
  }

  registerImport(from: Token, tokens: Token[]) {
    this.imports.set(from.text, { from, tokens })
    tokens.forEach(t => {
      this.registerDefinition(t)
    })
  }

  registerDefinition(token?: Token) {
    this.registry.registerDefinition(token)
  }

  registerExport(node: SemanticNode) {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (node.id) {
      this.exports.set(node.id, node)
    }
  }

  registerMessage(token: Token, message: string, severity: TSeverity = 1) {
    if (this._allMessages) {
      this._allMessages = undefined
    }
    this.messages.push({
      severity,
      message,
      range: token.range,
    })
  }

  private _allMessages = undefined as TMessages | undefined

  clearMessages() {
    this._allMessages = undefined
  }

  getUnusedTokens() {
    const refSet = new Set<string>(this.referred.map(r => r.text))
    const tokens = [] as Token[]
    for (const [key, token] of Array.from(this.registry.definitions.entries())) {
      if (!refSet.has(key) && !this.exports.has(key)) {
        tokens.push(token)
      }
    }
    return tokens
  }

  getDiagMessages() {
    console.log('node messages', this.messages)
    if (!this._allMessages) {
      this._allMessages = [
        ...this.referred
          .filter(t => !this.registry.isDefined(t))
          .map(t => ({
            severity: 1,
            message: `Unknown identifier "${t.text}"`,
            range: t.range,
          })),
        ...this.registry.getErrors(),
        ...this.semanticMessages,
        ...this.messages,
      ] as TMessages
    }
    return this._allMessages
  }
}

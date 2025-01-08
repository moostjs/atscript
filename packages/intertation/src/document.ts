/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { IdRegistry } from './parser/id-registry'
import { NodeIterator } from './parser/iterator'
import type { SemanticNode } from './parser/nodes'
import { pipes } from './parser/pipes'
import { runPipes } from './parser/pipes/core.pipe'
import type { Token } from './parser/token'
import type { TMessages } from './parser/types'
import { tokenize } from './tokenizer'

export interface TItnDocumentConfig {
  reserved?: string[]
}

export class ItnDocument {
  constructor(
    public readonly id: string,
    private readonly config: TItnDocumentConfig
  ) {}

  public readonly registry = new IdRegistry(this.config.reserved)

  public semanticMessages: TMessages = []

  public nodesMessage: TMessages = []

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
    this.nodesMessage = []
    this.referred = []
    this.imports.clear()
    this._allMessages = undefined
  }

  registerNodes(nodes: SemanticNode[]) {
    for (const node of nodes) {
      node.registerAtDocument(this)
      this.referred.push(...node.referredIdentifiers)
    }
  }

  registerImport(from: Token, tokens: Token[]) {
    this.imports.set(from.text, { from, tokens })
    tokens.forEach(t => {
      this.registry.register(t)
    })
  }

  registerExport(node: SemanticNode) {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (node.id) {
      this.exports.set(node.id, node)
    }
  }

  registerMessage(token: Token, message: string, type: 'error' | 'warning' = 'error') {
    this.nodesMessage.push({
      type,
      message,
      range: token.range,
    })
  }

  private _allMessages = undefined as TMessages | undefined

  clearMessages() {
    this._allMessages = undefined
  }

  getAllMessages() {
    if (!this._allMessages) {
      this._allMessages = [
        ...this.referred
          .filter(
            t => !this.registry.reserved.has(t.text) && !this.registry.definitions.has(t.text)
          )
          .map(t => ({
            type: 'error',
            message: `Unknown identifier "${t.text}"`,
            range: t.range,
          })),
        ...Array.from(this.registry.duplicates, t => ({
          type: 'error',
          message: `Duplicate identifier "${t.text}"`,
          range: t.range,
        })),
        ...Array.from(this.registry.forbidden, t => ({
          type: 'error',
          message: `Reserved keyword "${t.text}"`,
          range: t.range,
        })),
        ...this.semanticMessages,
        ...this.nodesMessage,
      ] as TMessages
    }
    return this._allMessages
  }
}

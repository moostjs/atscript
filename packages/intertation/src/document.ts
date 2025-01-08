/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { IdRegistry } from './parser/id-registry'
import { NodeIterator } from './parser/iterator'
import type { SemanticNode } from './parser/nodes'
import { pipes } from './parser/pipes'
import { runPipes } from './parser/pipes/core.pipe'
import type { Token } from './parser/token'
import type { TMessages, TSeverity } from './parser/types'
import { resolveItnFromPath } from './parser/utils'
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

  public tokensMap = [] as Array<Token[] | undefined>

  public imports = new Map<string, { from: Token; tokens: Token[] }>()

  public importedDefs = new Map<string, Token>()

  public readonly exports = new Map<string, SemanticNode>()

  public referred = [] as Token[]

  public readonly dependencies = new Set<ItnDocument>()

  public readonly dependants = new Set<ItnDocument>()

  public readonly dependenciesMap = new Map<string, ItnDocument>()

  updateDependencies(docs: ItnDocument[]) {
    const newDependencies = new Set(docs)

    this.dependencies.forEach(d => {
      if (!newDependencies.has(d)) {
        d.dependants.delete(this)
        this.dependencies.delete(d)
        this.dependenciesMap.delete(d.id)
      }
    })
    newDependencies.forEach(d => {
      d.dependants.add(this)
      this.dependencies.add(d)
      this.dependenciesMap.set(d.id, d)
    })
  }

  update(text: string, debug = false) {
    this.cleanup()
    const rawTokens = tokenize(text, debug)
    const ni = new NodeIterator(rawTokens, []).move()
    const nodes = runPipes([pipes.importPipe, pipes.type, pipes.interfaceType], ni)
    if (debug) {
      console.log(nodes.map(n => n.toString()).join('\n'))
    }
    this.semanticMessages = ni.getErrors()
    this.registerNodes(nodes)
  }

  cleanup() {
    this.exports.clear()
    this.registry.clear()
    this.importedDefs.clear()
    this.messages = []
    this.referred = []
    this.imports.clear()
    this._allMessages = undefined
    this.tokensMap = []
  }

  private registerNodes(nodes: SemanticNode[]) {
    for (const node of nodes) {
      node.registerAtDocument(this)
      node.referredIdentifiers.forEach(t => {
        this.referred.push(t)
        const line = t.range.start.line
        this.tokensMap[line] = this.tokensMap[line] ?? []
        this.tokensMap[line].push(t)
      })
    }
  }

  getDefinitionByPos(line: number, character: number) {
    const tokens = this.tokensMap[line]
    if (!tokens) {
      return undefined
    }
    const token = tokens.find(
      t => t.range.start.character <= character && t.range.end.character >= character
    )
    if (!token) {
      return undefined
    }
    if (token.navigatesToFile) {
      const absolutePath = resolveItnFromPath(token.navigatesToFile, this.id)
      return [
        {
          targetUri: absolutePath,
          targetRange: zeroRange,
          targetSelectionRange: zeroRange,
          originSelectionRange: token.range,
        },
      ]
    }
    if (this.importedDefs.has(token.text) && this.dependenciesMap.size > 0) {
      const from = this.importedDefs.get(token.text)!.text
      const absolutePath = resolveItnFromPath(from, this.id)
      const targetDoc = this.dependenciesMap.get(absolutePath)
      if (targetDoc) {
        const target = targetDoc.registry.definitions.get(token.text)
        return target
          ? {
              uri: targetDoc.id,
              range: target.range,
            }
          : null
      }
    }
    const def = this.registry.definitions.get(token.text)
    return def
      ? {
          uri: this.id,
          range: def.range,
        }
      : null
  }

  registerImport(from: Token, tokens: Token[]) {
    this.imports.set(from.text, { from, tokens })
    tokens.forEach(t => {
      this.registerDefinition(t)
      this.tokensMap[t.range.start.line] = this.tokensMap[t.range.start.line] ?? []
      this.tokensMap[t.range.start.line]!.push(t)
      this.importedDefs.set(t.text, from)
      this.tokensMap[from.range.start.line] = this.tokensMap[from.range.start.line] ?? []
      this.tokensMap[from.range.start.line]!.push(from)
      from.navigatesToFile = from.text
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

const zeroRange = {
  start: {
    line: 0,
    character: 0,
  },
  end: {
    line: 0,
    character: 0,
  },
}

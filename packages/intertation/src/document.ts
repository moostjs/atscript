/* eslint-disable complexity */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { IdRegistry } from './parser/id-registry'
import { NodeIterator } from './parser/iterator'
import type { SemanticNode } from './parser/nodes'
import { pipes } from './parser/pipes'
import { runPipes } from './parser/pipes/core.pipe'
import type { Token } from './parser/token'
import type { TMessages, TSeverity } from './parser/types'
import { getRelPath, resolveItnFromPath } from './parser/utils'
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

  /**
   * All the non-blocks tokens, that could be referred
   */
  public tokensMap = [] as Array<Set<Token> | undefined>

  /**
   * All the block-tokens
   */
  public blocksMap = [] as Array<Set<Token> | undefined>

  /**
   * Imports map by URI, contains from Token and imports[] tokens
   */
  public imports = new Map<string, { from: Token; imports: Token[] }>()

  /**
   * Map of imported definitions by type/interface identifier
   */
  public importedDefs = new Map<string, Token>()

  /**
   * Exported nodes by identifier
   */
  public readonly exports = new Map<string, SemanticNode>()

  /**
   * List of tokens that refer to some type or interface
   */
  public referred = [] as Token[]

  /**
   * Set of documents that this document depend on
   */
  public readonly dependencies = new Set<ItnDocument>()

  /**
   * Set of documents that depend on this document
   */
  public readonly dependants = new Set<ItnDocument>()

  /**
   * Map of dependencies (documents) by URI
   */
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
    this.blocksMap = []
  }

  private registerNodes(nodes: SemanticNode[]) {
    for (const node of nodes) {
      node.registerAtDocument(this)
      node.referredIdentifiers.forEach(t => {
        t.isReference = true
        this.referred.push(t)
        this.updateTokensMap(t)
      })
    }
  }

  private updateTokensMap(t: Token) {
    const line = t.range.start.line
    this.tokensMap[line] = this.tokensMap[line] ?? new Set()
    this.tokensMap[line].add(t)
  }

  private updateBlocksMap(t: Token) {
    const line = t.range.start.line
    this.blocksMap[line] = this.blocksMap[line] ?? new Set()
    this.blocksMap[line].add(t)
  }

  getUsageListAt(line: number, character: number) {
    const token = this.getTokenAt(line, character)
    if (token) {
      return this.usageListFor(token)
    }
  }

  usageListFor(
    token: Token
  ): Array<{ uri: string; range: Token['range']; token: Token }> | undefined {
    if (token.isDefinition) {
      const refs = this.referred
        .filter(t => t.text === token.text)
        .map(r => ({
          uri: this.id,
          range: r.range,
          token: r,
        }))
      if (token.exported) {
        for (const d of this.dependants) {
          const imp = d.imports.get(this.id)
          if (imp?.imports.find(t => t.text === token.text)) {
            refs.push(
              ...d.referred
                .filter(t => t.text === token.text)
                .map(r => ({
                  uri: d.id,
                  range: r.range,
                  token: r,
                }))
            )
          }
        }
      }
      return refs
    } else {
      const defForToken = this.getDefinitionFor(token)
      if (defForToken?.token?.isDefinition && defForToken.doc) {
        return defForToken.doc.usageListFor(defForToken.token)
      }
    }
    return undefined
  }

  getBlockAt(line: number, character: number) {
    const tokens = this.blocksMap[line]
    if (!tokens) {
      return undefined
    }
    return Array.from(tokens).find(
      t => t.range.start.character <= character && t.range.end.character >= character
    )
  }

  getTokenAt(line: number, character: number) {
    const tokens = this.tokensMap[line]
    if (!tokens) {
      return undefined
    }
    return Array.from(tokens).find(
      t => t.range.start.character <= character && t.range.end.character >= character
    )
  }

  getDefinitionFor(token: Token): { uri: string; doc?: ItnDocument; token?: Token } | undefined {
    if (token.isDefinition && !token.imported) {
      return { uri: this.id, doc: this, token }
    }
    if (token.fromPath) {
      const absolutePath = resolveItnFromPath(token.fromPath, this.id)

      return { uri: absolutePath, doc: this.dependenciesMap.get(absolutePath), token }
    }
    if (
      (token.isReference || token.imported) &&
      this.importedDefs.has(token.text) &&
      this.dependenciesMap.size > 0
    ) {
      const from = this.importedDefs.get(token.text)!.text
      const absolutePath = resolveItnFromPath(from, this.id)
      const targetDoc = this.dependenciesMap.get(absolutePath)
      if (targetDoc) {
        const target = targetDoc.registry.definitions.get(token.text)
        return target
          ? {
              uri: targetDoc.id,
              doc: targetDoc,
              token: target,
            }
          : undefined
      }
    }
    if (token.isReference) {
      const def = this.registry.definitions.get(token.text)
      return def
        ? {
            uri: this.id,
            doc: this,
            token: def,
          }
        : undefined
    }
  }

  getToDefinitionAt(line: number, character: number) {
    const token = this.getTokenAt(line, character)
    if (token) {
      const result = this.getDefinitionFor(token)
      return result
        ? [
            {
              targetUri: result.uri,
              targetRange: result.token?.range ?? zeroRange,
              targetSelectionRange: result.token?.range ?? zeroRange,
              originSelectionRange: token.range,
            },
          ]
        : undefined
    }
  }

  registerImport({ from, imports, block }: { from: Token; imports: Token[]; block: Token }) {
    const importId = resolveItnFromPath(from.text, this.id)
    this.imports.set(importId, { from, imports })
    this.updateBlocksMap(block)
    block.blockType = 'import'
    block.fromPath = from.text
    imports.forEach(t => {
      t.imported = true
      this.registerDefinition(t, true)
      this.updateTokensMap(t)
      this.updateTokensMap(from)
      this.importedDefs.set(t.text, from)
      from.fromPath = from.text
    })
  }

  registerDefinition(token?: Token, asImport = false) {
    if (token) {
      token.isDefinition = !asImport
      if (asImport) {
        token.isReference = true
      }
      this.updateTokensMap(token)
      this.registry.registerDefinition(token)
    }
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

/* eslint-disable @typescript-eslint/no-confusing-void-expression */
/* eslint-disable max-depth */
/* eslint-disable sonarjs/cognitive-complexity */
/* eslint-disable complexity */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { AnnotationSpec } from './annotations'
import { isAnnotationSpec } from './annotations'
import type { TAnnotationsTree } from './config'
import { IdRegistry } from './parser/id-registry'
import { NodeIterator } from './parser/iterator'
import type { SemanticNode } from './parser/nodes'
import { isInterface, isProp, isRef, isStructure, isType } from './parser/nodes'
import type { SemanticPrimitiveNode } from './parser/nodes/primitive-node'
import { pipes } from './parser/pipes'
import { runPipes } from './parser/pipes/core.pipe'
import type { Token } from './parser/token'
import type { TMessages } from './parser/types'
import { TSeverity } from './parser/types'
import { resolveAnscriptFromPath } from './parser/utils'
import { PluginManager } from './plugin/plugin-manager'
import { TAnscriptPlugin, TAnscriptRenderContext } from './plugin/types'
import { BlocksIndex } from './token-index/blocks-index'
import { TokensIndex } from './token-index/tokens-index'
import type { ITokensIndex } from './token-index/types'
import { tokenize } from './tokenizer'

export interface TAnscriptDocConfig {
  primitives?: Map<string, SemanticPrimitiveNode>
  annotations?: TAnnotationsTree
  unknownAnnotation?: 'allow' | 'warn' | 'error'
  plugins?: TAnscriptPlugin[]
}

export class AnscriptDoc {
  constructor(
    public readonly id: string,
    public readonly config: TAnscriptDocConfig,
    private readonly manager?: PluginManager
  ) {
    this.registry = new IdRegistry(Array.from(config.primitives?.keys() || []))
  }

  get name() {
    return this.id.split('/').pop()
  }

  public readonly registry: IdRegistry

  public semanticMessages: TMessages = []

  public messages: TMessages = []

  /**
   * All the non-blocks tokens, that could be referred
   */
  public tokensIndex: ITokensIndex = new TokensIndex()

  /**
   * All the block-tokens
   */
  public blocksIndex: ITokensIndex = new BlocksIndex()

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
   * Set of documents that this document depend on
   */
  public readonly dependencies = new Set<AnscriptDoc>()

  /**
   * Set of documents that depend on this document
   */
  public readonly dependants = new Set<AnscriptDoc>()

  /**
   * List of tokens that refer to some type or interface
   */
  public referred = [] as Token[]

  /**
   * Map of dependencies (documents) by URI
   */
  public readonly dependenciesMap = new Map<string, AnscriptDoc>()

  get primitives() {
    return Array.from(this.config.primitives?.values() ?? [])
  }

  async render(context: TAnscriptRenderContext) {
    return this.manager?.render(this, context)
  }

  resolveAnnotation(name: string) {
    const parts = name.split('.')
    let current: TAnnotationsTree | AnnotationSpec | undefined = this.config.annotations
    for (const part of parts) {
      if (!current || isAnnotationSpec(current)) {
        return undefined
      }
      current = current[part]
    }
    return isAnnotationSpec(current) ? current : undefined
  }

  updateDependencies(docs: AnscriptDoc[]) {
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

  public nodes: SemanticNode[] = []

  update(text: string, debug = false) {
    this.cleanup()
    const rawTokens = tokenize(text, debug)
    const ni = new NodeIterator(rawTokens, []).move()
    this.nodes = runPipes([pipes.importPipe, pipes.type, pipes.interfaceType], ni)
    if (debug) {
      console.log(this.nodes.map(n => n.toString()).join('\n'))
    }
    this.semanticMessages = ni.getErrors()
    this.registerNodes(this.nodes)
  }

  cleanup() {
    this.exports.clear()
    this.registry.clear()
    this.importedDefs.clear()
    this.messages = []
    this.referred = []
    this.imports.clear()
    this._allMessages = undefined
    this.tokensIndex = new TokensIndex()
    this.blocksIndex = new BlocksIndex()
    this.resolvedAnnotations = []
  }

  private registerNodes(nodes: SemanticNode[]) {
    for (const node of nodes) {
      node.registerAtDocument(this)
      node.referredIdentifiers.forEach(t => {
        t.isReference = true
        this.referred.push(t)
        this.tokensIndex.add(t)
      })
    }
  }

  public resolvedAnnotations: Token[] = []

  registerAnnotation(mainToken: Token, args?: Token[]) {
    this.tokensIndex.add(mainToken)
    args?.forEach(a => this.tokensIndex.add(a))
    const annotationSpec = this.resolveAnnotation(mainToken.text.slice(1))
    if (annotationSpec) {
      this.registerMessages(annotationSpec.validate(mainToken, args || []))
      this.resolvedAnnotations.push(mainToken)
    } else {
      let severity: 0 | 1 | 2 = 0
      switch (this.config.unknownAnnotation) {
        case 'warn':
          severity = 2
          break
        case 'error':
          severity = 1
          break
        default:
      }
      if (severity > 0) {
        this.registerMessage(
          mainToken,
          `Unknown annotation "${mainToken.text}"`,
          severity as 1,
          'dim'
        )
      }
    }
  }

  unwindType(
    name: string,
    chain: string[] | Token[] = []
  ):
    | {
        doc: AnscriptDoc
        node?: SemanticNode
        def: SemanticNode
      }
    | undefined {
    const decl = this.getDeclarationOwnerNode(name)
    if (!decl) {
      return undefined
    }
    let node: SemanticNode | undefined
    let def: SemanticNode | undefined = decl.node
    let doc = decl.doc
    const resolveRef = () => {
      if (isRef(def)) {
        const d = doc.unwindType(def.token('identifier')!.text, def.chain)
        doc = d?.doc || doc
        def = d?.def
      }
    }
    const resolveType = () => {
      while (isType(def)) {
        def = def.getDefinition()
        node = def
        resolveRef()
      }
    }
    resolveType()
    if (!def) {
      return undefined
    }
    for (const item of chain) {
      const itemText = typeof item === 'string' ? item : item.text
      // const token = item instanceof Token ? item : undefined
      if (!def) {
        return undefined
      }
      if (isProp(def)) {
        if (def.nestedProps?.get(itemText)) {
          def = def.nestedProps.get(itemText)
        } else {
          def = def.nestedType
          resolveRef()
          resolveType()
          if (isStructure(def) || isInterface(def)) {
            def = def.props.get(itemText)
          }
        }
      } else if (isStructure(def) || isInterface(def)) {
        def = def.props.get(itemText)
      }
    }
    while (isProp(def)) {
      node = def
      def = def.getDefinition()
      resolveRef()
      resolveType()
    }

    return def ? { def, doc, node } : undefined
  }

  getUsageListAt(line: number, character: number) {
    const token = this.tokensIndex.at(line, character)
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
      // eslint-disable-next-line max-statements-per-line
    }
    if (isProp(token.parentNode)) {
      // todo[2025-12-31]: find usages for props
    } else {
      const defForToken = this.getDefinitionFor(token)
      if (defForToken?.token?.isDefinition && defForToken.doc) {
        return defForToken.doc.usageListFor(defForToken.token)
      }
    }
    return undefined
  }

  getDefinitionFor(token: Token): { uri: string; doc?: AnscriptDoc; token?: Token } | undefined {
    if (token.isDefinition && !token.imported) {
      return { uri: this.id, doc: this, token }
    }
    if (token.fromPath) {
      const absolutePath = resolveAnscriptFromPath(token.fromPath, this.id)

      return { uri: absolutePath, doc: this.dependenciesMap.get(absolutePath), token }
    }
    if (
      (token.isReference || token.imported) &&
      this.importedDefs.has(token.text) &&
      this.dependenciesMap.size > 0
    ) {
      const from = this.importedDefs.get(token.text)!.text
      const absolutePath = resolveAnscriptFromPath(from, this.id)
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
    const token = this.tokensIndex.at(line, character)
    if (token) {
      if (token.isChain && isRef(token.parentNode) && typeof token.index === 'number') {
        const id = token.parentNode.id!
        const unwound = this.unwindType(id, token.parentNode.chain.slice(0, token.index))
        if (unwound?.node) {
          return [
            {
              targetUri: unwound.doc.id,
              targetRange: unwound.node.token('identifier')?.range ?? zeroRange,
              targetSelectionRange: unwound.node.token('identifier')?.range ?? zeroRange,
              originSelectionRange: token.range,
            },
          ]
        }
      } else {
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
  }

  registerImport({ from, imports, block }: { from: Token; imports: Token[]; block: Token }) {
    const importId = resolveAnscriptFromPath(from.text, this.id)
    this.imports.set(importId, { from, imports })
    this.blocksIndex.add(block)
    block.blockType = 'import'
    block.fromPath = from.text
    imports.forEach(t => {
      t.imported = true
      t.fromPath = from.text
      this.registerDefinition(t, true)
      this.tokensIndex.add(t)
      this.tokensIndex.add(from)
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
      this.tokensIndex.add(token)
      this.registry.registerDefinition(token)
    }
  }

  getDeclarationOwnerNode(identifier: string):
    | {
        doc: AnscriptDoc
        node?: SemanticNode
        token?: Token
      }
    | undefined {
    if (this.config.primitives?.has(identifier)) {
      return {
        doc: this,
        node: this.config.primitives.get(identifier),
      }
    }
    const def = this.registry.definitions.get(identifier)
    if (def?.imported && def.fromPath) {
      const absolutePath = resolveAnscriptFromPath(def.fromPath, this.id)
      const doc = this.dependenciesMap.get(absolutePath)
      return doc?.getDeclarationOwnerNode(identifier)
    } else if (!def?.imported) {
      return def
        ? {
            doc: this,
            node: def.parentNode,
            token: def,
          }
        : undefined
    }
  }

  registerExport(node: SemanticNode) {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (node.id) {
      this.exports.set(node.id, node)
    }
  }

  // eslint-disable-next-line max-params
  registerMessage(token: Token, message: string, severity: TSeverity = 1, tag?: 'dim' | 'crossed') {
    if (this._allMessages) {
      this._allMessages = undefined
    }
    this.messages.push({
      severity,
      message,
      range: token.range,
      tags: tag === 'dim' ? [1] : tag === 'crossed' ? [2] : [],
    })
  }

  registerMessages(messages?: TMessages) {
    if (messages) {
      this.messages.push(...messages)
    }
  }

  private _allMessages = undefined as TMessages | undefined

  clearMessages() {
    this._allMessages = undefined
  }

  getUnusedTokens() {
    const refSet = new Set<string>(this.referred.filter(r => !r.imported).map(r => r.text))
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
        ...this.registry.getErrors(),
        ...this.semanticMessages,
        ...this.messages,
      ] as TMessages
      for (const t of this.referred) {
        if (!this.registry.isDefined(t)) {
          this._allMessages.push({
            severity: 1,
            message: `Unknown identifier "${t.text}"`,
            range: t.range,
          })
          continue
        }
        if (isRef(t.parentNode) && t.parentNode.hasChain) {
          const length = t.parentNode.chain.length - 1
          for (let i = length; i >= 0; i--) {
            const token = t.parentNode.chain[i]
            const decl = this.unwindType(t.parentNode.id!, t.parentNode.chain.slice(0, i + 1))
            if (!decl?.def) {
              this._allMessages.push({
                severity: 1,
                message: `Unknown member "${token.text}"`,
                range: token.range,
              })
            }
          }
        }
      }
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

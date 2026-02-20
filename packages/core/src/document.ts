// eslint-disable max-lines
/* eslint-disable @typescript-eslint/no-confusing-void-expression */
/* eslint-disable max-depth */
/* eslint-disable sonarjs/cognitive-complexity */
/* eslint-disable complexity */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { resolveAnnotation } from './annotations'
import type { TAnnotationsTree } from './config'
import { IdRegistry } from './parser/id-registry'
import { NodeIterator } from './parser/iterator'
import type { SemanticNode, TAnnotationTokens } from './parser/nodes'
import {
  SemanticGroup,
  SemanticPropNode,
  SemanticRefNode,
  SemanticStructureNode,
} from './parser/nodes'
import {
  isAnnotate,
  isGroup,
  isInterface,
  isPrimitive,
  isProp,
  isRef,
  isStructure,
  isType,
} from './parser/nodes'
import type { SemanticAnnotateNode } from './parser/nodes/annotate-node'
import type { SemanticPrimitiveNode } from './parser/nodes/primitive-node'
import { pipes } from './parser/pipes'
import { runPipes } from './parser/pipes/core.pipe'
import { Token } from './parser/token'
import type { TMessages } from './parser/types'
import { TSeverity } from './parser/types'
import { resolveAtscriptFromPath } from './parser/utils'
import type { PluginManager } from './plugin/plugin-manager'
import type { TAtscriptPlugin, TAtscriptRenderFormat } from './plugin/types'
import { BlocksIndex } from './token-index/blocks-index'
import { TokensIndex } from './token-index/tokens-index'
import type { ITokensIndex } from './token-index/types'
import { tokenize } from './tokenizer'

export interface TAtscriptDocConfig {
  primitives?: Map<string, SemanticPrimitiveNode>
  annotations?: TAnnotationsTree
  unknownAnnotation?: 'allow' | 'warn' | 'error'
  plugins?: TAtscriptPlugin[]
}

export class AtscriptDoc {
  constructor(
    public readonly id: string,
    public readonly config: TAtscriptDocConfig,
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
  public readonly dependencies = new Set<AtscriptDoc>()

  /**
   * Set of documents that depend on this document
   */
  public readonly dependants = new Set<AtscriptDoc>()

  /**
   * List of tokens that refer to some type or interface
   */
  public referred = [] as Token[]

  /**
   * Map of dependencies (documents) by URI
   */
  public readonly dependenciesMap = new Map<string, AtscriptDoc>()

  get primitives() {
    return Array.from(this.config.primitives?.values() ?? [])
  }

  async render(format: TAtscriptRenderFormat) {
    return this.manager?.render(this, format)
  }

  resolveAnnotation(name: string) {
    return resolveAnnotation(name, this.config.annotations)
  }

  updateDependencies(docs: AtscriptDoc[]) {
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
  private _text: string = ''
  get text() {
    return this._text
  }

  update(text: string, debug = false) {
    this._text = text
    this.cleanup()
    const rawTokens = tokenize(text, debug)
    const ni = new NodeIterator(rawTokens, []).move()
    this.nodes = runPipes(
      [pipes.importPipe, pipes.type, pipes.interfaceType, pipes.annotatePipe],
      ni
    )
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
    this.annotations = []
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
  public annotations: TAnnotationTokens[] = []

  registerAnnotation(annotationTokens: TAnnotationTokens) {
    this.annotations.push(annotationTokens)
    const mainToken = annotationTokens.token
    const args = annotationTokens.args
    this.tokensIndex.add(mainToken)
    args?.forEach(a => this.tokensIndex.add(a))
    const annotationSpec = this.resolveAnnotation(mainToken.text.slice(1))
    if (annotationSpec) {
      this.registerMessages(annotationSpec.validate(mainToken, args || [], this))
      annotationSpec.modify(mainToken, args || [], this)
      this.resolvedAnnotations.push(mainToken)
    } else {
      let severity: 0 | 1 | 2 = 0
      switch (this.config.unknownAnnotation) {
        case 'warn': {
          severity = 2
          break
        }
        case 'error': {
          severity = 1
          break
        }
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
    0
  }

  /**
   * Recursively resolves a type reference (and any property chain) to find the final underlying definition.
   *
   * This method performs a **multi-step** resolution:
   *  1. Locates the declaration owner of the type (via `getDeclarationOwnerNode`).
   *  2. Follows references, type aliases, or nested property chains:
   *     - For “Ref” nodes, it uses the identifier to look up the next type.
   *     - For “Type” nodes, it calls `getDefinition()` to move to the underlying structure.
   *     - For property chains (`chain`), it navigates nested properties or nested types,
   *       resolving each level until the final type is reached.
   *
   * @param {string} name - The name of the type or identifier to resolve.
   * @param {Array<string | Token>} [chain=[]] - An optional chain of properties or tokens, each of which
   *  refines the path to the final type (e.g., for `SomeType.prop1.prop2`, `chain` might be `[ "prop1", "prop2" ]`).
   * @returns {Object | undefined} An object containing:
   *   - `doc`: The `AtscriptDoc` where the final definition is located.
   *   - `node`: The last encountered `SemanticNode` before reaching the final underlying definition (often a `Prop` node).
   *   - `def`: The final resolved `SemanticNode`.
   *
   * If the type cannot be resolved or does not exist, returns `undefined`.
   */
  unwindType(
    name: string,
    chain: string[] | Token[] = [],
    watchCb?: (def: SemanticNode) => void,
    _tracked?: Set<SemanticNode>
  ):
    | {
        doc: AtscriptDoc
        node?: SemanticNode
        def: SemanticNode
      }
    | undefined {
    const tracked = _tracked || new Set()
    const decl = this.getDeclarationOwnerNode(name)
    if (!decl) {
      return undefined
    }
    const callCb = watchCb
      ? () => {
          if (
            def &&
            !tracked.has(def) &&
            ['type', 'primitive', 'prop', 'interface'].includes(def.entity)
          ) {
            // tracking all the nodes while unwinding
            // so we can gather annotations to merge
            tracked.add(def)
            watchCb(def)
          }
        }
      : () => {}
    let node: SemanticNode | undefined
    let def: SemanticNode | undefined = decl.node
    let doc = decl.doc
    const resolveRef = () => {
      if (isRef(def)) {
        const d = doc.unwindType(def.token('identifier')!.text, def.chain, watchCb, tracked)
        doc = d?.doc || doc
        def = d?.def
      }
    }
    const resolveType = () => {
      while (isType(def)) {
        callCb() // collection type on our way
        def = def.getDefinition()
        node = def
        resolveRef()
      }
    }
    resolveType()
    if (!def) {
      return undefined
    }
    // Non-mutating annotate is an alias for the target interface
    if (isAnnotate(def)) {
      return doc.unwindType(def.targetName, chain, watchCb, tracked)
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
      } else if (isStructure(def) || isInterface(def) || isPrimitive(def)) {
        def = def.props.get(itemText)
      }
    }
    if (_tracked) {
      callCb() // collecting one more item in chain
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

  evalAnnotationsForNode(givenNode: SemanticNode) {
    let right = givenNode.annotations
    let def = givenNode.getDefinition()
    if (def) {
      if (isRef(def)) {
        const unwound = this.unwindType(def.token('identifier')!.text, def.chain, intermediate => {
          if (intermediate?.annotations) {
            right = this.mergeNodesAnnotations(intermediate.annotations, right)
          }
        })
        def = unwound?.def || def
      }
      if (def) {
        const merged = this.mergeIntersection(def)
        right = this.mergeNodesAnnotations(merged.annotations, right)
      }
    }
    return right
  }

  /**
   * Collects ad-hoc annotations from all `annotate` blocks targeting a given type/interface.
   * Returns a map of property path (dot-joined) → annotations array.
   * For entries without a chain (root-level), the key is the entry identifier.
   */
  getAnnotateNodesFor(targetName: string): SemanticAnnotateNode[] {
    const result: SemanticAnnotateNode[] = []
    for (const node of this.nodes) {
      if (isAnnotate(node) && node.targetName === targetName) {
        result.push(node)
      }
    }
    return result
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

  /**
   * Retrieves the definition (i.e., the “go to definition” target) for a given token.
   *
   * This method provides a **single-step** resolution of the defining token:
   *  - If the token is defined in the same document, returns that definition.
   *  - If the token is imported, follows the import to return the defining token from the relevant document.
   *  - If the token is a reference to a locally defined identifier, retrieves the local definition.
   *
   * @param {Token} token - The token for which to locate the definition.
   * @returns {Object | undefined} An object containing:
   *   - `uri`: The file path (URI) of the document where the definition is found.
   *   - `doc`: The `AtscriptDoc` instance that owns the definition (if found).
   *   - `token`: The defining token itself (if found).
   *
   * If no definition is found, returns `undefined`.
   */
  getDefinitionFor(token: Token): { uri: string; doc?: AtscriptDoc; token?: Token } | undefined {
    if (token.isDefinition && !token.imported) {
      return { uri: this.id, doc: this, token }
    }
    if (token.fromPath) {
      const absolutePath = resolveAtscriptFromPath(token.fromPath, this.id)

      return { uri: absolutePath, doc: this.dependenciesMap.get(absolutePath), token }
    }
    if (
      (token.isReference || token.imported) &&
      this.importedDefs.has(token.text) &&
      this.dependenciesMap.size > 0
    ) {
      const from = this.importedDefs.get(token.text)!.text
      const absolutePath = resolveAtscriptFromPath(from, this.id)
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
      // Annotate entry refs resolve through the target interface
      const block = this.blocksIndex.at(line, character)
      if (
        block?.blockType === 'annotate' &&
        isAnnotate(block.parentNode) &&
        isRef(token.parentNode)
      ) {
        const targetName = block.parentNode.targetName
        const entryRef = token.parentNode
        // Build chain: [entryId, ...chainUpToToken] for chains, or [tokenText] for identifiers
        const chain: string[] =
          token.isChain && typeof token.index === 'number'
            ? [entryRef.id!, ...entryRef.chain.slice(0, token.index).map(c => c.text)]
            : [token.text]
        const unwound = this.unwindType(targetName, chain)
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
        return undefined
      }
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
    const importId = resolveAtscriptFromPath(from.text, this.id)
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

  /**
   * Finds the owning document and semantic node responsible for declaring a given identifier.
   *
   * This method checks:
   * 1. Whether the identifier is a known primitive (from this document’s config).
   * 2. If there's a local definition in this document's registry.
   *    - If the definition is imported, it resolves the `fromPath`, locates the correct `AtscriptDoc`
   *      in the dependency map, and recursively tries to get the declaration owner there.
   *    - If the definition is local (not imported), it returns the current document (`this`) along with
   *      the parent node that owns the definition and the token itself.
   *
   * @param {string} identifier - The name/identifier whose declaring node should be found.
   * @returns {{ doc: AtscriptDoc; node?: SemanticNode; token?: Token } | undefined} An object containing:
   *  - `doc`: The `AtscriptDoc` in which the identifier was ultimately declared.
   *  - `node`: The parent `SemanticNode` that defines or owns the declaration (if applicable).
   *  - `token`: The specific token for the declaration (if applicable).
   *
   * If no declaration is found, returns `undefined`.
   */
  getDeclarationOwnerNode(identifier: string):
    | {
        doc: AtscriptDoc
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
      const absolutePath = resolveAtscriptFromPath(def.fromPath, this.id)
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

  renderDiagMessage(m: TMessages[number], addSourceLinses = false, colors = false) {
    const c = {
      red: colors ? __DYE_RED__ : '',
      blue: colors ? __DYE_BLUE__ : '',
      cyan: colors ? __DYE_CYAN__ : '',
      yellow: colors ? __DYE_YELLOW__ : '',
      dim: colors ? __DYE_DIM__ : '',
      reset: colors ? __DYE_RESET__ : '',
    }
    let sc = ''
    let banner = '[atscript]'
    switch (m.severity) {
      case TSeverity.Error: {
        sc = c.red
        banner += '[Error]'
        break
      }
      case TSeverity.Warning: {
        sc = c.yellow
        banner += '[Warning]'
        break
      }
      case TSeverity.Info: {
        sc = ''
        banner += '[Info]'
        break
      }
      case TSeverity.Hint: {
        sc = c.dim
        banner += '[Hint]'
        break
      }
      default: {
        sc = ''
      }
    }
    const n = m.range.start.line + 1
    let out =
      `\n${sc}${banner} ${m.message}${c.reset}` +
      `\nin ${c.blue}${this.id}:${n}:${m.range.start.character + 1}${c.reset}`

    if (addSourceLinses) {
      const lines = this.text.split('\n')
      const renderLines = [
        { l: lines[n - 3], i: n - 3 },
        { l: lines[n - 2], i: n - 2 },
        { l: lines[n - 1], i: n - 1 },
      ].filter(Boolean)
      const nl = String(n).length + 1
      for (const { l, i } of renderLines) {
        const prefix = `${c.dim + c.cyan}${`0${i}`.slice(-nl)} | ${c.reset}`
        out += `\n${prefix}${l}${c.reset}`
      }
      out += `\n${' '.repeat(nl + 3 + m.range.start.character)}${c.red}${'^'.repeat(
        m.range.end.character - m.range.start.character
      )}${c.reset}`
    }
    return `${out}\n`
  }

  getDiagMessages() {
    if (!this._allMessages) {
      this._allMessages = [
        ...this.registry.getErrors(),
        ...this.semanticMessages,
        ...this.messages,
      ] as TMessages
      for (const t of this.referred) {
        // Annotate entry refs resolve through the target interface
        // e.g. `annotate User { firstName }` → validates firstName as User.firstName
        const block = this.blocksIndex.at(t.range.start.line, t.range.start.character)
        if (block?.blockType === 'annotate' && isAnnotate(block.parentNode)) {
          const targetName = block.parentNode.targetName
          if (!this.registry.isDefined(targetName)) {
            continue // target itself is unknown, already reported separately
          }
          const chain =
            isRef(t.parentNode) && t.parentNode.hasChain
              ? [t.text, ...t.parentNode.chain.map(c => c.text)]
              : [t.text]
          const unwound = this.unwindType(targetName, chain)
          // unwindType may return the group node itself when it can't resolve
          // the chain through a union/intersection — treat that as unresolved
          const chainResolved = unwound?.def && !isGroup(unwound.def)
          if (!chainResolved && !this.resolveChainWithMerge(targetName, chain)) {
            const lastToken =
              chain.length > 1 && isRef(t.parentNode)
                ? t.parentNode.chain[t.parentNode.chain.length - 1] || t
                : t
            this._allMessages.push({
              severity: 1,
              message: `Unknown property "${chain.join('.')}" in "${targetName}"`,
              range: lastToken.range,
            })
          } else if (isRef(t.parentNode) && t.parentNode.hasChain) {
            // Also validate intermediate chain members
            const length = t.parentNode.chain.length - 1
            for (let i = length; i >= 0; i--) {
              const token = t.parentNode.chain[i]
              const memberChain = [t.text, ...t.parentNode.chain.slice(0, i + 1).map(c => c.text)]
              const decl = this.unwindType(targetName, memberChain)
              const memberResolved = decl?.def && !isGroup(decl.def)
              if (!memberResolved && !this.resolveChainWithMerge(targetName, memberChain)) {
                this._allMessages.push({
                  severity: 1,
                  message: `Unknown property "${memberChain.join('.')}" in "${targetName}"`,
                  range: token.range,
                })
              }
            }
          }
          continue
        }
        if (!this.registry.isDefined(t)) {
          this._allMessages.push({
            severity: 1,
            message: `Unknown identifier "${t.text}"`,
            range: t.range,
          })
          continue
        }
        if (isRef(t.parentNode)) {
          const def = this.unwindType(t.parentNode.id!, t.parentNode.chain)?.def
          if (isPrimitive(def) && !def.config.type) {
            // disallow using primitives with undefined type
            const token = t.parentNode.chain[t.parentNode.chain.length - 1] || t
            this._allMessages.push({
              severity: 1,
              message: 'Invalid type',
              range: token.range,
            })
          }
          if (isPrimitive(def) && def.config.isContainer) {
            // container primitives must be used with an extension (e.g. ui.action, not ui)
            this._allMessages.push({
              severity: 1,
              message: `"${t.parentNode.id!}${t.parentNode.hasChain ? `.${t.parentNode.chain.map(c => c.text).join('.')}` : ''}" is a container type — use one of its extensions`,
              range: t.range,
            })
          }
          if (t.parentNode.hasChain) {
            // check for unknown members in chain
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
    }
    return this._allMessages
  }

  /**
   * Walks a property chain step-by-step, applying mergeIntersection at each
   * level. Mirrors the completion logic in the LSP server so that intersection
   * types like `{ a: string } & { b: number }` are handled correctly.
   */
  private resolveChainWithMerge(targetName: string, chain: string[]): boolean {
    let def: SemanticNode | undefined = this.unwindType(targetName)?.def
    if (!def) {
      return false
    }
    for (const prop of chain) {
      def = this.mergeIntersection(def)
      if (isProp(def)) {
        const inner = def.getDefinition()
        if (inner) {
          def = this.mergeIntersection(inner)
        }
      }
      if (isStructure(def) || isInterface(def)) {
        const next = def.props.get(prop)
        if (!next) {
          return false
        }
        def = next.getDefinition() || next
      } else if (isGroup(def)) {
        // Search union/intersection items for the prop
        const found = this.findPropInGroup(def as SemanticGroup, prop)
        if (!found) {
          return false
        }
        def = found
      } else {
        return false
      }
    }
    return true
  }

  private findPropInGroup(group: SemanticGroup, propName: string): SemanticNode | undefined {
    for (const item of group.unwrap()) {
      const merged = this.mergeIntersection(item)
      if (isStructure(merged) || isInterface(merged)) {
        const prop = merged.props.get(propName)
        if (prop) {
          return prop.getDefinition() || prop
        }
      }
      if (isGroup(merged)) {
        const found = this.findPropInGroup(merged as SemanticGroup, propName)
        if (found) {
          return found
        }
      }
    }
    return undefined
  }

  mergeIntersection(node: SemanticNode): SemanticNode {
    if (!isGroup(node)) {
      return node
    }
    if (node.op !== '&') {
      return node
    }
    const nodes = node.unwrap()
    if (nodes.length === 0) {
      return node
    }
    if (nodes.length === 1) {
      return nodes[0]
    }
    const newGroup = [] as SemanticNode[]
    let left = nodes[0]
    for (let i = 1; i < nodes.length; i++) {
      const right = nodes[i]
      const merged = this.mergeDefs(left, right)
      if (merged.length === 2) {
        left = merged[1]
        newGroup.push(merged[0])
      } else {
        left = merged[0]
      }
    }
    newGroup.push(left)
    if (newGroup.length > 1) {
      const newNode = new SemanticGroup(newGroup, '&')
      return newNode
    } else {
      return newGroup[0]
    }
  }

  mergeDefs(
    _left: SemanticNode,
    _right: SemanticNode
  ): [SemanticNode] | [SemanticNode, SemanticNode] {
    let left: SemanticNode | undefined = _left
    let right: SemanticNode | undefined = _right
    if (isRef(left)) {
      left = this.unwindType(left.id!, left.chain)?.def
    }
    if (isRef(right)) {
      right = this.unwindType(right.id!, right.chain)?.def
    }
    if (!left || !right) {
      return [_left, _right]
    }
    if (isPrimitive(left) && isPrimitive(right)) {
      // todo: properly merge primitives
      if (left.config.type === right.config.type) {
        return [left]
      }
      const never = new SemanticRefNode()
      never.saveToken(
        new Token({
          text: 'never',
          type: 'identifier',
          getRange: () => zeroRange,
        }),
        'identifier'
      )
      return [never]
    }
    if ((isStructure(left) || isInterface(left)) && (isStructure(right) || isInterface(right))) {
      // merging objects
      const mergedProps: SemanticPropNode[] = []
      const allProps = new Set([...left.props.keys(), ...right.props.keys()])
      for (const key of allProps) {
        const leftProp = left.props.get(key)
        const rightProp = right.props.get(key)
        let mergedDef: SemanticNode
        if (leftProp && rightProp) {
          const grp = new SemanticGroup(
            [leftProp.getDefinition()!, rightProp.getDefinition()!],
            '&'
          )
          mergedDef = this.mergeIntersection(grp)
        } else {
          const oldProp = (leftProp || rightProp)!
          mergedDef = this.mergeIntersection(oldProp.getDefinition()!)
        }
        const prop = new SemanticPropNode()
        prop.saveToken((leftProp || rightProp)!.token('identifier')!, 'identifier')
        if (isPrimitive(mergedDef)) {
          const name = mergedDef.id!
          mergedDef = new SemanticRefNode()
          mergedDef.saveToken(
            new Token({
              text: name,
              type: 'identifier',
              getRange: () => zeroRange,
            }),
            'identifier'
          )
        }
        prop.define(mergedDef)
        prop.annotations = this.mergeNodesAnnotations(leftProp?.annotations, rightProp?.annotations)
        const oldProps = [leftProp, rightProp].filter(Boolean) as SemanticPropNode[]
        let optionalToken = oldProps[0]?.token('optional')
        for (const oldProp of oldProps) {
          if (!oldProp.token('optional')) {
            optionalToken = undefined
            break
          }
        }
        if (optionalToken) {
          prop.saveToken(optionalToken, 'optional')
        }
        mergedProps.push(prop)
      }
      const mergedStructure = new SemanticStructureNode()
      mergedStructure.setProps(mergedProps)
      this.resolveAnnotation
      mergedStructure.annotations = this.mergeNodesAnnotations(left.annotations, right.annotations)
      return [mergedStructure]
    }
    // all other cases are not supported, returning never
    const never = new SemanticRefNode()
    never.saveToken(
      new Token({
        text: 'never',
        type: 'identifier',
        getRange: () => zeroRange,
      }),
      'identifier'
    )
    return [never]
  }

  /**
   * Merges two arrays of annotation tokens, ensuring that annotations from the
   * `right` array take precedence over those from the `left` array.
   *
   * - Annotations from `right` are always included.
   * - Annotations from `left` are included only if they are not already present in `right`.
   * - This ensures that if an annotation exists in both arrays, the one from `right` is kept.
   *
   * @param left - An optional array of annotation tokens to merge (lower priority).
   * @param right - An optional array of annotation tokens to merge (higher priority).
   * @returns A merged array of annotation tokens, preserving order while preventing duplicates.
   */
  mergeNodesAnnotations(left?: TAnnotationTokens[], right?: TAnnotationTokens[]) {
    const annotations = [] as TAnnotationTokens[]
    const savedAnnotations = new Set<string>()

    // Add annotations from the right array first (higher priority)
    for (const a of right || []) {
      annotations.push(a)
      savedAnnotations.add(a.name)
    }

    // Add annotations from the left array only if they are not already in the set
    for (const a of left || []) {
      const spec = this.resolveAnnotation(a.name)
      const append = spec && spec.config.multiple && spec.config.mergeStrategy === 'append'
      if (append || !savedAnnotations.has(a.name)) {
        annotations.push(a)
      }
    }

    return annotations
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

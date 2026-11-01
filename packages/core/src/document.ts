// eslint-disable max-lines
/* eslint-disable @typescript-eslint/no-confusing-void-expression */
/* eslint-disable max-depth */
/* eslint-disable sonarjs/cognitive-complexity */
/* eslint-disable complexity */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { isBacktickArgType, resolveAnnotation } from './annotations'
import type { AnnotationSpec } from './annotations'
import type { TAnnotationsTree } from './config'
import {
  getQueryScope,
  getDeclaredValue,
  resolveFieldPathArgSegments,
  resolveFieldRefAt,
} from './lsp/field-refs'
import { IdRegistry } from './parser/id-registry'
import { NodeIterator } from './parser/iterator'
import type { SemanticNode, TAnnotationTokens } from './parser/nodes'
import {
  SemanticArrayNode,
  SemanticGroup,
  SemanticPropNode,
  SemanticRefNode,
  SemanticStructureNode,
  SemanticTupleNode,
} from './parser/nodes'
import {
  isAnnotate,
  isArray,
  isConst,
  isGroup,
  isInterface,
  isPrimitive,
  isProp,
  isQueryFieldRef,
  isRef,
  isStructure,
  isTuple,
  isType,
} from './parser/nodes'
import { entryParts, type SemanticAnnotateNode } from './parser/nodes/annotate-node'
import type { SemanticInterfaceNode } from './parser/nodes/interface-node'
import type { SemanticPrimitiveNode } from './parser/nodes/primitive-node'
import { pipes } from './parser/pipes'
import { runPipes } from './parser/pipes/core.pipe'
import { parseBacktickArg } from './parser/pipes/expr.pipe'
import { Token } from './parser/token'
import type { TMessages } from './parser/types'
import { TSeverity } from './parser/types'
import { getRelPath, resolveAtscriptFromPath } from './parser/utils'
import type { PluginManager } from './plugin/plugin-manager'
import type { TAtscriptPlugin, TAtscriptRenderFormat } from './plugin/types'
import {
  MERGE_TOO_COMPLEX,
  NOTHING_IN_COMMON,
  StructureModel,
  UNION_IN_RECURSIVE_MERGE,
} from './structure'
import { BlocksIndex } from './token-index/blocks-index'
import { TokensIndex } from './token-index/tokens-index'
import type { ITokensIndex } from './token-index/types'
import { tokenize } from './tokenizer'
import type { TCommentSpan } from './tokenizer'
import type { TLexicalToken } from './tokenizer/types'

/**
 * Caches of resolutions (they read other documents): dropped whenever a document changes, and
 * when a recording of the documents read starts (see {@link recordDocumentReads}).
 */
let caches: ReturnType<typeof newCaches> | undefined

function newCaches() {
  return {
    /** The merge of each intersection (see `AtscriptDoc.mergeIntersection`). */
    merged: new WeakMap<SemanticNode, SemanticNode>(),
    /** Merges building new nodes, by their operands (see {@link memoMerge}). */
    merges: new WeakMap<SemanticNode, Map<SemanticNode, TMergeResult>>(),
    /** The type each `annotate … as` alias stands for (see `AtscriptDoc.aliasDefinition`). */
    aliases: new WeakMap<SemanticNode, SemanticNode | undefined>(),
    /** The declaration each reference names (see `AtscriptDoc.resolveRefOwner`). */
    refOwners: new WeakMap<SemanticNode, unknown>(),
    /** What each reference unwinds to (see `AtscriptDoc.unwindRef`). */
    unwound: new WeakMap<SemanticNode, unknown>(),
  }
}

function cache(): ReturnType<typeof newCaches> {
  return (caches ??= newCaches())
}

function resetCaches(): void {
  caches = undefined
}

type TMergeResult = [SemanticNode] | [SemanticNode, SemanticNode]

/**
 * The merge of definitions `left` and `right` that builds new nodes (arrays of an intersection,
 * a distributed union), built once: the same nodes every time.
 */
function memoMerge(
  left: SemanticNode,
  right: SemanticNode,
  merge: () => TMergeResult
): TMergeResult {
  let byRight = cache().merges.get(left)
  if (!byRight) {
    byRight = new Map()
    cache().merges.set(left, byRight)
  }
  let result = byRight.get(right)
  if (!result) {
    result = merge()
    byRight.set(right, result)
  }
  return result
}

/** The intersections being merged (see `AtscriptDoc.mergeIntersection`): re-entered, kept. */
const merging = new Set<SemanticNode>()

/** `node` is an intersection (`A & B`). */
function isIntersection(node?: SemanticNode): node is SemanticGroup {
  return isGroup(node) && node.op === '&'
}

/** The chained references being unwound (see `AtscriptDoc.unwindType`). */
const unwinding = new Set<string>()
/** Whether an unwinding met a chain reaching itself (see `AtscriptDoc.unwindType`). */
let circularChain = false
/** Whether an unwinding met an alias reaching itself (see `AtscriptDoc.unwindType`). */
let circularAlias = false
const chainNodeIds = new WeakMap<object, number>()
let nextChainNodeId = 0

/** A key of chain `chain` from declaration `node`. */
function chainKey(node: SemanticNode | undefined, chain: string[] | Token[]): string {
  let id = node ? chainNodeIds.get(node) : -1
  if (id === undefined) {
    id = nextChainNodeId++
    chainNodeIds.set(node!, id)
  }
  return `${id}\0${chain.map(c => (typeof c === 'string' ? c : c.text)).join('.')}`
}

/** The active recordings of the documents read (see {@link recordDocumentReads}). */
const readers = new Set<Set<AtscriptDoc>>()

/**
 * The documents a document imports, by id: every document a resolution reads (a type of
 * another document, through its importer's map) is recorded by the active recordings.
 */
class DependenciesMap extends Map<string, AtscriptDoc> {
  override get(id: string): AtscriptDoc | undefined {
    const doc = super.get(id)
    if (doc && readers.size > 0) {
      recordRead(doc)
    }
    return doc
  }
}

/** Records `doc` as read by the active recordings (see {@link recordDocumentReads}). */
function recordRead(doc: AtscriptDoc): void {
  for (const read of readers) {
    read.add(doc)
  }
}

/**
 * Starts recording the documents read by resolutions (a type, an annotation, a definition of
 * another document — directly or through other documents): what is derived meanwhile depends
 * on them only (besides the documents read directly). Recordings may overlap (asynchronous
 * work interleaving): each records every read while it is active, so none misses one. The
 * caches are dropped first (a resolution cached earlier would skip the reads it made).
 * Call `stop()` to end it and get the documents.
 */
export function recordDocumentReads(): { stop: () => Set<AtscriptDoc> } {
  resetCaches()
  const read = new Set<AtscriptDoc>()
  readers.add(read)
  return {
    stop: () => {
      readers.delete(read)
      return read
    },
  }
}

/** Incremented on every change of a document (its text, or its imports). */
let epoch = 0

/** {@link AtscriptDoc.aliasedDeclaration}'s steps, with the epoch they were found at. */
const aliasSteps = new WeakMap<
  SemanticNode,
  { epoch: number; step: { doc: AtscriptDoc; node: SemanticNode } | undefined }
>()

/**
 * The current epoch of the documents: it changes whenever a document's text or imports change
 * (see `AtscriptDoc.changedSince`).
 */
export function documentsEpoch(): number {
  return epoch
}

/** The epoch {@link deepChanged} holds for, and the latest change of each document's imports. */
let deepEpoch = -1
let deepChanged = new WeakMap<AtscriptDoc, number>()

/**
 * The latest epoch at which `doc` or a document it imports (directly or not) changed: the
 * strongly connected components of the import graph (Tarjan, iterative), each the latest of its
 * documents' changes and of the components it imports — memoized until the next change.
 */
function deepChangedAt(doc: AtscriptDoc): number {
  if (deepEpoch !== epoch) {
    deepEpoch = epoch
    deepChanged = new WeakMap()
  }
  const known = deepChanged.get(doc)
  if (known !== undefined) {
    return known
  }
  const index = new Map<AtscriptDoc, number>()
  const low = new Map<AtscriptDoc, number>()
  /** The latest change seen from each document on the stack (its own, those it reaches). */
  const latest = new Map<AtscriptDoc, number>()
  const stack: AtscriptDoc[] = []
  const onStack = new Set<AtscriptDoc>()
  const frames: Array<{ doc: AtscriptDoc; next: Iterator<AtscriptDoc> }> = []
  const enter = (d: AtscriptDoc) => {
    index.set(d, index.size)
    low.set(d, index.get(d)!)
    latest.set(d, d.changedAtEpoch)
    stack.push(d)
    onStack.add(d)
    frames.push({ doc: d, next: d.dependencies[Symbol.iterator]() })
  }
  enter(doc)
  while (frames.length > 0) {
    const frame = frames.at(-1)!
    const step = frame.next.next()
    if (!step.done) {
      const next = step.value
      const decided = deepChanged.get(next)
      if (decided !== undefined) {
        latest.set(frame.doc, Math.max(latest.get(frame.doc)!, decided))
      } else if (!index.has(next)) {
        enter(next)
      } else if (onStack.has(next)) {
        low.set(frame.doc, Math.min(low.get(frame.doc)!, index.get(next)!))
        latest.set(frame.doc, Math.max(latest.get(frame.doc)!, latest.get(next)!))
      }
      continue
    }
    frames.pop()
    const d = frame.doc
    const parent = frames.at(-1)
    if (low.get(d) === index.get(d)) {
      // A component: the latest change of its documents and of what they reach.
      const component: AtscriptDoc[] = []
      let value = 0
      let member: AtscriptDoc
      do {
        member = stack.pop()!
        onStack.delete(member)
        component.push(member)
        value = Math.max(value, latest.get(member)!)
      } while (member !== d)
      for (const m of component) {
        deepChanged.set(m, value)
      }
      if (parent) {
        latest.set(parent.doc, Math.max(latest.get(parent.doc)!, value))
      }
    } else if (parent) {
      low.set(parent.doc, Math.min(low.get(parent.doc)!, low.get(d)!))
      latest.set(parent.doc, Math.max(latest.get(parent.doc)!, latest.get(d)!))
    }
  }
  return deepChanged.get(doc)!
}

/** `X | null` of the definitions of optional props (see `AtscriptDoc.orNullFor`). */
const nullableDefs = new WeakMap<SemanticNode, SemanticGroup>()

/** `node` is a union (`A | B`). */
function isUnion(node?: SemanticNode): node is SemanticGroup {
  return isGroup(node) && node.op === '|'
}

/**
 * The values a scalar definition (resolved: a primitive or a literal) is made of: a literal's
 * type, a primitive's final type (`decimal` is a string), `'never'` for `never`; `undefined`
 * when not a scalar, or not known (`phantom`, a primitive of a complex type).
 */
function scalarDomain(node?: SemanticNode): string | undefined {
  if (node?.entity === 'const') {
    return node.token('identifier')?.type === 'number' ? 'number' : 'string'
  }
  if (!isPrimitive(node)) {
    return undefined
  }
  if (node.id === 'never') {
    return 'never'
  }
  const type =
    typeof node.config.type === 'object' && node.config.type.kind === 'final'
      ? node.config.type.value
      : node.config.type
  switch (type) {
    case 'string':
    case 'decimal': {
      return 'string'
    }
    case 'number':
    case 'boolean':
    case 'null': {
      return type
    }
    case 'void': {
      return 'undefined'
    }
    default: {
      return undefined
    }
  }
}

/** `node` without the parentheses around it (`({ a: string })`: a group of one item). */
/** A new structure with the props of `struct` (shared: their owner stays `struct`). */
function copyStructure(struct: SemanticStructureNode): SemanticStructureNode {
  const copy = new SemanticStructureNode()
  ;(copy as unknown as { nodes: SemanticNode[] }).nodes = struct.unwrap()
  for (const [name, prop] of struct.props) {
    copy.props.set(name, prop)
  }
  copy.annotations = struct.annotations
  return copy
}

function unparenthesized(node: SemanticNode): SemanticNode {
  while (node.entity === 'group' && (node as SemanticGroup).unwrap().length === 1) {
    node = (node as SemanticGroup).unwrap()[0]
  }
  return node
}

/** `node` is the `phantom` primitive (resolved). */
function isPhantomPrimitive(node?: SemanticNode): boolean {
  return isPrimitive(node) && node.config.type === 'phantom'
}

/** `node` is a primitive or a literal (resolved). */
function isScalar(node?: SemanticNode): boolean {
  return isPrimitive(node) || isConst(node)
}

/** A literal's value (a number literal's number: `1` and `1.0` are the same). */
function constValue(node: SemanticNode): string | number {
  const id = node.id!
  return node.token('identifier')?.type === 'number' ? Number(id) : id
}

/** Whether scalars `a` and `b` (resolved) certainly have no value in common. */
function scalarsDisjoint(a: SemanticNode, b: SemanticNode): boolean {
  const da = scalarDomain(a)
  const db = scalarDomain(b)
  if (da === 'never' || db === 'never') {
    return true
  }
  if (da === undefined || db === undefined) {
    return false
  }
  return da !== db || (isConst(a) && isConst(b) && constValue(a) !== constValue(b))
}

/**
 * Whether a primitive checks anything beyond the domain of its values: annotations (an
 * extension's built-in ones, `string.email`'s pattern) or a format of its own (`decimal`: a
 * string of digits).
 */
function primitiveChecks(node: SemanticPrimitiveNode): boolean {
  if ((node.annotations?.length ?? 0) > 0) {
    return true
  }
  const type =
    typeof node.config.type === 'object' && node.config.type.kind === 'final'
      ? node.config.type.value
      : node.config.type
  return type === 'decimal'
}

/**
 * Whether extension `ext` of primitive `base` checks all `base` checks: it inherits the base's
 * annotations, unless it redefines one (with another value).
 */
function extensionCovers(ext: SemanticPrimitiveNode, base: SemanticPrimitiveNode): boolean {
  const own = base.config.annotations ?? {}
  const inherited = ext.config.annotations ?? {}
  return Object.keys(own).every(
    k =>
      JSON.stringify(own[k as keyof typeof own]) ===
      JSON.stringify(inherited[k as keyof typeof inherited])
  )
}

/** A field a type path reaches (see `AtscriptDoc.unwindType`): its prop, its type, resolved. */
export interface TUnwoundField {
  /** The document `def` resolves in. */
  doc: AtscriptDoc
  /** The prop a path reaches (else the last node met before `def`). */
  node?: SemanticNode
  def: SemanticNode
}

/**
 * What `AtscriptDoc.unwindType` resolves a type path to: one field (or a type), or — through a
 * union, two or more fields — `fields`, with `def` the union of their types and no `node`.
 */
export interface TUnwound extends TUnwoundField {
  fields?: TUnwoundField[]
}

/** A position of a type path being walked (see `AtscriptDoc.unwindType`). */
interface TPathPosition {
  def: SemanticNode | undefined
  doc: AtscriptDoc
  node?: SemanticNode
}

export interface TAtscriptDocConfig {
  primitives?: Map<string, SemanticPrimitiveNode>
  annotations?: TAnnotationsTree
  unknownAnnotation?: 'allow' | 'warn' | 'error'
  plugins?: TAtscriptPlugin[]
  /** The project root of the config the document is read with (see `TAtscriptConfig`). */
  rootDir?: string
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
   * The messages of the last check of this document's imports (`"./b" not found`, no exported
   * member…): replaced by every check (see `AtscriptRepo.checkImports`), so a file created or
   * deleted since is reported anew, once.
   */
  public importMessages: TMessages = []

  /** Replaces {@link importMessages}; the diagnostics are computed again when they changed. */
  setImportMessages(messages: TMessages): void {
    if (messages.length === 0 && this.importMessages.length === 0) {
      return
    }
    if (JSON.stringify(messages) !== JSON.stringify(this.importMessages)) {
      this.importMessages = messages
      this.clearMessages()
    }
  }

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
   * Maps bare specifier placeholder IDs (bare:xxx.as) to resolved file:// URIs.
   * Populated during checkImport in AtscriptRepo.
   */
  public resolvedImports = new Map<string, string>()

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
   * List of query field ref nodes (for find-references support)
   */
  public queryFieldRefs = [] as Array<
    import('./parser/nodes/query-nodes').SemanticQueryFieldRefNode
  >

  /**
   * Field-path `string` annotation arguments whose spec declares `fieldScope`
   * (for find-references support)
   */
  public fieldPathArgs = [] as Token[]

  /**
   * Map of dependencies (documents) by URI
   */
  public readonly dependenciesMap: Map<string, AtscriptDoc> = new DependenciesMap()

  get primitives() {
    return Array.from(this.config.primitives?.values() ?? [])
  }

  async render(format: TAtscriptRenderFormat) {
    return this.manager?.render(this, format)
  }

  private readonly _annotationSpecCache = new Map<string, AnnotationSpec | undefined>()

  resolveAnnotation(name: string) {
    let spec = this._annotationSpecCache.get(name)
    if (spec === undefined && !this._annotationSpecCache.has(name)) {
      spec = resolveAnnotation(name, this.config.annotations)
      this._annotationSpecCache.set(name, spec)
    }
    return spec
  }

  /**
   * Resolve a placeholder import ID (bare:xxx.as) to its actual file:// URI.
   * Returns the input unchanged if no resolution is cached.
   */
  resolveImportId(rawId: string): string {
    return this.resolvedImports.get(rawId) ?? rawId
  }

  /**
   * Re-key an entry in the imports map (e.g., from bare: placeholder to file:// URI).
   */
  rekeyImport(oldKey: string, newKey: string) {
    const entry = this.imports.get(oldKey)
    if (entry) {
      this.imports.delete(oldKey)
      this.imports.set(newKey, entry)
    }
  }

  updateDependencies(docs: AtscriptDoc[]) {
    const newDependencies = new Set(docs)
    if (
      newDependencies.size !== this.dependencies.size ||
      docs.some(d => !this.dependencies.has(d))
    ) {
      resetCaches()
      this.changed()
    }

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

  /**
   * The documents reachable from this one through `edge` (imports, or importers), breadth-first
   * — this one itself only through a cycle.
   */
  transitive(edge: 'dependencies' | 'dependants'): Set<AtscriptDoc> {
    const out = new Set(this[edge])
    // The array iterator also visits the documents pushed meanwhile.
    const queue = [...out]
    for (const doc of queue) {
      for (const next of doc[edge]) {
        if (!out.has(next)) {
          out.add(next)
          queue.push(next)
        }
      }
    }
    return out
  }

  public nodes: SemanticNode[] = []
  private _text: string = ''
  /** The {@link documentsEpoch} of this document's last change. */
  private _changedAt = 0

  /** This document's text or imports changed (see {@link changedSince}). */
  private changed(): void {
    this._changedAt = ++epoch
  }

  /**
   * Whether this document or one it imports (directly or not) changed since `since` (a
   * {@link documentsEpoch}): what is derived from them at that epoch no longer holds. Decided for
   * every document at once per epoch, in time linear in the import graph.
   */
  changedSince(since: number): boolean {
    return deepChangedAt(this) > since
  }

  /** The {@link documentsEpoch} of this document's last change. */
  get changedAtEpoch(): number {
    return this._changedAt
  }
  get text() {
    return this._text
  }

  /** Comment spans of `text`, in source order. */
  private commentSpans: TCommentSpan[] = []

  /** Whether `offset` into `text` falls inside a comment (e.g. a cursor in `// …`). */
  isInComment(offset: number): boolean {
    // binary search for the last comment starting before `offset`
    let lo = 0
    let hi = this.commentSpans.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (this.commentSpans[mid].start < offset) {
        lo = mid + 1
      } else {
        hi = mid
      }
    }
    const span = this.commentSpans[lo - 1]
    return span !== undefined && offset < span.end
  }

  update(text: string, debug = false) {
    if (text === this._text && this.nodes.length > 0 && !debug) {
      // (the same text: the same nodes — parsing it again would make new ones, and what was
      // derived from the old ones at this epoch, keyed by them, would no longer hold; its
      // diagnostics, derived from other documents too, are computed again)
      this.clearMessages()
      return
    }
    if (text !== this._text) {
      this.changed()
    }
    this._text = text
    this.cleanup()
    this.commentSpans = []
    const rawTokens = tokenize(text, debug, this.commentSpans)
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
    this.parseUnregisteredBacktickArgs(rawTokens)
  }

  /** Lexical backtick tokens already parsed by `registerAnnotation`. */
  private parsedBacktickArgs = new WeakSet<TLexicalToken>()

  /**
   * Backtick arguments of annotations that never get registered (dangling at
   * EOF, or followed by a syntax error) are still parsed for diagnostics — by
   * the argument spec of the preceding annotation when it resolves, else as a
   * query predicate.
   */
  private parseUnregisteredBacktickArgs(tokens: TLexicalToken[]) {
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]
      if (t.type === 'block' && t.children) {
        this.parseUnregisteredBacktickArgs(t.children)
        continue
      }
      if (t.type !== 'query' || this.parsedBacktickArgs.has(t)) {
        continue
      }
      // Walk back to the owning annotation on the same statement.
      let argIndex = 0
      let annotation: TLexicalToken | undefined
      for (let j = i - 1; j >= 0; j--) {
        const p = tokens[j]
        if (p.type === 'annotation') {
          annotation = p
          break
        }
        if (
          p.type === 'block' ||
          (p.type === 'punctuation' && (p.text === '\n' || p.text === ';'))
        ) {
          break
        }
        if (p.type === 'punctuation' && p.text === ',') {
          argIndex++
        }
      }
      if (!annotation) {
        continue
      }
      this.parseBacktickArgAs(
        new Token(t),
        this.resolveAnnotation(annotation.text.slice(1))?.arguments[argIndex]?.type
      )
    }
  }

  /**
   * Parse a backtick argument by its spec type: `expr` / `order` get their own
   * grammar; anything else (unknown annotation, position beyond the spec) parses
   * as a query predicate.
   */
  private parseBacktickArgAs(arg: Token, specType: string | undefined) {
    this.parsedBacktickArgs.add(arg.lexicalToken)
    this.registerMessages(parseBacktickArg(arg, isBacktickArgType(specType) ? specType : 'query'))
  }

  cleanup() {
    this.exports.clear()
    this.registry.clear()
    this.importedDefs.clear()
    this.messages = []
    this.importMessages = []
    this.referred = []
    this.queryFieldRefs = []
    this.fieldPathArgs = []
    this.imports.clear()
    this.resolvedImports.clear()
    this._allMessages = undefined
    resetCaches()
    this.tokensIndex = new TokensIndex()
    this.blocksIndex = new BlocksIndex()
    this.resolvedAnnotations = []
    this.annotations = []
    this.parsedBacktickArgs = new WeakSet()
  }

  private registerNodes(nodes: SemanticNode[]) {
    for (const node of nodes) {
      declaringDocs.set(node, this)
      node.registerAtDocument(this)
      node.referredIdentifiers.forEach(t => {
        t.isReference = true
        t.originDoc = this
        this.referred.push(t)
        this.tokensIndex.add(t)
      })
    }
  }

  /** Records this document as the one declaring prop `prop` (see {@link declaringDoc}). */
  registerProp(prop: SemanticNode): void {
    declaringDocs.set(prop, this)
  }

  /**
   * The document declaring `node` (a declaration, a prop; a merged field: its first
   * contributor's, see `propUnion`), `fallback` when not known.
   */
  declaringDoc(node: SemanticNode | undefined, fallback: AtscriptDoc): AtscriptDoc {
    return (node && declaringDocs.get(node)) || fallback
  }

  public resolvedAnnotations: Token[] = []
  public annotations: TAnnotationTokens[] = []

  /**
   * The document a type reference was written in, where its name resolves (see
   * {@link Token.originDoc}): this document for a synthetic reference.
   */
  refOrigin(ref: SemanticRefNode): AtscriptDoc {
    return ref.token('identifier')?.originDoc ?? this
  }

  /** {@link unwindType} of a type reference, resolved in the document it was written in. */
  unwindRef(ref: SemanticRefNode): ReturnType<AtscriptDoc['unwindType']> {
    if (unwinding.size > 0) {
      // (inside another unwinding: its cycles are its own)
      return this.refOrigin(ref).unwindType(ref.id!, ref.chain)
    }
    const known = cache().unwound
    if (known.has(ref)) {
      return known.get(ref) as ReturnType<AtscriptDoc['unwindType']>
    }
    const value = this.refOrigin(ref).unwindType(ref.id!, ref.chain)
    // (not when an unwinding met a cycle, which it reports: the flags are only set while unwinding)
    if (value && !circularChain && !circularAlias) {
      known.set(ref, value)
    }
    return value
  }

  /**
   * The type non-mutating `annotate … as` alias `alias` (declared in this document) stands for:
   * what its class is built from — its target's definition (with `extends` resolved, see
   * {@link declDefinition}) — with the alias's entries folded into its props (over the target's
   * blocks; through a reference, the referenced type inlined, as the alias's class does), and the
   * type-level annotations of the alias (merged over its target's). The same node every time
   * (until a document changes): a type of its own, like a hand-written copy (`Alias & Target`
   * merges their props).
   */
  aliasDefinition(alias: SemanticAnnotateNode): SemanticNode | undefined {
    const aliases = cache().aliases
    if (aliases.has(alias)) {
      return aliases.get(alias)
    }
    // (re-entered while it is built — an alias reaching itself — it stands for nothing)
    aliases.set(alias, undefined)
    const built = (() => {
      const unwound = this.declTarget(alias.targetName)
      const target = this.inlinedDefinition(unwound)
      if (!unwound || !target) {
        return undefined
      }
      const entries: Array<{ parts: string[]; anns: TAnnotationTokens[] }> = []
      for (const entry of alias.annotatedEntries) {
        entries.push({ parts: entryParts(entry), anns: entry.annotations! })
      }
      // (its target's type-level annotations, its own over them)
      const annotations = this.evalAnnotationsForNode(alias)
      if (!isStructure(target)) {
        return target
      }
      const folded =
        (entries.length > 0 && this.foldAnnotationsIntoStructure(target, entries)) ||
        copyStructure(target)
      folded.annotations = annotations
      return folded
    })()
    aliases.set(alias, built)
    return built
  }

  /**
   * {@link unwindType} of type name `name` (resolved in this document, no chain) as its
   * definition (see {@link declDefinition}) when it names a declaration.
   */
  declTarget(name: string): { def: SemanticNode; doc: AtscriptDoc } | undefined {
    const owner = this.getDeclarationOwnerNode(name)
    if (!owner?.node || !isDeclarationNode(owner.node)) {
      return this.unwindType(name)
    }
    return owner.doc.declDefinition(owner.node)
  }

  /** {@link declTarget} of a type reference, resolved where it was written. */
  declRef(ref: SemanticRefNode): { def: SemanticNode; doc: AtscriptDoc } | undefined {
    if (ref.hasChain) {
      return this.unwindRef(ref)
    }
    const owner = this.resolveRefOwner(ref)
    if (!owner?.node || !isDeclarationNode(owner.node)) {
      return this.unwindRef(ref)
    }
    return owner.doc.declDefinition(owner.node)
  }

  /**
   * The declaration plain alias `decl` (of this document) stands for: `type A = B` (a reference,
   * no chain) is B — through aliases of aliases. `undefined` for any other declaration. A block
   * on a plain alias is a block on what it aliases (see {@link blockTarget}), like the runtime
   * applies it (`ownPath` follows the alias's `refTo`).
   */
  aliasedDeclaration(decl: SemanticNode): { doc: AtscriptDoc; node: SemanticNode } | undefined {
    let found: { doc: AtscriptDoc; node: SemanticNode } | undefined
    let owner = { doc: this as AtscriptDoc, node: decl }
    // (however long the chain; a cycle of aliases — a compile error — ends where it closes)
    const seen = new Set<SemanticNode>([decl])
    for (;;) {
      const next = owner.doc.aliasStep(owner.node)
      if (!next || seen.has(next.node)) {
        break
      }
      seen.add(next.node)
      owner = next
      found = next
    }
    return found
  }

  /** The declaration plain alias `decl` (of this document) names directly, if it is one. */
  private aliasStep(decl: SemanticNode): { doc: AtscriptDoc; node: SemanticNode } | undefined {
    if (decl.entity !== 'type') {
      return undefined
    }
    const known = aliasSteps.get(decl)
    if (known?.epoch === epoch) {
      return known.step
    }
    const step = this.findAliasStep(decl)
    aliasSteps.set(decl, { epoch, step })
    return step
  }

  private findAliasStep(decl: SemanticNode): { doc: AtscriptDoc; node: SemanticNode } | undefined {
    // (`type X = T` / `type X = (T)`: a reference, no chain — the structure model's `aliasStep`)
    const def = decl.getDefinition() && unparenthesized(decl.getDefinition()!)
    if (!isRef(def) || def.hasChain) {
      return undefined
    }
    const owner = this.resolveRefOwner(def)
    return owner?.node && owner.node !== decl && isDeclarationNode(owner.node)
      ? { doc: owner.doc, node: owner.node }
      : undefined
  }

  /**
   * The declaration mutating block `node` (of this document) annotates: its target — what it
   * aliases, for a plain alias (`annotate UA {…}` with `type UA = User` is `annotate User {…}`).
   */
  blockTarget(node: SemanticAnnotateNode): { doc: AtscriptDoc; node: SemanticNode } | undefined {
    const owner = this.getDeclarationOwnerNode(node.targetName)
    if (!owner?.node) {
      return undefined
    }
    return owner.doc.aliasedDeclaration(owner.node) ?? { doc: owner.doc, node: owner.node }
  }

  /**
   * The type-level annotations of declaration `decl` (of this document) as build-time readers
   * see them: its own, with the top-level annotations of its mutating blocks over them, in order.
   */
  declarationAnnotations(decl: SemanticNode): TAnnotationTokens[] | undefined {
    let out = decl.annotations
    // (the blocks of the build writing into it — on a plain alias of it too —, in block order:
    // import depth, module id, source order)
    for (const b of this.buildStructure().blocksOn(decl)) {
      if (b.rank && b.node.annotations?.length) {
        out = this.overlayAnnotations(out, b.node.annotations)
      }
    }
    return out
  }

  /**
   * `base` with the annotations of a mutating block (`overlay`) applied, like the block applies
   * them to its target's metadata: an `append` annotation adds its values after the existing
   * ones, any other replaces them.
   */
  overlayAnnotations(
    base: TAnnotationTokens[] | undefined,
    overlay: TAnnotationTokens[]
  ): TAnnotationTokens[] {
    const replaced = new Set<string>()
    for (const a of overlay) {
      const spec = this.resolveAnnotation(a.name)
      if (!(spec?.config.multiple && spec.config.mergeStrategy === 'append')) {
        replaced.add(a.name)
      }
    }
    return [...(base ?? []).filter(a => !replaced.has(a.name)), ...overlay]
  }

  /**
   * What declaration `decl` (of this document) is defined as — an alias's, its target's (an
   * `annotate … as` alias's with its entries): what generated code builds from it.
   */
  declDefinition(decl: SemanticNode): { def: SemanticNode; doc: AtscriptDoc } | undefined {
    if (decl.entity === 'type') {
      const def = decl.getDefinition()
      return isRef(def) && !def.hasChain ? this.declRef(def) : this.unwindType(decl.id!)
    }
    if (decl.entity === 'annotate') {
      const alias = decl as SemanticAnnotateNode
      const def = alias.isMutating ? undefined : this.aliasDefinition(alias)
      return def && { def, doc: this }
    }
    return { def: decl, doc: this }
  }

  /**
   * The definition generated code inlines for a type: an interface's own (with `extends`
   * resolved), an intersection merged, any other as it is.
   */
  inlinedDefinition(
    unwound: { def: SemanticNode; doc: AtscriptDoc } | undefined
  ): SemanticNode | undefined {
    if (!unwound) {
      return undefined
    }
    const def = this.mergeIntersection(unwound.def)
    if (isInterface(def)) {
      return (
        (def.hasExtends && unwound.doc.resolveInterfaceExtends(def)) || def.getDefinition() || def
      )
    }
    return def
  }

  /**
   * The built-in primitive a type reference names, which generated code emits inline — not a
   * named alias of one (`type MyString = string`), which stays a reference.
   */
  inlinedPrimitive(
    ref: SemanticRefNode,
    decl = this.unwindRef(ref)?.def
  ): SemanticPrimitiveNode | undefined {
    if (!isPrimitive(decl)) {
      return undefined
    }
    const owner = this.resolveRefOwner(ref)?.node
    return owner &&
      (owner.entity === 'type' || owner.entity === 'interface' || owner.entity === 'annotate')
      ? undefined
      : decl
  }

  /**
   * {@link getDeclarationOwnerNode} of a type reference's name, resolved in the document it
   * was written in.
   */
  resolveRefOwner(ref: SemanticRefNode): ReturnType<AtscriptDoc['getDeclarationOwnerNode']> {
    const owners = cache().refOwners
    if (owners.has(ref)) {
      return owners.get(ref) as ReturnType<AtscriptDoc['getDeclarationOwnerNode']>
    }
    const owner = this.refOrigin(ref).getDeclarationOwnerNode(ref.id!)
    owners.set(ref, owner)
    return owner
  }

  /**
   * Annotation tokens survive merges across refs, chain refs and `extends`
   * unchanged, so they are keyed by identity to the document that declared them.
   */
  private static readonly annotationOrigins = new WeakMap<TAnnotationTokens, AtscriptDoc>()

  /**
   * The document in which the given annotation was written (and whose imports
   * its type-reference arguments resolve against). Annotations inherited into
   * another document through a chain ref, `extends` or `annotate` keep the
   * declaring document. `undefined` for annotations never registered on a doc.
   */
  annotationOrigin(annotation: TAnnotationTokens): AtscriptDoc | undefined {
    return AtscriptDoc.annotationOrigins.get(annotation)
  }

  registerAnnotation(annotationTokens: TAnnotationTokens) {
    AtscriptDoc.annotationOrigins.set(annotationTokens, this)
    this.annotations.push(annotationTokens)
    const mainToken = annotationTokens.token
    const args = annotationTokens.args
    this.tokensIndex.add(mainToken)
    args?.forEach(a => this.tokensIndex.add(a))
    const annotationSpec = this.resolveAnnotation(mainToken.text.slice(1))
    const specArgs = annotationSpec?.arguments ?? []
    args?.forEach((a, i) => {
      if (a.type === 'query') {
        this.parseBacktickArgAs(a, specArgs[i]?.type)
      }
    })
    if (annotationSpec) {
      this.registerMessages(annotationSpec.validate(mainToken, args || [], this))
      annotationSpec.modify(mainToken, args || [], this)
      this.resolvedAnnotations.push(mainToken)
      // Track ref-typed arguments for import resolution
      for (let i = 0; i < (args?.length ?? 0); i++) {
        const argSpec = specArgs[i]
        if (argSpec?.type === 'ref' && args?.[i]) {
          const refToken = args[i]
          const dotIdx = refToken.text.indexOf('.')
          if (dotIdx > 0) {
            // For chain refs like "User.status", only the type name needs import tracking
            const typeToken = refToken.clone({ text: refToken.text.slice(0, dotIdx) })
            typeToken.annotationRef = refToken.annotationRef
            typeToken.isReference = true
            typeToken.originDoc = this
            this.referred.push(typeToken)
          } else {
            refToken.isReference = true
            refToken.originDoc = this
            this.referred.push(refToken)
          }
        }
        // Track query / expr / order field refs for import resolution and LSP
        if (isBacktickArgType(argSpec?.type)) {
          args?.[i]?.backtickNode?.registerAtDocument(this)
        }
        if (argSpec?.type === 'string' && argSpec.fieldScope && args?.[i]) {
          this.fieldPathArgs.push(args[i])
        }
      }
    } else {
      let severity: 0 | 1 | 2 = 1
      switch (this.config.unknownAnnotation) {
        case 'warn': {
          severity = 2
          break
        }
        case 'allow': {
          severity = 0
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
  }

  /**
   * Resolves a type name and a type path (`T.a.b`) to the type it names.
   *
   * The name resolves through references, aliases and `annotate … as` copies. Each step of the
   * path keeps a set of positions (one rule for every reader, MODEL §15 CHAIN-1): a union —
   * written, through an alias, or a distributed merge — fans out into its branches (nested
   * unions flattened; branches that are not objects have no props), and the step keeps the
   * positions that have the prop. Then:
   *  - no position: `undefined` (an unknown member);
   *  - one: that field — `node` is the prop, `def` its type, resolved;
   *  - several: `fields` (each such a field) and `def`, the union of their types; no `node`.
   *
   * @param {string} name - The name of the type or identifier to resolve.
   * @param {Array<string | Token>} [chain=[]] - The path below it (`T.a.b`: `["a", "b"]`).
   * @returns `doc` (where `def` resolves), `node` (the prop a path reaches; else the last node
   *  met before `def`), `def`, and `fields` for several fields; `undefined` when nothing resolves.
   *
   * `watchCb` gets each declaration and prop met on the way while the path has one position;
   * `declaring` is true for those met on the way to a chain's field (its head, the props and
   * types it goes through: what declares the field — not what the field is).
   */
  unwindType(
    name: string,
    chain: string[] | Token[] = [],
    watchCb?: (def: SemanticNode, declaring: boolean) => void,
    _tracked?: Set<SemanticNode>,
    _declaring = false
  ): TUnwound | undefined {
    const decl = this.getDeclarationOwnerNode(name)
    if (!decl) {
      return undefined
    }
    // A chain reaching itself (`W { w?: W.w2; w2?: W.w }`) resolves to nothing (reported as a
    // circular chain reference).
    // (and an alias reaching itself, `type A = B`, `type B = A`: nothing either — reported as a
    // circular alias)
    const key = chainKey(decl.node, chain)
    if (unwinding.has(key)) {
      if (chain.length > 0) {
        circularChain = true
      } else {
        circularAlias = true
      }
      return undefined
    }
    unwinding.add(key)
    try {
      return this.unwindDeclaration(decl, chain, watchCb, _tracked, _declaring)
    } finally {
      unwinding.delete(key)
    }
  }

  /**
   * The props the next step of type path `name.chain` can name (completion): those of every
   * object position the path reaches (see {@link unwindType}), the first position's first.
   */
  pathMembers(name: string, chain: string[] | Token[] = []): SemanticNode[] {
    const decl = this.getDeclarationOwnerNode(name)
    if (!decl) {
      return []
    }
    const walk = this.pathWalk()
    const out = new Map<string, SemanticNode>()
    for (const o of walk.objects(walk.positions(decl, chain) ?? [])) {
      for (const [key, prop] of o.def.props) {
        if (!out.has(key)) {
          out.set(key, prop)
        }
      }
    }
    return [...out.values()]
  }

  private unwindDeclaration(
    decl: { node?: SemanticNode; doc: AtscriptDoc },
    chain: string[] | Token[],
    watchCb?: (def: SemanticNode, declaring: boolean) => void,
    _tracked?: Set<SemanticNode>,
    _declaring = false
  ): TUnwound | undefined {
    const walk = this.pathWalk(watchCb, _tracked, _declaring || chain.length > 0)
    const positions = walk.positions(decl, chain)
    if (!positions) {
      return undefined
    }
    // (the field reached: what it is from here on)
    walk.declaring = _declaring
    walk.cb = positions.length === 1 ? watchCb : undefined
    const fields: TUnwoundField[] = []
    for (const p of positions) {
      if (_tracked) {
        walk.report(p.def) // collecting one more item in chain
      }
      while (isProp(p.def)) {
        p.node = p.def
        p.def = p.def.getDefinition()
        walk.resolveRef(p)
        walk.resolveType(p)
      }
      if (p.def) {
        fields.push({ def: p.def, doc: p.doc, node: p.node })
      }
    }
    if (fields.length < 2) {
      return fields[0]
    }
    return {
      def: new SemanticGroup(
        fields.map(f => f.def),
        '|'
      ),
      doc: this,
      fields,
    }
  }

  /**
   * The walk of a type path (see {@link unwindType}): its positions, how a position resolves,
   * and what it reports to `watchCb` (`cb`; `declaring`: on the way to a chain's field).
   */
  private pathWalk(
    watchCb?: (def: SemanticNode, declaring: boolean) => void,
    _tracked?: Set<SemanticNode>,
    declaring = false
  ) {
    const tracked = _tracked || new Set()
    const walk = {
      cb: watchCb,
      declaring,
      report(def: SemanticNode | undefined) {
        if (
          walk.cb &&
          def &&
          (walk.declaring || !tracked.has(def)) &&
          ['type', 'primitive', 'prop', 'interface'].includes(def.entity)
        ) {
          // tracking all the nodes while unwinding
          // so we can gather annotations to merge
          // (what declares a field is not tracked: the field's type may be met again)
          if (!walk.declaring) {
            tracked.add(def)
          }
          walk.cb(def, walk.declaring)
        }
      },
      resolveRef(p: TPathPosition) {
        if (isRef(p.def)) {
          // (in the document it was written in: a prop an interface inherits from another document)
          const d = p.doc
            .refOrigin(p.def)
            .unwindType(
              p.def.token('identifier')!.text,
              p.def.chain,
              walk.cb,
              tracked,
              walk.declaring
            )
          p.doc = d?.doc || p.doc
          p.def = d?.def
        }
      },
      resolveType(p: TPathPosition) {
        while (isType(p.def)) {
          walk.report(p.def) // collection type on our way
          // (parentheses do not change a type: `type P = (Base)` is Base)
          let def = p.def.getDefinition()
          def = def?.entity === 'group' && !(def as SemanticGroup).op ? unparenthesized(def) : def
          p.def = def
          p.node = def
          walk.resolveRef(p)
        }
      },
      /** The positions of declaration `decl` at path `chain`; `undefined`: none. */
      positions: (
        decl: { node?: SemanticNode; doc: AtscriptDoc },
        chain: string[] | Token[]
      ): TPathPosition[] | undefined => {
        const head: TPathPosition = { def: decl.node, doc: decl.doc }
        walk.resolveType(head)
        if (!head.def) {
          return undefined
        }
        // A non-mutating annotate is an alias: the type it stands for is a copy of its target
        // with its annotations (see `aliasDefinition`), wherever it is reused (`extends`, an
        // intersection operand, a reference to one of its props).
        if (isAnnotate(head.def)) {
          head.node = head.def
          head.def = head.doc.aliasDefinition(head.def)
          if (!head.def) {
            return undefined
          }
        }
        let positions = [head]
        for (const item of chain) {
          const name = typeof item === 'string' ? item : item.text
          // (nodes met after the path fans out are no one field's: not reported)
          walk.cb = positions.length === 1 ? watchCb : undefined
          const next: TPathPosition[] = []
          for (const o of walk.objects(positions)) {
            const prop = o.def.props.get(name)
            if (prop && !next.some(n => n.def === prop)) {
              next.push({ def: prop, doc: o.doc })
            }
          }
          if (next.length === 0) {
            return undefined
          }
          positions = next
        }
        return positions
      },
      /**
       * The objects `positions` stand for, whose props a next step names: a prop its type; a
       * union its branches (flattened); a merge its merged type; an interface its props, with
       * those it inherits. Nothing else has props, but a primitive named by the path itself — its
       * head or an extension of it (`number.int.uint8`) —, not a prop's type or a union branch.
       */
      objects: (
        positions: TPathPosition[]
      ): Array<{
        def: SemanticStructureNode | SemanticInterfaceNode | SemanticPrimitiveNode
        doc: AtscriptDoc
      }> => {
        const out: Array<{
          def: SemanticStructureNode | SemanticInterfaceNode | SemanticPrimitiveNode
          doc: AtscriptDoc
        }> = []
        const seen = new Set<SemanticNode>()
        const visit = (p: TPathPosition, top: boolean) => {
          const def = p.def && unparenthesized(p.def)
          if (!def || seen.has(def)) {
            return
          }
          seen.add(def)
          const inner = (d: SemanticNode | undefined) => {
            const q: TPathPosition = { def: d, doc: p.doc }
            walk.resolveRef(q)
            walk.resolveType(q)
            visit(q, false)
          }
          if (isProp(def)) {
            inner(def.getDefinition())
          } else if (isIntersection(def)) {
            const merged = p.doc.mergeIntersection(def)
            if (merged !== def) {
              inner(merged)
            }
          } else if (isUnion(def)) {
            def.unwrap().forEach(inner)
          } else if (isInterface(def) && def.hasExtends) {
            const resolved = p.doc.resolveInterfaceExtends(def)
            out.push({ def: isStructure(resolved) ? resolved : def, doc: p.doc })
          } else if (isStructure(def) || isInterface(def) || (top && isPrimitive(def))) {
            out.push({ def, doc: p.doc })
          }
        }
        for (const p of positions) {
          visit(p, true)
        }
        return out
      },
    }
    return walk
  }

  getUsageListAt(line: number, character: number) {
    const token = this.tokensIndex.at(line, character)
    if (token) {
      return this.usageListFor(token, character)
    }
  }

  /**
   * The type-level annotations of `givenNode` (its own: `own`) over those of what it references.
   * `blocks`: a declaration reached on the way has its mutating blocks' top-level annotations
   * too (see {@link declarationAnnotations}) — what a reader showing the type's full set wants
   * (the LSP hover, `.d.ts` comments); generated code writes the declaration's own (the blocks
   * apply theirs at runtime).
   */
  evalAnnotationsForNode(
    givenNode: SemanticNode,
    own = givenNode.annotations,
    blocks = false
  ): TAnnotationTokens[] | undefined {
    if (isAnnotate(givenNode) && !givenNode.isMutating) {
      // An `annotate … as` alias: its target's type-level annotations, its own over them (like
      // its class, and a hand-written copy).
      const target = this.getDeclarationOwnerNode(givenNode.targetName)
      return this.mergeNodesAnnotations(
        target?.node && target.node !== givenNode
          ? target.doc.evalAnnotationsForNode(
              target.node,
              annotationsOf(target.node, blocks),
              blocks
            )
          : undefined,
        own
      )
    }
    return this.evalAnnotationsForDefinition(givenNode.getDefinition(), own, givenNode, blocks)
  }

  /**
   * {@link evalAnnotationsForNode} of a node defined as `definition` (e.g. a reference used as
   * a union / tuple / intersection member or an array element: `A.x | null`), with annotations
   * `own` of its own.
   */
  evalAnnotationsForDefinition(
    definition: SemanticNode | undefined,
    own?: TAnnotationTokens[],
    givenNode?: SemanticNode,
    blocks = false
  ) {
    let right = own
    let def = definition
    // A next round evaluates the reference an intersection merges into (`number.int & number`
    // is `number.int`: its built-in `expect.int`), like a definition written as that reference.
    for (let round = 0; def && round < 4; round++) {
      // (parentheses: what they hold — `type P = (Base)` is `Base`)
      if (def.entity === 'group' && !(def as SemanticGroup).op) {
        def = unparenthesized(def)
      }
      const refDef = isRef(def) ? def : undefined
      // A primitive's intrinsic annotations follow type refs and aliases, but
      // stop at a reference to a prop (`Order.createdAt`), like the prop's own.
      let viaProp = false
      if (refDef) {
        // Collect the nodes of the ref chain and merge them nearest-first, so
        // that annotations declared closer to the referring field win over
        // deeper ones (local > hop-1 > hop-2 > … > resolved type).
        // unwindType reports hop-2+ nodes through the callback (nearest first)
        // but returns the directly referred prop only as `node` — prepend it.
        const chainNodes: SemanticNode[] = []
        const unwound = this.unwindType(
          refDef.token('identifier')!.text,
          refDef.chain,
          (intermediate, declaring) => {
            if (isProp(intermediate) && intermediate !== givenNode) {
              viaProp = true
            }
            // (a chain is its field: not what declares it — `v?: KR.r.c` has neither KR's nor
            // the class of `r`'s type)
            if (!declaring && annotationsOf(intermediate, blocks)?.length) {
              chainNodes.push(intermediate)
            }
          }
        )
        // (`blocks`: a chain's field with the blocks' entries at its path over its own)
        const fieldBlocks = blocks && refDef.hasChain ? this.chainBlockAnnotations(refDef) : []
        if (unwound?.node && unwound.node !== givenNode) {
          viaProp ||= isProp(unwound.node)
          if (
            (annotationsOf(unwound.node, blocks)?.length || fieldBlocks.length > 0) &&
            !chainNodes.includes(unwound.node)
          ) {
            chainNodes.unshift(unwound.node)
          }
        }
        for (const chainNode of chainNodes) {
          // the resolved type itself is merged below — once, or append-merged
          // multiples (`expect.pattern` of `string.email`) would be doubled
          if (chainNode === unwound?.def) {
            continue
          }
          const anns =
            chainNode === unwound?.node && fieldBlocks.length > 0
              ? this.overlayAnnotations(chainNode.annotations, fieldBlocks)
              : annotationsOf(chainNode, blocks)
          right = this.mergeNodesAnnotations(this.filterPassedWhenReferred(anns, viaProp), right)
        }
        def = unwound?.def || def
      }
      if (def) {
        const merged = this.mergeIntersection(def)
        if (merged !== def && isRef(merged)) {
          right = this.mergeNodesAnnotations(merged.annotations, right)
          def = merged
          continue
        }
        // (an intersection's: its members' type-level ones, see `intersectionAnnotations`)
        const written = unparenthesized(def)
        const own = isIntersection(written)
          ? this.intersectionAnnotations(written, blocks).map(p => p.an)
          : refDef
            ? annotationsOf(merged, blocks)
            : merged.annotations
        right = this.mergeNodesAnnotations(
          refDef ? this.filterPassedWhenReferred(own, viaProp) : own,
          right
        )
      }
      break
    }
    return right
  }

  /**
   * The annotations the blocks of the build write at the field chain reference `ref` names
   * (`T.a.b`: the structure model's layers of T at `a.b`, through a union at its `|i`
   * path), in block order, each applied over the earlier ones. None for a chain naming several
   * fields (no one field is its target).
   */
  private chainBlockAnnotations(ref: SemanticRefNode): TAnnotationTokens[] {
    const owner = this.resolveRefOwner(ref)
    const m = owner?.node && owner.doc.buildStructure()
    const t = m && m.exprOf(this.refOrigin(ref), ref)
    let out: TAnnotationTokens[] = []
    if (m && t?.k === 'chain') {
      for (const l of m.orderedLayersAt(m.plainTarget(t.decl), t.path)) {
        out = this.overlayAnnotations(out, l.entry.ref.annotations ?? [])
      }
    }
    return out
  }

  /**
   * The annotations a reference to `node` (`field: Alias`) inherits: its evaluated
   * set without the `passedWhenReferred: false` ones. The node's own are filtered
   * before the merge, so a dropped one cannot shadow a primitive's intrinsic
   * annotation of the same name (`@meta.required 'msg'` on `type N = string.required`).
   */
  evalReferredAnnotations(node: SemanticNode, blocks = false) {
    return this.filterPassedWhenReferred(
      this.evalAnnotationsForNode(
        node,
        this.filterPassedWhenReferred(annotationsOf(node, blocks)),
        blocks
      )
    )
  }

  /**
   * Drops annotations whose spec declares `passedWhenReferred: false` — used
   * when folding annotations across a ref boundary. Annotations without a
   * resolvable spec pass through (default is to inherit), and so do a
   * primitive's intrinsic ones (`number.timestamp.created` → `@db.default.now`)
   * unless the boundary is a reference to a prop (`viaProp`). Returns the input
   * array unchanged when nothing is dropped.
   */
  filterPassedWhenReferred(annotations?: TAnnotationTokens[], viaProp = false) {
    if (!annotations?.length) {
      return annotations
    }
    let filtered: TAnnotationTokens[] | undefined
    for (let i = 0; i < annotations.length; i++) {
      const a = annotations[i]
      if (
        (viaProp || !a.intrinsic) &&
        this.resolveAnnotation(a.name)?.config.passedWhenReferred === false
      ) {
        filtered ??= annotations.slice(0, i)
      } else {
        filtered?.push(a)
      }
    }
    return filtered ?? annotations
  }

  /**
   * If the position falls inside an `annotate` block, returns that block's node
   * (whose `targetName` is the annotated interface). Entry refs within the block
   * resolve through the target interface rather than as top-level definitions.
   */
  annotateBlockAt(line: number, character: number): SemanticAnnotateNode | undefined {
    const block = this.blocksIndex.at(line, character)
    return block?.blockType === 'annotate' && isAnnotate(block.parentNode)
      ? block.parentNode
      : undefined
  }

  /**
   * The definition an annotated node stands for, with the document that declares it:
   * a prop / type declaration's own definition, or — for an `annotate` block entry —
   * the type of the target property the entry names (`annotate Host { name @x.y }`
   * → the type of `Host.name`). Plugin hooks use it to introspect the field an
   * annotation sits on, whether it is written inline or in an annotate block.
   * `undefined` when the node has no definition or the entry does not resolve.
   */
  annotatedDefinition(
    node: SemanticNode | undefined
  ): { def: SemanticNode; doc: AtscriptDoc } | undefined {
    if (!node) {
      return undefined
    }
    if (!isRef(node)) {
      const def = node.getDefinition()
      return def ? { def, doc: this } : undefined
    }
    const idToken = node.token('identifier')
    const block = idToken
      ? this.annotateBlockAt(idToken.range.start.line, idToken.range.start.character)
      : undefined
    if (!block) {
      return { def: node, doc: this }
    }
    return this.entryType(block, entryParts(node)) ?? undefined
  }

  /**
   * The type entry `names` of `annotate` block `block` (of this document) names, from the
   * structure model: the entry's first normalized path, the types
   * written at its node — one: that type; several (a merged field): the core algebra's merge of
   * them —, resolved through a reference. `null`: the model refuses the path; `undefined`: the
   * model does not know the target.
   */
  private entryType(
    block: SemanticAnnotateNode,
    names: string[]
  ): { def: SemanticNode; doc: AtscriptDoc } | null | undefined {
    const m = this.structure()
    const decl = block.isMutating ? m.declOf(this, block.targetName) : m.declOfNode(block)
    if (!decl) {
      return undefined
    }
    const target = block.isMutating ? m.plainTarget(decl) : decl
    const paths = m.normalize(target, names, block.isMutating)
    if (typeof paths === 'string') {
      return null
    }
    const slot = m.slotAt(target, paths[0])
    const ends = (slot?.ends ?? []).filter(e => e.node)
    if (ends.length === 0) {
      return null
    }
    const nodes = ends.map(e => e.node!)
    const def =
      nodes.length === 1 ? nodes[0] : this.mergeIntersection(new SemanticGroup(nodes, '&'))
    if (isRef(def)) {
      const unwound = this.unwindRef(def)
      return unwound ? { def: unwound.def, doc: unwound.doc } : null
    }
    // (a type written in place: in the document declaring the node holding it)
    const unit = slot?.owner?.unit
    const doc = (ends.length === 1 && unit && m.declById(unit)?.doc) || target.doc
    return { def, doc }
  }

  /**
   * Resolves an interface with `extends` by merging parent structures with own props.
   * Parents are merged left-to-right, then own props overlay on top (own takes priority).
   * Only merges props and their annotations; interface-level annotations are NOT inherited.
   *
   * Mutating `annotate` blocks are not folded in: they are metadata, applied at runtime
   *.
   */
  resolveInterfaceExtends(
    node: SemanticInterfaceNode,
    _visited?: Set<string>,
    _originDoc?: AtscriptDoc
  ): SemanticNode | undefined {
    if (!node.hasExtends) {
      return undefined
    }

    const visited = _visited || new Set<string>()
    if (node.id && visited.has(node.id)) {
      return undefined // circular extends
    }
    if (node.id) {
      visited.add(node.id)
    }

    const originDoc = _originDoc ?? this

    let mergedStruct: SemanticNode | undefined

    for (const extendsToken of node.extendsTokens) {
      // (the parent's definition as written: blocks are metadata, applied at runtime)
      const unwound = this.declTarget(extendsToken.text)
      if (!unwound?.def) {
        continue
      }

      let parentDef = unwound.def
      let parentDoc = unwound.doc
      // (a nullable parent — `type N = I | null`, an all-nullable merge: its one item that is
      // not `null`, whose props the child's class has; each definition looked at once)
      for (const seen = new Set<SemanticNode>(); !seen.has(parentDef); ) {
        seen.add(parentDef)
        // If parent is also an interface with extends, resolve recursively
        if (isInterface(parentDef) && (parentDef as SemanticInterfaceNode).hasExtends) {
          const resolved = parentDoc.resolveInterfaceExtends(
            parentDef as SemanticInterfaceNode,
            visited,
            originDoc
          )
          parentDef = resolved || parentDef.getDefinition() || parentDef
        } else if (isInterface(parentDef)) {
          parentDef = parentDef.getDefinition() || parentDef
        }
        parentDef = this.mergeIntersection(parentDef)
        const item = this.nonNullItem(parentDef)
        const resolved = item && isRef(item) ? this.unwindRef(item) : undefined
        if (!item || (isRef(item) && !resolved?.def)) {
          break
        }
        parentDef = resolved?.def ?? item
        parentDoc = resolved?.doc ?? parentDoc
      }

      if (!mergedStruct) {
        mergedStruct = parentDef
      } else {
        const merged = this.mergeDefs(mergedStruct, parentDef)
        mergedStruct = merged[0]
      }
    }

    // Merge with own props (own props take priority = right side)
    const ownDef = node.getDefinition()
    if (ownDef && mergedStruct) {
      const merged = this.mergeDefs(mergedStruct, ownDef)
      return merged[0]
    }

    return mergedStruct || ownDef
  }

  /**
   * Folds an `annotate … as` alias's entries into a structure's props (see `aliasDefinition`).
   * Each entry's `parts[0]` names a prop in `struct`; remaining parts target a nested prop —
   * through a prop typed by a reference, the referenced type inlined: the folded structures are
   * types of their own (`Alias & Target` merges like a hand-written copy). Returns a new
   * structure with cloned props/structures along touched paths, or `undefined` when nothing
   * matched (so callers can reuse the original by reference).
   */
  private foldAnnotationsIntoStructure(
    struct: SemanticStructureNode,
    entries: Array<{ parts: string[]; anns: TAnnotationTokens[] }>
  ): SemanticStructureNode | undefined {
    const byHead = new Map<
      string,
      { own: TAnnotationTokens[]; nested: Array<{ parts: string[]; anns: TAnnotationTokens[] }> }
    >()
    for (const entry of entries) {
      const head = entry.parts[0]
      let group = byHead.get(head)
      if (!group) {
        group = { own: [], nested: [] }
        byHead.set(head, group)
      }
      if (entry.parts.length === 1) {
        group.own.push(...entry.anns)
      } else {
        group.nested.push({ parts: entry.parts.slice(1), anns: entry.anns })
      }
    }

    const newProps: SemanticPropNode[] = []
    let changed = false
    for (const [name, prop] of struct.props) {
      const group = byHead.get(name)
      if (!group) {
        newProps.push(prop)
        continue
      }
      const propDef = prop.getDefinition()
      // (through an inline object, a union branch or an intersection member having the prop,
      // a reference: see `foldIntoNode`)
      const newDef =
        (group.nested.length > 0 && propDef && this.foldIntoNode(propDef, group.nested)) || propDef
      if (group.own.length === 0 && newDef === propDef) {
        newProps.push(prop)
        continue
      }
      const cloned = new SemanticPropNode()
      const idToken = prop.token('identifier')
      if (idToken) {
        cloned.saveToken(idToken, 'identifier')
      }
      if (newDef) {
        cloned.define(newDef)
      }
      cloned.annotations =
        group.own.length === 0
          ? prop.annotations
          : this.mergeNodesAnnotations(prop.annotations, group.own)
      const optionalToken = prop.token('optional')
      if (optionalToken) {
        cloned.saveToken(optionalToken, 'optional')
      }
      newProps.push(cloned)
      changed = true
    }
    if (!changed) {
      return undefined
    }
    const newStruct = new SemanticStructureNode()
    newStruct.setProps(newProps)
    newStruct.annotations = struct.annotations
    return newStruct
  }

  /**
   * Folds the entries (relative to `def`) into definition `def`: an inline object's props (an
   * intersection: its merge's); the branches of a union and the items of a tuple having them;
   * through a reference, the referenced type's definition inlined. `undefined` when nothing
   * matched.
   */
  private foldIntoNode(
    def: SemanticNode,
    entries: Array<{ parts: string[]; anns: TAnnotationTokens[] }>
  ): SemanticNode | undefined {
    const node = this.mergeIntersection(def)
    if (isStructure(node)) {
      return this.foldAnnotationsIntoStructure(node, entries)
    }
    if (isRef(node)) {
      if (node.hasChain) {
        return undefined
      }
      const inlined = this.inlinedDefinition(this.declRef(node))
      return inlined && this.foldIntoNode(inlined, entries)
    }
    if (isGroup(node) && node.op !== '&') {
      const items = (node as SemanticGroup).unwrap()
      const mapped = items.map(item => this.foldIntoNode(item, entries) ?? item)
      return mapped.every((item, i) => item === items[i])
        ? undefined
        : withItems(node as SemanticGroup, mapped)
    }
    return undefined
  }

  /**
   * Usages of the symbol `token` stands for. `character` (the cursor column)
   * narrows a dotted field-path string argument to the segment under the cursor.
   */
  usageListFor(
    token: Token,
    character?: number
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
    // Field refs (query field refs, field-path string args) stand for the property they name
    const fieldRef = resolveFieldRefAt(token, this, character)
    const fieldRefProp = fieldRef?.prop.token('identifier')
    if (fieldRef && fieldRefProp) {
      return fieldRef.doc.usageListFor(fieldRefProp)
    }
    if (isProp(token.parentNode)) {
      const propName = token.parentNode.id
      if (!propName) {
        return undefined
      }

      // Find the parent interface/structure that owns this prop
      let parentName: string | undefined
      for (const node of this.nodes) {
        if (
          (isInterface(node) || isStructure(node)) &&
          node.props.get(propName) === token.parentNode
        ) {
          parentName = node.id
          break
        }
      }
      if (!parentName) {
        return undefined
      }

      const refs: Array<{ uri: string; range: Token['range']; token: Token }> = []

      const searchDoc = (doc: AtscriptDoc, uri: string) => {
        // Ref chains: e.g., Product.description in type position
        for (const t of doc.referred) {
          if (t.text !== parentName || !isRef(t.parentNode) || !t.parentNode.hasChain) {
            continue
          }
          const chainToken = t.parentNode.chain[0]
          if (chainToken?.text === propName) {
            refs.push({ uri, range: chainToken.range, token: chainToken })
          }
        }
        // Annotate block entries: e.g., annotate Product { description: ... }
        for (const node of doc.nodes) {
          if (!isAnnotate(node) || node.targetName !== parentName) {
            continue
          }
          for (const entry of node.entries) {
            if (entry.id === propName) {
              const entryToken = entry.token('identifier')
              if (entryToken) {
                refs.push({ uri, range: entryToken.range, token: entryToken })
              }
            }
          }
        }
        // Query field refs: e.g. `status = 'active'` in a query argument
        for (const qfr of doc.queryFieldRefs) {
          if (qfr.fieldRef.text !== propName) {
            continue
          }
          if (resolveFieldRefAt(qfr.fieldRef, doc)?.prop === token.parentNode) {
            refs.push({ uri, range: qfr.fieldRef.range, token: qfr.fieldRef })
          }
        }
        // Field-path string args, any segment: e.g. `'amount'`, `'address.city'`
        for (const arg of doc.fieldPathArgs) {
          for (const target of resolveFieldPathArgSegments(arg, doc, propName)) {
            if (target.prop === token.parentNode) {
              refs.push({ uri, range: target.range, token: arg })
            }
          }
        }
      }

      searchDoc(this, this.id)

      // Cross-file: search dependants if parent type is exported
      const parentDefToken = this.registry.definitions.get(parentName)
      if (parentDefToken?.exported) {
        const targetName = parentName
        for (const d of this.dependants) {
          const imp = d.imports.get(this.id)
          if (imp?.imports.find(t => t.text === targetName)) {
            searchDoc(d, d.id)
          }
        }
      }

      return refs
    }
    {
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
      const absolutePath = this.resolveImportId(resolveAtscriptFromPath(token.fromPath, this.id))

      return { uri: absolutePath, doc: this.dependenciesMap.get(absolutePath), token }
    }
    if (
      (token.isReference || token.imported) &&
      this.importedDefs.has(token.text) &&
      this.dependenciesMap.size > 0
    ) {
      const from = this.importedDefs.get(token.text)!.text
      const absolutePath = this.resolveImportId(resolveAtscriptFromPath(from, this.id))
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

  /** Pushes an "Unknown identifier" error when `t` is not defined; returns whether it was. */
  private reportUnknownIdentifier(t: Token): boolean {
    if (this.registry.isDefined(t)) {
      return false
    }
    this._allMessages!.push({
      severity: 1,
      message: `Unknown identifier "${t.text}"`,
      range: t.range,
    })
    return true
  }

  /** Definition link from `token` to `target`, or to what the token resolves to when omitted. */
  private definitionLink(token: Token, target?: { uri: string; range?: Token['range'] }) {
    const resolved = target ?? this.toRangeTarget(this.getDefinitionFor(token))
    if (!resolved) {
      return undefined
    }
    const range = resolved.range ?? zeroRange
    return [
      {
        targetUri: resolved.uri,
        targetRange: range,
        targetSelectionRange: range,
        originSelectionRange: token.range,
      },
    ]
  }

  /** Links to the field(s) a type path names: through a union, to each of its fields. */
  private fieldLinks(token: Token, unwound: TUnwound | undefined) {
    const links = (unwound?.fields ?? (unwound ? [unwound] : [])).flatMap(f =>
      f.node
        ? this.definitionLink(token, {
            uri: this.declaringDoc(f.node, f.doc).id,
            range: f.node.token('identifier')?.range,
          })!
        : []
    )
    return links.length > 0 ? links : undefined
  }

  private toRangeTarget(def?: { uri: string; token?: Token }) {
    return def && { uri: def.uri, range: def.token?.range }
  }

  getToDefinitionAt(line: number, character: number) {
    const token = this.tokensIndex.at(line, character)
    if (token) {
      // Type-reference annotation argument (`@x.y Order`): resolve like any type reference.
      // Checked first — the argument's parent node is the annotated prop (or annotate entry),
      // which the branches below would mistake for the token's own declaration.
      if (token.annotationRef && token.isReference) {
        return this.definitionLink(token)
      }
      // Value argument naming a declared value (`valueScope`): jump to where it is declared.
      // Also first, for the same reason.
      const declared = getDeclaredValue(token, this)?.definition
      if (declared) {
        return this.definitionLink(token, { uri: declared.doc.id, range: declared.token.range })
      }
      // Annotate entry refs resolve through the target interface
      const annotateBlock = this.annotateBlockAt(line, character)
      if (annotateBlock && isRef(token.parentNode)) {
        const targetName = annotateBlock.targetName
        const entryRef = token.parentNode
        // Build chain: [entryId, ...chainUpToToken] for chains, or [tokenText] for identifiers
        const chain: string[] =
          token.isChain && typeof token.index === 'number'
            ? [entryRef.id!, ...entryRef.chain.slice(0, token.index).map(c => c.text)]
            : [token.text]
        return this.fieldLinks(token, this.unwindType(targetName, chain))
      }
      // Field refs (query field refs, field-path string args up to the segment under the cursor)
      const fieldRef = resolveFieldRefAt(token, this, character)
      if (fieldRef) {
        const propRange = fieldRef.prop.token('identifier')?.range ?? zeroRange
        return [
          {
            targetUri: fieldRef.doc.id,
            targetRange: propRange,
            targetSelectionRange: propRange,
            originSelectionRange: fieldRef.range,
          },
        ]
      }
      // Query type refs (`Customer` in `Customer.name`); unresolved query field refs
      if (isQueryFieldRef(token.parentNode)) {
        const { typeRef, queryArgToken } = token.parentNode
        if (token === typeRef && queryArgToken && getQueryScope(queryArgToken, this)) {
          return this.definitionLink(token)
        }
        return undefined
      }
      if (isProp(token.parentNode)) {
        return this.definitionLink(token, { uri: this.id, range: token.range })
      }
      if (token.isChain && isRef(token.parentNode) && token.index === 0) {
        // (the head of a chain: the declaration it names — an intersection alias too, not what it
        // merges)
        const owner = this.resolveRefOwner(token.parentNode)
        return owner?.node
          ? this.definitionLink(token, {
              uri: owner.doc.id,
              range: owner.node.token('identifier')?.range,
            })
          : undefined
      }
      if (token.isChain && isRef(token.parentNode) && typeof token.index === 'number') {
        const id = token.parentNode.id!
        return this.fieldLinks(
          token,
          this.unwindType(id, token.parentNode.chain.slice(0, token.index))
        )
      } else {
        return this.definitionLink(token)
      }
    }
  }

  registerImport({ from, imports, block }: { from: Token; imports: Token[]; block: Token }) {
    const importId = resolveAtscriptFromPath(from.text, this.id)
    this.imports.set(importId, { from, imports })
    this.blocksIndex.add(block)
    block.blockType = 'import'
    block.fromPath = from.text
    this.tokensIndex.add(from)
    from.fromPath = from.text
    imports.forEach(t => {
      t.imported = true
      t.fromPath = from.text
      this.registerDefinition(t, true)
      this.tokensIndex.add(t)
      this.importedDefs.set(t.text, from)
    })
  }

  private _nextTypeId = 0

  nextTypeId(): number {
    return this._nextTypeId++
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
      const absolutePath = this.resolveImportId(resolveAtscriptFromPath(def.fromPath, this.id))
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
    for (const [key, token] of this.registry.definitions) {
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
      ].filter(r => r.l !== undefined)
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
        ...this.importMessages,
      ] as TMessages
      // Validate interface extends targets
      for (const node of this.nodes) {
        if (isInterface(node) && (node as SemanticInterfaceNode).hasExtends) {
          const iface = node as SemanticInterfaceNode
          for (const t of iface.extendsTokens) {
            if (t.text === iface.id) {
              this._allMessages.push({
                severity: TSeverity.Error,
                message: `Interface "${iface.id}" cannot extend itself`,
                range: t.range,
              })
            }
          }
          // Check for prop overrides: own props that shadow parent props
          const ownDef = iface.getDefinition()
          if (ownDef && isStructure(ownDef)) {
            const parentProps = new Map<string, string>()
            for (const t of iface.extendsTokens) {
              if (t.text === iface.id) {
                continue
              }
              const unwound = this.unwindType(t.text)
              if (!unwound?.def) {
                continue
              }
              let parentDef = unwound.def
              if (isInterface(parentDef)) {
                if ((parentDef as SemanticInterfaceNode).hasExtends) {
                  const resolved = unwound.doc.resolveInterfaceExtends(
                    parentDef as SemanticInterfaceNode
                  )
                  if (resolved && isStructure(resolved)) {
                    for (const [name] of resolved.props) {
                      parentProps.set(name, t.text)
                    }
                    continue
                  }
                }
                parentDef = parentDef.getDefinition() || parentDef
              }
              if (isStructure(parentDef)) {
                for (const [name] of parentDef.props) {
                  parentProps.set(name, t.text)
                }
              }
            }
            for (const [name, prop] of ownDef.props) {
              const parentName = parentProps.get(name)
              if (parentName) {
                const propToken = prop.token('identifier')
                if (propToken) {
                  this._allMessages.push({
                    severity: TSeverity.Error,
                    message: `Property "${name}" already exists in parent "${parentName}" — override in extends is not allowed`,
                    range: propToken.range,
                  })
                }
              }
            }
          }
        }
      }
      for (const t of this.referred) {
        // A type-reference annotation argument (`@x.y Dict`) resolves like any type
        // reference, wherever it is written — also inside an `annotate` block, where the
        // enclosing block must not turn it into an entry of the annotate target.
        // A query field ref's type qualifier (`Country.active`) is likewise a plain type
        // reference, not an entry of the enclosing annotate target.
        if (t.annotationRef || isQueryFieldRef(t.parentNode)) {
          this.reportUnknownIdentifier(t)
          continue
        }
        // Annotate entry refs resolve through the target interface
        // e.g. `annotate User { firstName }` → validates firstName as User.firstName
        const annotateBlock = this.annotateBlockAt(t.range.start.line, t.range.start.character)
        if (annotateBlock) {
          const targetName = annotateBlock.targetName
          if (!this.registry.isDefined(targetName)) {
            continue // target itself is unknown, already reported separately
          }
          const chain =
            isRef(t.parentNode) && t.parentNode.hasChain
              ? [t.text, ...t.parentNode.chain.map(c => c.text)]
              : [t.text]
          // The entry names a node of the structure model; its type:
          // the types written there (see `entryType`).
          const entry = this.entryType(annotateBlock, chain)
          if (entry === undefined) {
            continue // (a target the model does not know: reported as an unknown identifier)
          }
          const resolvedType = entry?.def
          if (!entry) {
            const lastToken =
              chain.length > 1 && isRef(t.parentNode)
                ? t.parentNode.chain[t.parentNode.chain.length - 1] || t
                : t
            this._allMessages.push({
              severity: 1,
              message: `Unknown property "${chain.join('.')}" in "${targetName}"`,
              range: lastToken.range,
            })
          }
          // (the chain's members are props on the way: a path found for the chain goes through
          // each of them, or through the target's own props it is cut to)
          // Deferred from parse time: validate type-guarded annotations on the
          // entry (e.g. `@expect.minLength` wants string|array) against the
          // resolved target prop type. Imported targets — and union/intersection
          // or chained targets — only resolve here, after cross-file
          // dependencies are wired.
          if (resolvedType && isRef(t.parentNode) && t.parentNode.annotations) {
            for (const a of t.parentNode.annotations) {
              const spec = this.resolveAnnotation(a.token.text.slice(1))
              const msgs = spec?.validateTargetType(resolvedType, a.token.range, entry?.doc)
              if (msgs) {
                this._allMessages.push(...msgs)
              }
            }
          }
          continue
        }
        if (this.reportUnknownIdentifier(t)) {
          continue
        }
        if (isRef(t.parentNode)) {
          circularAlias = false
          const unwound = this.unwindRef(t.parentNode)
          const def = unwound?.def
          if (!def && circularAlias && !t.parentNode.hasChain) {
            this._allMessages.push({
              severity: 1,
              message: `Circular type alias "${t.parentNode.id!}": it resolves to itself`,
              range: t.range,
            })
            continue
          }
          if (isPrimitive(def) && !def.config.type && !this.chainToNever(t.parentNode)) {
            // disallow using primitives with undefined type (a chain to a prop a merge made
            // `never` is that `never` — its merge reported, see `neverMessages`)
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
              circularChain = false
              const decl = this.unwindType(t.parentNode.id!, t.parentNode.chain.slice(0, i + 1))
              if (!decl?.def) {
                const chain = [
                  t.parentNode.id!,
                  ...t.parentNode.chain.slice(0, i + 1).map(c => c.text),
                ]
                this._allMessages.push({
                  severity: 1,
                  message: circularChain
                    ? `Circular chain reference "${chain.join('.')}": it resolves to itself`
                    : `Unknown member "${token.text}"`,
                  range: token.range,
                })
              }
            }
            // (a path through a union naming several fields: all phantom, or none)
            const phantom = unwound?.fields?.filter(f => isPhantomPrimitive(f.def)).length ?? 0
            if (phantom > 0 && phantom < unwound!.fields!.length) {
              const path = [t.parentNode.id!, ...t.parentNode.chain.map(c => c.text)].join('.')
              this._allMessages.push({
                severity: 1,
                message: `"${path}" names phantom and non-phantom fields through a union: the fields of a type path must be all phantom or all data`,
                range: t.parentNode.chain[t.parentNode.chain.length - 1].range,
              })
            }
          }
        }
      }
      // Deferred annotation validation: type-introspecting checks (the `defType`
      // guard on inline props and plugin `validate` hooks) run here, after
      // cross-file dependencies are wired, so imported field types resolve the
      // same way they do at codegen time. Running them at parse time
      // (registerAnnotation) saw unresolved imports and produced spurious
      // diagnostics. Annotate-block entries' `defType` guard is handled by the
      // `referred` loop above and skipped inside `validateDeferred`.
      for (const a of this.annotations) {
        const spec = this.resolveAnnotation(a.name)
        if (spec) {
          this._allMessages.push(...(spec.validateDeferred(a.token, a.args, this) || []))
        }
      }
      this._allMessages.push(...this.neverMessages())
      this._allMessages.push(...this.unreachableBlockMessages())
      this._allMessages.push(...this.structureMessages(this._allMessages))
    }
    return this._allMessages
  }

  /**
   * The structure model's compile errors of this module: a union member of a
   * merge on a recursion cycle, too many merge classes, a type operand of its own merge.
   */
  private structureMessages(known: TMessages): TMessages {
    const out: TMessages = []
    const sameLine = (a: TMessages[number]['range'], b: TMessages[number]['range']) =>
      a.start.line === b.start.line
    for (const e of this.structure().structureErrors()) {
      if (e.doc !== this) {
        continue
      }
      const range = e.node?.token('identifier')?.range ??
        this.nodes[0]?.token('identifier')?.range ?? {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        }
      // (an annotate entry the document reports already: one diagnostic)
      if (e.entry && known.some(m => m.severity === TSeverity.Error && sameLine(m.range, range))) {
        continue
      }
      if (!out.some(m => m.message === e.message && m.range === range)) {
        out.push({ severity: TSeverity.Error, message: e.message, range })
      }
    }
    return out
  }

  private _structure?: { epoch: number; model: StructureModel }

  /**
   * Why a scalar merge of the core algebra (`node`: written types, merged here when an
   * intersection) has `never` in it — itself, a tuple item, an array element (what
   * generated code prints as `never`) —; `undefined` when nothing is `never`. A union's branch
   * with nothing in common is dropped (`X | never` = X), and references are other declarations'.
   */
  neverReasonIn(node: SemanticNode | undefined, depth = 0): string | undefined {
    if (!node || depth > 50) {
      return undefined
    }
    const merged = unparenthesized(isIntersection(node) ? this.mergeIntersection(node) : node)
    const reason = neverReasons.get(merged)
    if (reason) {
      return reason
    }
    if (isTuple(merged)) {
      for (const item of merged.unwrap()) {
        const r = this.neverReasonIn(item, depth + 1)
        if (r) {
          return r
        }
      }
    } else if (isArray(merged)) {
      return this.neverReasonIn(merged.getDefinition(), depth + 1)
    }
    return undefined
  }

  /**
   * The structure model of this document and those it imports (directly or not), per documents'
   * epoch: what diagnostics read (blocks of importers change metadata only).
   */
  structure(): StructureModel {
    if (this._structure?.epoch !== epoch) {
      this._structure = { epoch, model: new StructureModel([this]) }
    }
    return this._structure.model
  }

  private _buildStructure?: { epoch: number; model: StructureModel }

  /**
   * The structure model of this document and those importing it (directly or not), per
   * documents' epoch: every block of the build that may write into this document's types.
   */
  buildStructure(): StructureModel {
    if (this._buildStructure?.epoch !== epoch) {
      this._buildStructure = {
        epoch,
        model: new StructureModel([this, ...this.transitive('dependants')]),
      }
    }
    return this._buildStructure.model
  }

  /** Whether chain ref `ref` names a field a merge makes `never` (the structure model's shape). */
  private chainToNever(ref: SemanticRefNode): boolean {
    if (!ref.hasChain || !ref.id) {
      return false
    }
    // (through a union: every field it names)
    const m = this.structure()
    const t = m.exprOf(this, ref)
    const chains = t.k === 'uni' ? t.items : [t]
    return chains.every(c => {
      const slot = c.k === 'chain' ? m.slotAt(c.decl, c.path) : undefined
      return !!slot && m.slotShape(slot).k === 'never'
    })
  }

  /**
   * Warnings for the positions of this document's declarations an unmergeable merge makes
   * `never` (see `StructureModel.neverWarnings`).
   */
  private neverMessages(): TMessages {
    const messages: TMessages = []
    // (a module refused as too complex is not built: its merges are not computed — bounded time)
    const refused = this.structure()
      .structureErrors()
      .some(
        e =>
          e.doc === this &&
          (e.message === MERGE_TOO_COMPLEX || e.message === UNION_IN_RECURSIVE_MERGE)
      )
    if (refused) {
      return messages
    }
    for (const { decl, path, reason } of this.structure().neverWarnings(this)) {
      const token = decl.node.token('identifier')
      if (token && reason === MERGE_TOO_COMPLEX) {
        // (a merge distributing past the bound is the "merge too complex" error at the type)
        messages.push({ severity: TSeverity.Error, message: MERGE_TOO_COMPLEX, range: token.range })
      } else if (token) {
        messages.push({
          severity: TSeverity.Warning,
          message: `Intersection of ${reason} cannot be merged${path.length > 0 ? ` at "${decl.name}.${path.join('.')}"` : ` in "${decl.name}"`}; the type resolves to never`,
          range: token.range,
        })
      }
    }
    return messages
  }

  /**
   * Errors for references to a type another document does not export, in definitions inlined
   * from that document (`extends`, an intersection member, `annotate … as …`): the generated
   * code of this document would have to import it from there. Checks what codegen emits (see
   * {@link emittedRefs}).
   */
  /**
   * Warnings for the mutating `annotate` blocks of this document whose target another document
   * declares, when the block is not reachable: the declaring document does not import this one
   * (directly or not), and a document using the target does not either. A block is part of its
   * target's definition, built into whatever uses the target in the same build — a build of a
   * document using it without this one (another entry, the target's package built on its own)
   * would not have it.
   */
  private unreachableBlockMessages(): TMessages {
    const messages: TMessages = []
    // (whether a document imports this one, directly or not: each found once)
    const known = new Map<AtscriptDoc, boolean>()
    const importsThis = (d: AtscriptDoc) => {
      let hit = known.get(d)
      if (hit === undefined) {
        hit = d.transitive('dependencies').has(this)
        known.set(d, hit)
      }
      return hit
    }
    for (const node of this.nodes) {
      if (!isAnnotate(node) || !node.isMutating) {
        continue
      }
      // (what it annotates: a plain alias's target)
      const owner = this.blockTarget(node)
      const target = owner?.doc
      if (!target || !owner.node || target === this || importsThis(target)) {
        continue
      }
      const missing = [...target.documentsUsing(owner.node)].filter(
        d => d !== this && !importsThis(d)
      )
      if (missing.length > 0) {
        const token = node.token('target')!
        const users = missing.map(d => relDocPath(this.id, d.id)).sort()
        messages.push({
          severity: 2,
          message: `"${owner.node.id}" (declared in ${relDocPath(this.id, target.id)}) is used by ${users.join(', ')} without importing this file (directly or not): this annotate applies only in builds including this file — import it from ${relDocPath(this.id, target.id)} or from the files using "${owner.node.id}"`,
          range: token.range,
        })
      }
    }
    return messages
  }

  /**
   * The documents using declaration `decl` (of this document) other than through mutating
   * `annotate` blocks: this one when another of its declarations references it, and those
   * importing it that reference it.
   */
  documentsUsing(decl: SemanticNode): Set<AtscriptDoc> {
    const out = new Set<AtscriptDoc>()
    const name = decl.id
    if (!name) {
      return out
    }
    // (a reference inside the declaration itself — a recursive type — is the type, not a use;
    // nor is an import, nor an `annotate` block's target)
    const own = declarationTokens(decl)
    const uses = (doc: AtscriptDoc) =>
      doc.referred.some(
        t =>
          t.text === name &&
          !t.imported &&
          !isMutatingTarget(t) &&
          !own.has(t) &&
          doc.getDeclarationOwnerNode(name)?.node === decl
      )
    if (uses(this)) {
      out.add(this)
    }
    for (const d of this.dependants) {
      // (what is derived from this answer depends on each importer's uses: read, see
      // `recordDocumentReads`)
      recordRead(d)
      if (d !== this && uses(d)) {
        out.add(d)
      }
    }
    return out
  }

  /**
   * Merges an intersection (anything else is returned as it is): scalars by the core algebra,
   * objects into their structural prop union (see `propUnion`), a union operand distributed. The
   * same node every time (until a document changes). Generated code reads the structure model
   *; this is for build-time readers and the scalar merges.
   */
  mergeIntersection(node: SemanticNode): SemanticNode {
    if (!isIntersection(node)) {
      return node
    }
    const known = cache().merged.get(node)
    if (known) {
      return known
    }
    if (merging.has(node)) {
      // (re-entered through distributed unions: a recursion, kept as it is)
      return node
    }
    merging.add(node)
    try {
      const merged = this.mergeGroup(node)
      cache().merged.set(node, merged)
      return merged
    } finally {
      merging.delete(node)
    }
  }

  private mergeGroup(node: SemanticGroup): SemanticNode {
    const nodes = this.intersectionOperands(node)
    if (nodes.length === 0) {
      return node
    }
    if (nodes.length === 1) {
      // `type X = A & X`: `A`, merged into its own structure like any intersection of objects
      // (an alias of `A` would reference `X` from inside the type it copies).
      const def = node.unwrap().length > 1 ? this.mergeMember(nodes[0], this).def : undefined
      if (isIntersection(def)) {
        // `M & M` with `type M = A & B`: `M`'s merge
        return this.mergeIntersection(def)
      }
      return isStructure(def) || isInterface(def) ? this.mergeDefs(nodes[0], nodes[0])[0] : nodes[0]
    }
    const newGroup = [] as SemanticNode[]
    let left = nodes[0]
    for (let i = 1; i < nodes.length; i++) {
      const right = nodes[i]
      const merged = this.mergeDefs(left, right)
      if (merged.length === 2) {
        newGroup.push(merged[0])
        left = merged[1]
      } else {
        left = merged[0]
      }
    }
    if (newGroup.length > 0) {
      newGroup.push(left)
      // An intersection with `never` (`string.email & 'x' & 'y'`) is `never`.
      const never = newGroup.find(n => isRef(n) && this.unwindRef(n)?.def?.id === 'never')
      return never ?? new SemanticGroup(newGroup, '&')
    }
    // A union distributed into one intersection (`(A | null) & B` is `A & B`): merged too.
    if (isIntersection(left) && left !== node) {
      return this.mergeIntersection(left)
    }
    return left
  }

  /**
   * The operands of intersection `group`, a nested intersection (`E & (B & A)`, or a reference
   * to an intersection alias) contributing its own: they all merge as one (`A & A` is `A`).
   */
  private intersectionOperands(group: SemanticGroup): SemanticNode[] {
    const operands: SemanticNode[] = []
    /** Intersections expanded (`type X = A & X` must not expand forever). */
    const expanded = new Set<SemanticNode>([group])
    const add = (node: SemanticNode) => {
      node = unparenthesized(node)
      const def = isRef(node) ? this.unwindRef(node)?.def : node
      const nested = def && unparenthesized(def)
      if (isIntersection(nested)) {
        if (!expanded.has(nested)) {
          expanded.add(nested)
          nested.unwrap().forEach(add)
        }
      } else {
        // (a type repeated counts once, where it last occurs: the later member wins — its
        // annotations, and the members of the merges nested in it, see `planScope`)
        const same = operands.findIndex(o => this.sameOperand(o, node))
        if (same >= 0) {
          operands.splice(same, 1)
        }
        operands.push(node)
      }
    }
    group.unwrap().forEach(add)
    return operands
  }

  /**
   * The definition `def` of an optional prop intersected with `other` of a required one: `def |
   * null` when `other` may be `null` (an optional prop passes `null`), else `def`. The same node
   * for the same `def` (a merge must build the same nodes every time, see `memoMerge`).
   */
  private orNullFor(def: SemanticNode, other: SemanticNode): SemanticNode {
    const nullDef = this.unwindRef(createSyntheticRef('null'))?.def
    const otherDef = this.mergeMember(other, this).def
    if (!nullDef || !otherDef || !this.mayIntersect(nullDef, otherDef)) {
      return def
    }
    let nullable = nullableDefs.get(def)
    if (!nullable) {
      nullable = new SemanticGroup([def, createSyntheticRef('null')], '|')
      nullableDefs.set(def, nullable)
    }
    return nullable
  }

  /**
   * The merge of a merged field's contributors' written types (`optional`: written `?`): an
   * optional one passes `null` when a required one may be `null` (see {@link orNullFor}), as the
   * merge of their props does.
   */
  mergeFieldTypes(cs: Array<{ def: SemanticNode; optional: boolean }>): SemanticNode {
    const required = cs.filter(c => !c.optional)
    const defs = cs.map(c =>
      c.optional && required.length > 0
        ? required.reduce((d, o) => this.orNullFor(d, o.def), c.def)
        : c.def
    )
    return defs.length > 1 ? this.mergeIntersection(new SemanticGroup(defs, '&')) : defs[0]
  }

  /**
   * Whether intersection operands `a` and `b` are the same type: the same node (or copies of
   * it), or references to it (`A & A` is `A`, `(A | B) & (A | B)` is `A | B`, like TypeScript).
   */
  private sameOperand(a: SemanticNode, b: SemanticNode): boolean {
    if (a === b) {
      return true
    }
    if (!isRef(a) && !isRef(b)) {
      return false
    }
    const da = isRef(a) ? this.unwindRef(a)?.def : a
    const db = isRef(b) ? this.unwindRef(b)?.def : b
    if (!da || !db || da !== db) {
      return false
    }
    // The same definition reached through different annotated aliases or props
    // (`S3 & string`, with `@expect.minLength 3` on `type S3 = string`) is not the same type.
    const ma = this.operandAnnotations(a)
    const mb = this.operandAnnotations(b)
    return ma.length === mb.length && ma.every((an, i) => an === mb[i])
  }

  /**
   * The annotations an intersection operand carries on top of its resolved definition: those
   * of the aliases and props its reference goes through (`S3` of `type S3 = string` with
   * `@expect.minLength 3`, `A.x`'s prop annotations), nearest first. None for a definition
   * written inline.
   */
  private operandAnnotations(node: SemanticNode): TAnnotationTokens[] {
    node = unparenthesized(node)
    if (!isRef(node)) {
      return node.annotations ?? []
    }
    const out: TAnnotationTokens[] = [...(node.annotations ?? [])]
    const nodes: SemanticNode[] = []
    const unwound = this.refOrigin(node).unwindType(
      node.id!,
      node.chain,
      (intermediate, declaring) => {
        if (!declaring && intermediate.annotations?.length && !nodes.includes(intermediate)) {
          nodes.push(intermediate)
        }
      }
    )
    if (unwound?.node && unwound.node.annotations?.length && !nodes.includes(unwound.node)) {
      nodes.unshift(unwound.node)
    }
    for (const n of nodes) {
      // the resolved definition's own (a primitive's) are its checks, not the reference's
      if (n !== unwound?.def) {
        out.push(...n.annotations!)
      }
    }
    return out
  }

  /**
   * An intersection member, unwound through a reference, and the document declaring it (`doc`
   * for one that is not a reference).
   */
  private mergeMember(
    node: SemanticNode,
    doc: AtscriptDoc
  ): { def?: SemanticNode; doc: AtscriptDoc } {
    node = unparenthesized(node)
    if (!isRef(node)) {
      return { def: node, doc }
    }
    // (a declaration: its definition as generated code builds from it)
    const unwound = this.declRef(node)
    const def = unwound?.def && unparenthesized(unwound.def)
    return { def, doc: unwound?.doc ?? this }
  }

  /** The props an intersection member contributes: an interface's include inherited ones. */
  private memberProps(
    node: SemanticStructureNode | SemanticInterfaceNode,
    doc: AtscriptDoc
  ): Map<string, SemanticPropNode> {
    const resolved = isInterface(node) ? doc.resolveInterfaceExtends(node) : undefined
    return resolved && isStructure(resolved) ? resolved.props : node.props
  }

  mergeDefs(
    _left: SemanticNode,
    _right: SemanticNode
  ): [SemanticNode] | [SemanticNode, SemanticNode] {
    return this.mergeOperands(_left, this, _right, this)
  }

  /**
   * {@link mergeDefs} of operands written in documents `leftDoc` / `rightDoc` (where a member
   * that is not a reference resolves its `extends`).
   */
  private mergeOperands(
    _left: SemanticNode,
    leftDoc: AtscriptDoc,
    _right: SemanticNode,
    rightDoc: AtscriptDoc
  ): [SemanticNode] | [SemanticNode, SemanticNode] {
    // (a merge that could not be merged stays that `never`, with its reason)
    for (const side of [_left, _right]) {
      if (neverReasons.has(unparenthesized(side))) {
        return [unparenthesized(side)]
      }
    }
    const l = this.mergeMember(_left, leftDoc)
    const r = this.mergeMember(_right, rightDoc)
    if (!l.def || !r.def) {
      return [_left, _right]
    }
    if (isUnion(l.def) || isUnion(r.def)) {
      return memoMerge(l.def, r.def, () => this.mergeUnions(_left, l, _right, r))
    }
    if (isIntersection(l.def) || isIntersection(r.def)) {
      // A distributed intersection (see `mergeUnions`) intersected further: one intersection.
      return [this.mergeIntersection(new SemanticGroup([_left, _right], '&'))]
    }
    if (isScalar(l.def) && isScalar(r.def)) {
      return this.mergeScalars(_left, l.def, _right, r.def)
    }
    return this.mergeResolvedDefs(l.def, l.doc, r.def, r.doc)
  }

  /**
   * Scalars (primitives and literals, resolved: `left` / `right`) intersected, like TypeScript:
   * `never` when they have no value in common; a literal narrows a primitive of its type
   * (`'x' & string` is `'x'`), an extension its base (`string & string.email` is
   * `string.email`, which carries the base's constraints too). A side is dropped only when it
   * checks nothing the other does not — no annotations of its own or of the aliases and props
   * its reference goes through (`@expect.minLength 3 type S3 = string`), no built-in checks
   * (an extension's, `decimal`'s format) — so the result does not depend on the operand order.
   * Otherwise (`string.email & string.uuid`, a literal and an extension, `S3 & L4`) both stay,
   * a runtime intersection checking both.
   */
  private mergeScalars(
    _left: SemanticNode,
    left: SemanticNode,
    _right: SemanticNode,
    right: SemanticNode
  ): [SemanticNode] | [SemanticNode, SemanticNode] {
    if (scalarsDisjoint(left, right)) {
      return [neverMerge(NOTHING_IN_COMMON)]
    }
    const both: [SemanticNode, SemanticNode] = [_left, _right]
    const lRef = this.operandAnnotations(_left).length > 0
    const rRef = this.operandAnnotations(_right).length > 0
    const samePrimitive =
      isPrimitive(left) && isPrimitive(right) && (left === right || left.key === right.key)
    if (samePrimitive || (isConst(left) && isConst(right))) {
      // The same primitive, or equal literals (not disjoint): the same checks but those the
      // references carry.
      if (lRef && rRef) {
        return this.sameOperand(_left, _right) ? [_left] : both
      }
      return [rRef ? _right : _left]
    }
    if (isConst(left) || isConst(right)) {
      const [lit, prim, primRef] = isConst(left) ? [_left, right, rRef] : [_right, left, lRef]
      if (isPrimitive(prim) && scalarDomain(prim) !== undefined) {
        return primRef || primitiveChecks(prim) ? both : [lit]
      }
      return both
    }
    const l = left as SemanticPrimitiveNode
    const r = right as SemanticPrimitiveNode
    if (r.key.startsWith(`${l.key}.`)) {
      return lRef || !extensionCovers(r, l) ? both : [_right]
    }
    if (l.key.startsWith(`${r.key}.`)) {
      return rRef || !extensionCovers(l, r) ? both : [_left]
    }
    return both
  }

  /**
   * What a definition (resolved) can be, for {@link mayIntersect}: an object, an array (or a
   * tuple), a scalar (itself) — `undefined` when not known (a union, an intersection of no
   * objects nor arrays).
   */
  private valueShape(
    def?: SemanticNode,
    seen = new Set<SemanticNode>()
  ): 'object' | 'array' | 'never' | SemanticNode | undefined {
    if (isStructure(def) || isInterface(def)) {
      return 'object'
    }
    if (isArray(def) || isTuple(def)) {
      return 'array'
    }
    if (isScalar(def)) {
      return def
    }
    if (isIntersection(def) && !seen.has(def)) {
      // An intersection with an object (or an array) member is an object (an array), or never;
      // one of scalars a scalar, or never when two of them have no value in common (a branch of
      // a distributed union: `string & number`, `null & null & { k?: string }`).
      seen.add(def)
      let shape: 'object' | 'array' | undefined
      const scalars: SemanticNode[] = []
      for (const member of def.unwrap()) {
        const s = this.valueShape(this.mergeMember(member, this).def, seen)
        if (s === 'never') {
          return 'never'
        }
        if (s === 'object' || s === 'array') {
          if (shape && shape !== s) {
            return 'never'
          }
          shape = s
        } else if (s !== undefined) {
          scalars.push(s)
        }
      }
      if (scalars.some((a, i) => scalars.some((b, j) => j > i && scalarsDisjoint(a, b)))) {
        return 'never'
      }
      if (shape && scalars.some(s => scalarDomain(s) !== undefined)) {
        return 'never'
      }
      return (
        shape ??
        (scalars.length > 0 && scalars.length === def.unwrap().length ? scalars[0] : undefined)
      )
    }
    return undefined
  }

  /**
   * Whether a value may match both definitions (resolved): not a scalar and an object or array,
   * nor scalars having no value in common (see `scalarsDisjoint`), nor an array and an object.
   * When not known (a union, …), it may.
   */
  private mayIntersect(a?: SemanticNode, b?: SemanticNode): boolean {
    const sa = this.valueShape(a)
    const sb = this.valueShape(b)
    if (sa === 'never' || sb === 'never') {
      return false
    }
    if (sa === undefined || sb === undefined) {
      return true
    }
    if (typeof sa === 'object' && typeof sb === 'object') {
      return !scalarsDisjoint(sa, sb)
    }
    return sa === sb
  }

  /**
   * An intersection with a union, distributed (`(A | null) & B` is `(A & B) | (null & B)`): the
   * union of the intersections of the branches that can match together (`null & B` cannot).
   * Each stays an intersection, merged by a reader stepping into it — merging
   * them here would multiply the merges of every union nested in their props. A branch whose
   * merge is `never` (`2 & (number & 1)`) is no branch. However many branches there are.
   */
  private mergeUnions(
    _left: SemanticNode,
    left: { def?: SemanticNode; doc: AtscriptDoc },
    _right: SemanticNode,
    right: { def?: SemanticNode; doc: AtscriptDoc }
  ): [SemanticNode] | [SemanticNode, SemanticNode] {
    // A union's branches, a branch that is a union itself (`(A | B) | C`, or a reference to a
    // union type) contributing its own.
    const branches = (operand: SemanticNode, side: { def?: SemanticNode; doc: AtscriptDoc }) => {
      const out: Array<{ node: SemanticNode; def?: SemanticNode }> = []
      const expanded = new Set<SemanticNode>()
      const add = (node: SemanticNode, def: SemanticNode | undefined, doc: AtscriptDoc) => {
        // (a branch that is an intersection distributing into a union — `A | (B & (C | D))`:
        // that union's branches, as the runtime distributes them)
        if (isIntersection(def) && !expanded.has(def)) {
          const merged = unparenthesized(this.mergeIntersection(def))
          if (isUnion(merged)) {
            expanded.add(def)
            for (const item of merged.unwrap()) {
              out.push({ node: item, def: item })
            }
            return
          }
        }
        if (!isUnion(def)) {
          out.push({ node, def })
        } else if (!expanded.has(def)) {
          expanded.add(def)
          for (const item of def.unwrap()) {
            const member = this.mergeMember(item, doc)
            add(item, member.def, member.doc)
          }
        }
      }
      add(operand, side.def, side.doc)
      return out
    }
    const leftBranches = branches(_left, left)
    const rightBranches = branches(_right, right)
    const out: SemanticNode[] = []
    for (const l of leftBranches) {
      for (const r of rightBranches) {
        if (this.mayIntersect(l.def, r.def)) {
          const branch = new SemanticGroup([l.node, r.node], '&')
          if (!this.mergesToNever(branch)) {
            out.push(branch)
          }
        }
      }
    }
    if (out.length === 0) {
      return [createSyntheticRef('never')]
    }
    return [out.length === 1 ? out[0] : new SemanticGroup(out, '|')]
  }

  /** Whether intersection `group` (a distributed branch) merges into `never`. */
  private mergesToNever(group: SemanticGroup): boolean {
    const merged = unparenthesized(this.mergeIntersection(group))
    return (
      isRef(merged) && (neverReasons.has(merged) || this.unwindRef(merged)?.def?.id === 'never')
    )
  }

  private mergeResolvedDefs(
    left: SemanticNode,
    leftDoc: AtscriptDoc,
    right: SemanticNode,
    rightDoc: AtscriptDoc
  ): [SemanticNode] | [SemanticNode, SemanticNode] {
    if (isArray(left) && isArray(right)) {
      // `A[] & B[]`: arrays of `A & B` (merged by a reader stepping into it, see `mergeUnions`).
      return memoMerge(left, right, () => {
        const array = new SemanticArrayNode()
        array.define(new SemanticGroup([left.getDefinition()!, right.getDefinition()!], '&'))
        array.annotations = this.mergeNodesAnnotations(left.annotations, right.annotations)
        return [array]
      })
    }
    if ((isTuple(left) || isArray(left)) && (isTuple(right) || isArray(right))) {
      // `[A] & [B]`: a tuple of the items' intersections (`[A & B]`, an array's element
      // intersecting each item); tuples of different lengths have no value in common.
      const items = (node: SemanticNode, length: number) =>
        isTuple(node) ? node.unwrap() : Array.from({ length }, () => node.getDefinition()!)
      const length = isTuple(left) ? left.unwrap().length : (right as SemanticGroup).unwrap().length
      if (isTuple(left) && isTuple(right) && left.unwrap().length !== right.unwrap().length) {
        return [createSyntheticRef('never')]
      }
      if (this.containsObject(left) && this.containsObject(right)) {
        // (tuples are written in place, no structure-model def: their items' objects cannot be
        // matched — `never`)
        return [neverMerge('tuples of objects')]
      }
      return memoMerge(left, right, () => {
        const l = items(left, length)
        const r = items(right, length)
        const tuple = new SemanticTupleNode()
        tuple.define(
          new SemanticGroup(
            l.map((item, i) => new SemanticGroup([item, r[i]], '&')),
            ','
          )
        )
        tuple.annotations = this.mergeNodesAnnotations(left.annotations, right.annotations)
        return [tuple]
      })
    }
    if (isPrimitive(left) && isPrimitive(right)) {
      // todo: properly merge primitives
      if (left.config.type === right.config.type) {
        return [left]
      }
      return [neverMerge(NOTHING_IN_COMMON)]
    }
    if ((isStructure(left) || isInterface(left)) && (isStructure(right) || isInterface(right))) {
      return [this.propUnion(left, leftDoc, right, rightDoc)]
    }
    // all other cases are not supported, returning never
    return [neverMerge(NOTHING_IN_COMMON)]
  }

  /** The one item of nullable union `def` (`X | null`) that is not `null` / `undefined`. */
  private nonNullItem(def: SemanticNode): SemanticNode | undefined {
    const group = unparenthesized(def)
    if (!isGroup(group) || group.op !== '|') {
      return undefined
    }
    const items = group.unwrap().filter(i => {
      // (`null & null`, a distributed all-nullable merge's: `null`)
      const item = this.mergeIntersection(unparenthesized(i))
      const d = isRef(item) ? this.unwindRef(item)?.def : item
      return !(isPrimitive(d) && (d.key === 'null' || d.key === 'undefined'))
    })
    return items.length === 1 && items.length < group.unwrap().length
      ? unparenthesized(items[0])
      : undefined
  }

  /** Whether a value of definition `def` may hold an object (a structure, an interface). */
  private containsObject(def: SemanticNode | undefined, seen = new Set<SemanticNode>()): boolean {
    const node = def && this.mergeMember(def, this).def
    if (!node || seen.has(node)) {
      return false
    }
    seen.add(node)
    if (isStructure(node) || isInterface(node)) {
      return true
    }
    if (isGroup(node)) {
      return node.unwrap().some(item => this.containsObject(item, seen))
    }
    return isArray(node) && this.containsObject(node.getDefinition(), seen)
  }

  /**
   * The structural prop union of two objects (an interface's props include those it inherits),
   * for build-time readers (generated code reads the structure model): a prop only one
   * side has is that side's own node (go-to-definition lands in its document); a prop both have
   * is a new prop — required if one side's is — whose definition is the intersection of theirs
   * (merged by a reader stepping into it; scalars merged here, by the core algebra), its
   * annotations the later side's over the earlier's.
   */
  private propUnion(
    left: SemanticStructureNode | SemanticInterfaceNode,
    leftDoc: AtscriptDoc,
    right: SemanticStructureNode | SemanticInterfaceNode,
    rightDoc: AtscriptDoc
  ): SemanticStructureNode {
    const props: SemanticPropNode[] = []
    const leftProps = this.memberProps(left, leftDoc)
    const rightProps = this.memberProps(right, rightDoc)
    for (const key of new Set([...leftProps.keys(), ...rightProps.keys()])) {
      const l = leftProps.get(key)
      const r = rightProps.get(key)
      if (!l || !r || l === r) {
        props.push((l ?? r)!)
        continue
      }
      const lDef = l.getDefinition()!
      const rDef = r.getDefinition()!
      const lOptional = !!l.token('optional')
      const rOptional = !!r.token('optional')
      let def: SemanticNode
      if (lDef === rDef && lOptional === rOptional) {
        def = lDef
      } else {
        // (an optional prop passes `null`: intersected with a required one that may be `null`, it
        // is `X | null`; a type repeated counts once, where it last occurs)
        const members: SemanticNode[] = []
        for (const d of [
          lOptional && !rOptional ? this.orNullFor(lDef, rDef) : lDef,
          rOptional && !lOptional ? this.orNullFor(rDef, lDef) : rDef,
        ].flatMap(d => {
          const u = unparenthesized(d)
          return isIntersection(u) ? u.unwrap() : [d]
        })) {
          const same = members.findIndex(m => this.sameOperand(m, d))
          const kept = same >= 0 ? members[same] : d
          if (same >= 0) {
            members.splice(same, 1)
          }
          members.push(kept)
        }
        def =
          members.length === 1
            ? members[0]
            : members.every(m => this.scalarsOnly(m))
              ? this.mergeIntersection(new SemanticGroup(members, '&'))
              : new SemanticGroup(members, '&')
        if (isPrimitive(def)) {
          // The full key: an extension (`number.int`) is not reachable by its own id.
          def = createSyntheticRef(def.key)
        }
      }
      const prop = new SemanticPropNode()
      prop.saveToken(l.token('identifier')!, 'identifier')
      prop.define(def)
      prop.annotations = this.mergeNodesAnnotations(l.annotations, r.annotations)
      keepOptional(prop, l, r)
      declaringDocs.set(prop, declaringDocs.get(l) ?? leftDoc)
      props.push(prop)
    }
    const merged = new SemanticStructureNode()
    merged.setProps(props)
    merged.annotations = this.mergeNodesAnnotations(left.annotations, right.annotations)
    return merged
  }

  /**
   * Whether definition `def` holds scalars only (primitives, literals, unions and intersections
   * of them, through references): what {@link propUnion} merges in place.
   */
  private scalarsOnly(def: SemanticNode, seen = new Set<SemanticNode>()): boolean {
    const node = unparenthesized(def)
    if (seen.has(node)) {
      return false
    }
    seen.add(node)
    if (isRef(node)) {
      const target = this.unwindRef(node)?.def
      return !!target && this.scalarsOnly(target, seen)
    }
    if (isGroup(node) && (node.op === '|' || node.op === '&')) {
      return node.unwrap().every(item => this.scalarsOnly(item, seen))
    }
    return isScalar(node)
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
  /**
   * The type-level annotations intersection `group` carries: those of the declarations its
   * operands name (interfaces, types, `annotate … as` aliases; intersections written in place
   * expanded), the later member winning (`append` ones concatenated) — with the node each comes
   * from. Generated code links them live (`.members(…)`) and writes these build-time values under
   * them (`.inherit(…)`).
   */
  intersectionAnnotations(
    group: SemanticGroup,
    blocks = false
  ): Array<{ node: SemanticNode; an: TAnnotationTokens }> {
    let out: Array<{ node: SemanticNode; an: TAnnotationTokens }> = []
    for (const ref of this.intersectionMemberRefs(group)) {
      const owner = this.resolveRefOwner(ref)!
      const node = owner.node!
      // (a field — a chain, `A.x` — is a member of its own: its type may merge `A` itself)
      const key = ref.hasChain ? chainKey(node, ref.chain) : node
      if (evaluatingMembers.has(key)) {
        // (an intersection alias including itself, `type X = A & X`: once)
        continue
      }
      evaluatingMembers.add(key)
      let anns: TAnnotationTokens[]
      try {
        // (an operand is a reference: without the `passedWhenReferred: false` ones; a field — a
        // chain — is what a reference to it gets: the field's, over its type's)
        anns =
          (ref.hasChain
            ? this.filterPassedWhenReferred(
                this.evalAnnotationsForDefinition(ref, undefined, undefined, blocks),
                true
              )
            : owner.doc.evalReferredAnnotations(node, blocks)) ?? []
      } finally {
        evaluatingMembers.delete(key)
      }
      const append = (an: TAnnotationTokens) => {
        const spec = this.resolveAnnotation(an.name)
        return !!spec?.config.multiple && spec.config.mergeStrategy === 'append'
      }
      const replaced = new Set(anns.filter(an => !append(an)).map(an => an.name))
      // (a later member's `append` values first, like the merge of annotations)
      out = [
        ...anns.filter(append).map(an => ({ node, an })),
        ...out.filter(p => !replaced.has(p.an.name)),
        ...anns.filter(an => !append(an)).map(an => ({ node, an })),
      ]
    }
    return out
  }

  /**
   * The references to declarations (interfaces, types, `annotate … as` aliases) whose type-level
   * annotations intersection `group` carries, lower priority first: its operands naming one
   * (intersections written in place expanded), looked through a nullable union (`(X | null) & Z`
   * is `X & Z`; an alias `XN = X | null`: X, then XN's own).
   */
  intersectionMemberRefs(group: SemanticGroup): SemanticRefNode[] {
    const out: SemanticRefNode[] = []
    const seen = new Set<SemanticNode>()
    const add = (written: SemanticNode) => {
      const item = unparenthesized(written)
      if (seen.has(item)) {
        return
      }
      seen.add(item)
      if (isIntersection(item)) {
        item.unwrap().forEach(add)
        return
      }
      if (isGroup(item) && item.op === '|') {
        // (a nullable union: its one item that is not `null` / `undefined`)
        const kept = item.unwrap().filter(i => {
          const def = isRef(unparenthesized(i))
            ? this.unwindRef(unparenthesized(i) as SemanticRefNode)?.def
            : undefined
          return !(isPrimitive(def) && (def.key === 'null' || def.key === 'undefined'))
        })
        if (kept.length === 1) {
          add(kept[0])
        }
        return
      }
      if (!isRef(item) || this.inlinedPrimitive(item)) {
        return
      }
      const node = this.resolveRefOwner(item)?.node
      if (
        !node ||
        !(
          node.entity === 'interface' ||
          node.entity === 'type' ||
          (isAnnotate(node) && !node.isMutating)
        )
      ) {
        return
      }
      const def =
        node.entity === 'type' && !item.hasChain
          ? unparenthesized(node.getDefinition()!)
          : undefined
      if (def && isGroup(def) && def.op === '|') {
        add(def)
      }
      out.push(item)
    }
    add(group)
    return out
  }

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

/**
 * A merged prop is optional when every member's is (a `never` one too: `{ u?: X | Y } & { u?: Z }`
 * accepts a value without `u`, as 0.1.110 did).
 */
function keepOptional(prop: SemanticPropNode, ...members: SemanticPropNode[]): void {
  const token = members[0]?.token('optional')
  if (token && members.every(m => m.token('optional'))) {
    prop.saveToken(token, 'optional')
  }
}

/** The declarations whose type-level annotations are being evaluated (see `intersectionAnnotations`). */
const evaluatingMembers = new Set<unknown>()

/** Why each `never` a merge built could not merge its members (see `neverReasonIn`). */
const neverReasons = new WeakMap<SemanticNode, string>()

/** A `never` for a merge of members whose slots cannot be matched (`shape`: why). */
function neverMerge(shape: string): SemanticRefNode {
  const never = createSyntheticRef('never')
  neverReasons.set(never, shape)
  return never
}

/** A reference to `name`; a dotted name (`number.int`) becomes the id plus a chain. */
function createSyntheticRef(name: string): SemanticRefNode {
  const ref = new SemanticRefNode()
  const token = (text: string) => new Token({ text, type: 'identifier', getRange: () => zeroRange })
  const [id, ...chain] = name.split('.')
  ref.saveToken(token(id), 'identifier')
  for (const part of chain) {
    ref.addChain(token(part))
  }
  return ref
}

/** `to`'s path relative to `from` (`./b.as`), or its id when not a file. */
function relDocPath(from: string, to: string): string {
  try {
    return `${getRelPath(from, to)}.as`
  } catch {
    return to
  }
}

/** Group `group` (a union, an intersection, a tuple, parentheses) with `items` instead. */
function withItems(group: SemanticGroup, items: SemanticNode[]): SemanticGroup {
  const copy = Object.create(group) as SemanticGroup
  ;(copy as unknown as { nodes: SemanticNode[] }).nodes = items
  return copy
}

/** The document of each top-level node (a declaration, an `annotate` block). */
const declaringDocs = new WeakMap<SemanticNode, AtscriptDoc>()

/** A declaration other types are built from: an interface, a type, an `annotate … as` alias. */
function isDeclarationNode(node: SemanticNode): boolean {
  return (
    node.entity === 'interface' || node.entity === 'type' || (isAnnotate(node) && !node.isMutating)
  )
}

/**
 * The annotations of `node`; `blocks`: a declaration's with its mutating blocks' top-level
 * annotations (see `AtscriptDoc.declarationAnnotations`).
 */
function annotationsOf(node: SemanticNode, blocks: boolean): TAnnotationTokens[] | undefined {
  const doc = blocks && isDeclarationNode(node) ? declaringDocs.get(node) : undefined
  return doc ? doc.declarationAnnotations(node) : node.annotations
}

/** Whether `token` is the target of a mutating `annotate` block (`annotate T { … }`). */
function isMutatingTarget(token: Token): boolean {
  const parent = token.parentNode
  return !!parent && isAnnotate(parent) && parent.isMutating && parent.token('target') === token
}

/** The reference tokens inside declaration `decl` (its own definition), and its name. */
function declarationTokens(decl: SemanticNode): Set<Token> {
  const out = new Set<Token>()
  const name = decl.token('identifier')
  if (name) {
    out.add(name)
  }
  for (const t of decl.referredIdentifiers) {
    out.add(t)
  }
  return out
}

// oxlint-disable max-lines
// oxlint-disable max-depth
import type {
  AtscriptDoc,
  SemanticAnnotateNode,
  SemanticConstNode,
  SemanticExprBinaryNode,
  SemanticExprCallNode,
  SemanticExprItemNode,
  SemanticExprNumberNode,
  SemanticExprUnaryNode,
  SemanticImportNode,
  SemanticInterfaceNode,
  SemanticNode,
  SemanticPrimitiveNode,
  SemanticQueryComparisonNode,
  SemanticQueryExprNode,
  SemanticQueryFieldRefNode,
  SemanticQueryNode,
  SemanticQueryValueListNode,
  SemanticQueryValueNode,
  SemanticStructureNode,
  SemanticTypeNode,
  TAnnotationTokens,
  Token,
  TPrimitiveTypeDef,
} from '@atscript/core'
import {
  annotatedValueKinds,
  getRelPath,
  isBareId,
  isBareSpecifier,
  isDbEntityNode,
  isInterface,
  isPrimitive,
  isQueryLogical,
  isStructure,
  resolveAtscriptFromPath,
  withoutAsExtension,
} from '@atscript/core'
import type { TStructDecl } from '@atscript/core'

import {
  type TCompileValidatorsMode,
  type TTsPluginOptions,
  resolveJsonSchemaMode,
} from '../plugin'
import type { TAtscriptAnnotatedType } from '../runtime/annotated-type'
import { uniqueName } from '../runtime/unique-name'
import { BaseRenderer } from './base-renderer'
import type { Realm, TRealmModule } from './realm'
import { escapeQuotes, wrapProp } from './utils'

const QUERY_OP_MAP: Record<string, string> = {
  '=': '$eq',
  '!=': '$ne',
  '>': '$gt',
  '>=': '$gte',
  '<': '$lt',
  '<=': '$lte',
  'in': '$in',
  'not in': '$nin',
  'matches': '$regex',
  'exists': '$exists',
  'not exists': '$exists',
}

// Placeholder lines in the header; `render()` replaces them with the utils import and the
// synthesized imports, which are only complete after the body is rendered (which helpers it
// used, which annotation arguments needed an import). Kept in the header (not emitted by
// `post()`) because the import position is part of the generated-file snapshots.
const UTILS_IMPORT_MARKER = '/*@@atscript-utils-import@@*/'
const SYNTH_IMPORTS_MARKER = '/*@@atscript-synth-imports@@*/'

/** Phase-1 placeholders of a class's bundled JSON schema (see `JsRenderer.render`). */
export const schemaMarker = (id: string) => `/*@@atscript-schema:${id}@@*/{}`
export const accountedMarker = (id: string) => `/*@@atscript-accounted:${id}@@*/`
const MARKERS = /\/\*@@atscript-(schema|accounted):([^@]+)@@\*\/(?:\{\})?/g
/**
 * Phase-1 placeholders of the compiled checks' registrations and of their helper in the utils
 * import (see `JsRenderer.render`).
 */
const CHECKS_MARKER = '/*@@atscript-compiled-checks@@*/'
const CHECKS_IMPORT_MARKER = '/*@@atscript-compiled-checks-import@@*/'
/**
 * The accounted blocks of a bundled schema whose realm failed (the module throws when loaded):
 * never what the runtime applied, so the runtime's schema is used.
 */
const REALM_FAILED = '!realm'

/**
 * The `@atscript/typescript/utils` helpers generated code uses (in import order), with the
 * local name each prefers (see `JsRenderer.util`).
 */
const UTILS = {
  defineAnnotatedType: '$',
  annotate: '$a',
  buildJsonSchema: '$$',
  createDataFromAnnotatedType: '$e',
  throwFeatureDisabled: '$d',
  registerCompiledCheck: '$cv',
  lazyJsonSchema: '$jl',
  // (the generated structure's: see `js-next.ts`)
  $f: '$f',
  $ft: '$ft',
  $fc: '$fc',
  $alias: '$al',
  $blk: '$blk',
  $q: '$q',
  $end: '$end',
  $sh: '$sh',
  bundledSchemaOf: '$jbm',
  $ps: '$ps',
  $ak: '$ak',
  $nr: '$nk',
  $ut: '$ut',
} as const

type TUtil = keyof typeof UTILS

const LITERAL_IDENTIFIERS = new Set(['true', 'false', 'null', 'undefined'])

/**
 * The JS source of an argument of an annotation without a spec
 * (`unknownAnnotation: 'allow'` / `'warn'`): nothing says what it means, so it is kept as
 * written — a string, a number, `true` / `false` / `null` / `undefined`, and any other
 * identifier (`Name`, `Name.field`) or backtick argument as the string of its source; an
 * argument left empty (`@a , 'x'`) is `undefined`. (An identifier emitted as is would be an
 * undeclared variable at module load, a backtick one an empty argument.)
 */
function unknownArg(token: Token, doc: AtscriptDoc): string {
  switch (token.type) {
    case 'text': {
      return `"${escapeQuotes(token.text)}"`
    }
    case 'number': {
      return token.text
    }
    case 'identifier': {
      return LITERAL_IDENTIFIERS.has(token.text) ? token.text : JSON.stringify(token.text)
    }
    case 'query': {
      return JSON.stringify(backtickSource(token, doc))
    }
    default: {
      return 'undefined'
    }
  }
}

/** The source between the backticks of a backtick argument. */
function backtickSource(token: Token, doc: AtscriptDoc): string {
  const { start, end } = token.range
  const lines = doc.text.split('\n')
  const offset = (pos: { line: number; character: number }) => {
    let n = pos.character
    for (let i = 0; i < pos.line && i < lines.length; i++) {
      n += lines[i].length + 1
    }
    return n
  }
  let text = doc.text.slice(offset(start), offset(end))
  if (text.startsWith('`')) {
    text = text.slice(1)
  }
  return text.endsWith('`') ? text.slice(0, -1) : text
}

interface TSynthRefInfo {
  alias: string
  ownerDoc: AtscriptDoc
  ownerNode?: SemanticNode
}

export abstract class JsRenderer extends BaseRenderer {
  protected typeIds = new Map<SemanticNode, string>()
  private _synthImports = new Map<string, Array<{ name: string; alias: string }>>()
  private _synthTaken?: Set<string>
  private _synthAllocated = new Map<string, TSynthRefInfo>()
  private _synthPathCache = new Map<AtscriptDoc, string | undefined>()
  private _ownerCache = new Map<string, ReturnType<AtscriptDoc['getDeclarationOwnerNode']>>()
  /** The documents whose modules the rendered module imports (see `generatedImports`). */
  readonly importedDocs = new Set<AtscriptDoc>()
  /** The classes the rendered module exports. */
  protected readonly exportedClasses: string[] = []
  /** Every class the rendered module declares (see `renderModule`). */
  protected readonly declaredClasses: string[] = []
  /** The import statements the rendered module writes (see `renderModule`). */
  protected readonly realmImports: TRealmModule['imports'] = []
  /** The module of each synthesized import path (see `allocateSynthInfo`). */
  private readonly synthDocs = new Map<string, AtscriptDoc>()
  /** The classes whose bundled JSON schema phase 2 splices in (see `renderJsonSchemaMethod`). */
  protected readonly bundledSchemas: string[] = []
  protected readonly jsonSchemaMode: ReturnType<typeof resolveJsonSchemaMode>
  /** Classes that get a compiled check (`undefined`: all of them, see `compiles`). */
  protected readonly compiledClasses?: Set<string>
  /** Some class gets a compiled check: phase 2 builds the layouts in the realm (see `render`). */
  protected readonly compiles: boolean
  /** The classes whose compiled check phase 2 registers, in the order their chains run. */
  protected readonly compiledChecks: string[] = []
  /** The `UTILS` the rendered module uses, by their local names. */
  private readonly utils = new Map<TUtil, string>()

  /**
   * The local name of helper `name` (marked used): its preferred one, suffixed when the module
   * declares or imports that name (`$m` → `$m_1`).
   */
  protected util(name: TUtil): string {
    let local = this.utils.get(name)
    if (local === undefined) {
      local = this.allocAlias(UTILS[name], this.getSynthTaken())
      this.utils.set(name, local)
    }
    return local
  }

  /** The helpers' entry generated modules import. */
  protected utilsEntry = '@atscript/typescript/utils'

  /** `defineAnnotatedType` (see {@link util}). */
  protected get $(): string {
    return this.util('defineAnnotatedType')
  }

  constructor(
    doc: AtscriptDoc,
    protected opts: TTsPluginOptions | undefined,
    protected readonly compileMode: TCompileValidatorsMode
  ) {
    super(doc)
    this.jsonSchemaMode = resolveJsonSchemaMode(opts)
    if (compileMode === 'annotated') {
      this.compiledClasses = new Set()
      for (const node of doc.nodes) {
        if (node.id && node.countAnnotations('emit.compiledValidator') > 0) {
          this.compiledClasses.add(node.id)
        }
      }
    }
    this.compiles =
      compileMode === 'all' || (!!this.compiledClasses && this.compiledClasses.size > 0)
  }

  /**
   * Relative imports get the configured `moduleExtension`; bare specifiers
   * always keep `.as` — they resolve through the package's `exports` map.
   */
  override transformFromPath(written: string): string {
    const path = withoutAsExtension(written)
    return isBareSpecifier(path) ? `${path}.as` : `${path}${this.opts?.moduleExtension ?? '.as'}`
  }

  /**
   * The declaration `name` names in document `origin` (where a reference or an annotation
   * argument was written), when this module needs a binding of its own for it: declared in
   * another module (not a primitive) and not bound to it here under that name.
   */
  private foreignOwner(
    name: string,
    origin: AtscriptDoc
  ): { doc: AtscriptDoc; node: SemanticNode } | undefined {
    const theirs = this.resolveOwner(origin, name)
    if (!theirs?.node || theirs.doc === this.doc || isPrimitive(theirs.node)) {
      return undefined
    }
    const mine = this.resolveOwner(this.doc, name)
    return mine?.doc === theirs.doc && mine.node === theirs.node
      ? undefined
      : { doc: theirs.doc, node: theirs.node }
  }

  // Names already bound in this file (locals, user imports, earlier synth aliases).
  protected getSynthTaken(): Set<string> {
    if (!this._synthTaken) {
      this._synthTaken = new Set<string>(this.doc.registry.definitions.keys())
      for (const name of this.doc.importedDefs.keys()) {
        this._synthTaken.add(name)
      }
    }
    return this._synthTaken
  }

  // Cached `computeSynthPath` (the value may be `undefined`, so `has` guards the lookup).
  private getSynthPath(ownerDoc: AtscriptDoc): string | undefined {
    if (!this._synthPathCache.has(ownerDoc)) {
      this._synthPathCache.set(ownerDoc, this.computeSynthPath(ownerDoc))
    }
    return this._synthPathCache.get(ownerDoc)
  }

  // Allocates (once per path + name) the binding for a symbol declared in another document.
  protected synthBinding(
    name: string,
    ownerInfo: { doc: AtscriptDoc; node?: SemanticNode }
  ): TSynthRefInfo | undefined {
    const synthPath = this.getSynthPath(ownerInfo.doc)
    if (!synthPath) {
      return undefined
    }
    const allocKey = `${synthPath}::${name}`
    let info = this._synthAllocated.get(allocKey)
    if (!info) {
      info = this.allocateSynthInfo(name, synthPath, ownerInfo, this.getSynthTaken())
      this._synthAllocated.set(allocKey, info)
    }
    return info
  }

  /**
   * Binding for a type name used by an annotation argument (`ref` / qualified
   * query field refs). An annotation inherited from another document (chain ref
   * or `extends`) carries names that only that document imports, so when the
   * name does not resolve here to the same declaration, a synthesized import is
   * allocated (lazily, spliced into the header by `render()`).
   */
  private annotationTypeName(typeName: string, origin: AtscriptDoc | undefined): string {
    const owner = origin && origin !== this.doc ? this.foreignOwner(typeName, origin) : undefined
    return (owner && this.synthBinding(typeName, owner)?.alias) ?? typeName
  }

  // Memoize `getDeclarationOwnerNode` (each reference to a declaration resolves its owner).
  protected resolveOwner(
    fromDoc: AtscriptDoc,
    refId: string
  ): ReturnType<AtscriptDoc['getDeclarationOwnerNode']> {
    const key = `${fromDoc.id}::${refId}`
    let v = this._ownerCache.get(key)
    if (v === undefined && !this._ownerCache.has(key)) {
      v = fromDoc.getDeclarationOwnerNode(refId)
      this._ownerCache.set(key, v)
    }
    return v
  }

  private allocateSynthInfo(
    refId: string,
    synthPath: string,
    ownerInfo: { doc: AtscriptDoc; node?: SemanticNode },
    taken: Set<string>
  ): TSynthRefInfo {
    const ownerDoc = ownerInfo.doc
    const ownerNode = ownerInfo.node
    // If the user already imports this exact (name, path), reuse that binding instead of synthesizing a duplicate.
    const existing = this.doc.importedDefs.get(refId)
    if (existing?.text === synthPath && !this.unused.has(refId)) {
      return { alias: refId, ownerDoc, ownerNode }
    }
    const alias = this.allocAlias(refId, taken)
    let group = this._synthImports.get(synthPath)
    if (!group) {
      group = []
      this._synthImports.set(synthPath, group)
    }
    group.push({ name: refId, alias })
    this.synthDocs.set(synthPath, ownerDoc)
    this.importedDocs.add(ownerDoc)
    return { alias, ownerDoc, ownerNode }
  }

  /** `name`, suffixed (`_1`, `_2`, …) when `taken`; the result is taken from now on. */
  protected allocAlias(name: string, taken: Set<string>): string {
    const alias = uniqueName(name, n => taken.has(n), '_')
    taken.add(alias)
    return alias
  }

  private computeSynthPath(ownerDoc: AtscriptDoc): string | undefined {
    if (isBareId(ownerDoc.id)) {
      return ownerDoc.id.slice('bare:'.length, -'.as'.length)
    }
    if (!ownerDoc.id.startsWith('file://')) {
      return undefined
    }
    return getRelPath(this.doc.id, ownerDoc.id)
  }

  protected override importKept(node: SemanticImportNode, names: string[], line: string) {
    const path = node.token('path')?.text
    const imported =
      path &&
      this.doc.dependenciesMap.get(
        this.doc.resolveImportId(resolveAtscriptFromPath(path, this.doc.id))
      )
    this.realmImports.push({
      line,
      doc: imported || undefined,
      names: names.map(n => [n, n]),
    })
    if (imported) {
      this.importedDocs.add(imported)
    }
  }

  pre() {
    this.writeln('// prettier-ignore-start')
    this.writeln('/* eslint-disable */')
    this.writeln('/* oxlint-disable */')

    // Pre-scan nodes: detect name collisions for typeIds
    const nodesByName = new Map<string, SemanticNode[]>()
    for (const node of this.doc.nodes) {
      if (node.__typeId !== null && node.__typeId !== undefined && node.id) {
        const name = node.id
        if (!nodesByName.has(name)) {
          nodesByName.set(name, [])
        }
        nodesByName.get(name)!.push(node)
      }
    }
    for (const [name, nodes] of nodesByName) {
      if (nodes.length === 1) {
        this.typeIds.set(nodes[0], name)
      } else {
        for (let i = 0; i < nodes.length; i++) {
          this.typeIds.set(nodes[i], `${name}__${i + 1}`)
        }
      }
    }

    // Filled by `render()` once the body is rendered (see `utilsImport`).
    this.writeln(UTILS_IMPORT_MARKER)
    this.writeln(SYNTH_IMPORTS_MARKER)
  }

  /**
   * The import of the `@atscript/typescript/utils` helpers: those the rendered body used, and
   * those every module of its kind imports.
   */
  protected utilsImport(): string {
    const always: TUtil[] = ['defineAnnotatedType']
    if (this.opts?.exampleData) {
      always.push('createDataFromAnnotatedType')
    }
    if (this.jsonSchemaMode === false) {
      always.push('throwFeatureDisabled')
    }
    always.forEach(name => this.util(name))
    const names = (Object.keys(UTILS) as TUtil[])
      .filter(name => this.utils.has(name))
      .map(name => [name, this.utils.get(name)!] as [string, string])
    // (the compiled checks' helper: only when phase 2 registers some, see `render`; never first)
    const list = names
      .map(([name, local]) =>
        name === 'registerCompiledCheck' ? CHECKS_IMPORT_MARKER : `, ${name} as ${local}`
      )
      .join('')
      .slice(2)
    const line = `import { ${list} } from "${this.utilsEntry}"`
    this.realmImports.push({
      line,
      names: names.filter(([name]) => name !== 'registerCompiledCheck'),
    })
    return line
  }

  /**
   * The generated module: phase 1 (see {@link renderModule}), then the view payloads spliced in
   * (phase 2), built by the runtime from the realm's objects (see `realm.ts`): each bundled JSON
   * schema, and the compiled validator checks (see `compiledCheckRegistrations`).
   */
  override render(): string {
    const module = this.phase1()
    if (this.bundledSchemas.length === 0 && !this.compiles) {
      return module.text
    }
    const realm = this.realm()
    const text = this.compiles ? this.spliceCompiledChecks(module.text, realm) : module.text
    if (this.bundledSchemas.length === 0) {
      return text
    }
    const views = new Map<string, { schema: string; accounted: string }>()
    const viewOf = (id: string) => {
      let view = views.get(id)
      if (!view) {
        let schema = '{}'
        let accounted = [REALM_FAILED]
        try {
          const type = realm.classOf(this.doc, id) as TAtscriptAnnotatedType
          schema = JSON.stringify(realm.rt.buildJsonSchema(type))
          accounted = this.accountedFor(realm, type)
        } catch {
          // (the module throws when loaded: the runtime's schema, see `bundledJsonSchema`)
        }
        view = { schema, accounted: accounted.length > 0 ? `, ${JSON.stringify(accounted)}` : '' }
        views.set(id, view)
      }
      return view
    }
    // (one pass: a module of many bundled schemas is large)
    return text.replace(MARKERS, (_, kind: string, id: string) =>
      kind === 'schema' ? viewOf(id).schema : viewOf(id).accounted
    )
  }

  /** What a bundled schema built in `realm` for `type` accounts (see `bundledSchemaOf`). */
  protected abstract accountedFor(realm: Realm, type: TAtscriptAnnotatedType): string[]

  /** The realm phase 2 builds the view payloads in (this module's phase 1 known to it). */
  protected abstract realm(): Realm

  /** `text` (phase 1) with the compiled checks' registrations, built in `realm`. */
  private spliceCompiledChecks(text: string, realm: Realm): string {
    let registrations: string[] = []
    try {
      registrations = realm.rt.compiledCheckRegistrations({
        classes: realm.classesOf(this.doc) as Map<string, TAtscriptAnnotatedType>,
        compiled: this.compiledChecks,
        allClasses: realm.classTypes(),
      })
    } catch {
      // (the module throws when loaded: nothing compiled)
    }
    const cv = this.util('registerCompiledCheck')
    const checks = registrations.map(args => `${cv}(${args})\n`).join('')
    return text
      .replace(CHECKS_IMPORT_MARKER, () => (checks ? `, registerCompiledCheck as ${cv}` : ''))
      .replace(`${CHECKS_MARKER}\n`, () =>
        checks ? `// Compiled validator checks\n${checks}\n` : ''
      )
  }

  /**
   * {@link renderModule}, once: phase 2 (see {@link render}) reads what it recorded; a module that
   * fails to render fails every time with its error.
   */
  phase1(): TRealmModule {
    if (!this.phase1Out) {
      try {
        this.phase1Out = { module: this.renderModule() }
      } catch (error) {
        this.phase1Out = { error }
      }
    }
    if ('error' in this.phase1Out) {
      throw this.phase1Out.error
    }
    return this.phase1Out.module
  }

  private phase1Out?: { module: TRealmModule } | { error: unknown }

  /**
   * Phase 1: the generated module without view payloads (a bundled JSON schema is a placeholder,
   * see {@link render}), with what the realm needs to evaluate it (see `TRealmModule`).
   */
  renderModule(): TRealmModule {
    // (generated code builds every type from the definitions as written: mutating blocks apply
    // at runtime, never baked into another module)
    const out = super.render()
    const lines: string[] = []
    for (const [synthPath, names] of this._synthImports) {
      const list = names
        .map(n => (n.alias === n.name ? n.name : `${n.name} as ${n.alias}`))
        .join(', ')
      const line = `import { ${list} } from "${this.transformFromPath(synthPath)}"`
      lines.push(line)
      this.realmImports.push({
        line,
        doc: this.synthDocs.get(synthPath),
        names: names.map(n => [n.name, n.alias]),
      })
    }
    const text = out
      .replace(UTILS_IMPORT_MARKER, () => this.utilsImport())
      .replace(`${SYNTH_IMPORTS_MARKER}\n`, () => (lines.length > 0 ? `${lines.join('\n')}\n` : ''))
    // (in the order they are written: the order ESM evaluates the imported modules in)
    const at = new Map(this.realmImports.map(i => [i, text.indexOf(i.line)]))
    return {
      text,
      imports: [...this.realmImports].sort((a, b) => at.get(a)! - at.get(b)!),
      exports: [...this.exportedClasses],
      classes: [...this.declaredClasses],
    }
  }

  /**
   * Where the `$cv(Class, …)` registrations go (one per compiled class, after every chain and
   * mutating annotate of the module ran: the compiled check binds on first use): a placeholder
   * phase 2 fills from the realm (see `render`).
   */
  protected renderCompiledChecks() {
    if (this.compiles) {
      this.util('registerCompiledCheck')
      this.writeln(CHECKS_MARKER)
    }
  }

  /** The initial def of a declaration's class (see `js-next.ts`). */
  protected abstract classTypeInit(node: SemanticNode): string

  protected renderClassStatics(node: SemanticNode) {
    this.writeln('static __is_atscript_annotated_type = true')
    this.writeln(`static type = ${this.classTypeInit(node)}`)
    this.writeln('static metadata = new Map()')
    const typeId = this.typeIds.get(node)
    if (typeId) {
      this.writeln(`static id = "${typeId}"`)
    }
    this.renderJsonSchemaMethod(node)
    this.renderExampleDataMethod(node)
    this.renderDimMeasure(node)
  }

  renderInterface(node: SemanticInterfaceNode): void {
    this.renderDefinitionClass(node)
  }

  renderType(node: SemanticTypeNode): void {
    this.renderDefinitionClass(node)
  }

  renderAnnotate(node: SemanticAnnotateNode): void {
    // (an `annotate … as` alias is a class; a mutating block is data, see `post()`)
    if (!node.isMutating && this.doc.unwindType(node.targetName)?.def) {
      this.renderDefinitionClass(node)
    }
  }

  protected renderDefinitionClass(node: SemanticNode) {
    this.writeln()
    const exported = node.token('export')?.text === 'export'
    if (exported) {
      this.exportedClasses.push(node.id!)
    }
    this.declaredClasses.push(node.id!)
    this.write(exported ? 'export ' : '')
    this.write(`class ${node.id!} `)
    this.blockln('{}')
    this.renderClassStatics(node)
    this.popln()
    this.writeln()
  }

  /**
   * `static toJsonSchema()`: lazy (built by the runtime) or disabled; a bundled schema is the
   * structure printer's (see `js-next.ts`).
   */
  protected renderJsonSchemaMethod(_node: SemanticNode) {
    const mode = this.jsonSchemaMode
    if (mode === 'lazy') {
      this.writeln('static toJsonSchema() {')
      // (built once, again after a block of another module's type or a runtime edit)
      this.indent().writeln(`return ${this.util('lazyJsonSchema')}(this)`)
      this.unindent()
      this.writeln('}')
    } else {
      this.writeln('static toJsonSchema() {')
      const disabled = this.util('throwFeatureDisabled')
      this.indent().writeln(`${disabled}("JSON Schema", "jsonSchema", "emit.jsonSchema")`)
      this.unindent()
      this.writeln('}')
    }
  }

  private renderExampleDataMethod(_node: SemanticNode) {
    if (this.opts?.exampleData) {
      this.writeln('static toExampleData() {')
      const create = this.util('createDataFromAnnotatedType')
      this.indent().writeln(`return ${create}(this, { mode: "example" })`).unindent()
      this.writeln('}')
    }
  }

  private renderDimMeasure(node: SemanticNode) {
    if (!isInterface(node)) {
      return
    }
    const interfaceNode = node as SemanticInterfaceNode
    if (!isDbEntityNode(interfaceNode)) {
      return
    }

    let struct: SemanticNode | undefined
    /** Whether a block on a parent (directly or not) writes annotation `key` on prop `name`. */
    let parentBlock = (_name: string, _key: string) => false
    if (interfaceNode.hasExtends) {
      // (the db layout of the interface: its parents' blocks included — metadata of the parents'
      // props, the structure model's layers on them)
      struct = this.doc.resolveInterfaceExtends(interfaceNode)
      const m = this.doc.structure()
      const parents = new Set<TStructDecl>()
      const add = (d: TStructDecl) => {
        for (const p of m.extendsOf(d).map(x => m.plainTarget(x))) {
          if (!parents.has(p)) {
            parents.add(p)
            add(p)
          }
        }
      }
      const self = m.declOfNode(interfaceNode)
      if (self) {
        add(self)
        parents.delete(self)
      }
      parentBlock = (name, key) =>
        [...parents].some(p =>
          m.layersAt(p, [name]).some(l => l.entry.ref.annotations?.some(a => a.name === key))
        )
    }
    if (!struct) {
      struct = interfaceNode.getDefinition()
    }
    if (!struct || !isStructure(struct)) {
      return
    }

    const structNode = struct as SemanticStructureNode
    const dims: string[] = []
    const measures: string[] = []

    for (const [name, prop] of structNode.props) {
      if (prop.token('identifier')?.pattern) {
        continue
      }
      if (
        prop.countAnnotations('db.column.dimension') > 0 ||
        parentBlock(name, 'db.column.dimension')
      ) {
        dims.push(name)
      }
      if (
        prop.countAnnotations('db.column.measure') > 0 ||
        parentBlock(name, 'db.column.measure')
      ) {
        measures.push(name)
      }
    }

    if (dims.length > 0) {
      this.writeln(`static dimensions = [${dims.map(d => `'${escapeQuotes(d)}'`).join(', ')}]`)
    }
    if (measures.length > 0) {
      this.writeln(`static measures = [${measures.map(m => `'${escapeQuotes(m)}'`).join(', ')}]`)
    }
  }

  defineConst(node: SemanticConstNode) {
    const t = node.token('identifier')?.type
    const designType = t === 'text' ? 'string' : t === 'number' ? 'number' : 'unknown'
    // const type = t === 'text' ? 'String' : t === 'number' ? 'Number' : 'undefined'
    this.writeln(`.designType("${escapeQuotes(designType)}")`)
    this.writeln(`.value(${t === 'text' ? `"${escapeQuotes(node.id!)}"` : node.id!})`)
    return this
  }
  definePrimitive(node: SemanticPrimitiveNode, name?: string) {
    this.renderPrimitiveDef(node.id! === 'never' ? 'never' : node.config.type, name)
    this.writeln(
      `  .tags(${Array.from(node.tags)
        .map(f => `"${escapeQuotes(f)}"`)
        .join(', ')})`
    )
    return this
  }

  /** Emits a primitive's builder chain. */
  renderPrimitiveDef(def?: TPrimitiveTypeDef | 'never', name?: string): void {
    const d = (t?: string) => [`"${t || ''}"`, name].filter(Boolean).join(', ').replace(/^""$/, '')
    const final = (designType: string) => {
      this.writeln(`${this.$}(${d()}).designType("${designType}")`)
    }
    if (!def) {
      return final('any')
    }
    // If it's a direct final type, return it
    if (typeof def === 'string') {
      return final(def === 'void' ? 'undefined' : def)
    }
    switch (def.kind) {
      case 'final': {
        return final(def.value === 'void' ? 'undefined' : def.value)
      }
      case 'union':
      case 'intersection':
      case 'tuple': {
        this.writeln(`${this.$}(${d(def.kind)})`)
        this.indent()
        for (const itemDef of def.items) {
          this.write(`.item(`)
          this.indent()
          this.renderPrimitiveDef(itemDef)
          this.writeln('.$type')
          this.unindent()
          this.write(`)`)
        }
        this.unindent()
        return
      }
      case 'array': {
        this.writeln(`${this.$}(${d('array')})`)
        this.indent()
        this.write('.of(')
        this.indent()
        this.renderPrimitiveDef(def.of)
        this.writeln(`.$type`)
        this.unindent()
        this.writeln(`)`)
        this.unindent()
        return
      }
      case 'object': {
        this.writeln(`${this.$}(${d('object')})`)
        this.indent()
        const props: Array<[string, TPrimitiveTypeDef, boolean]> = [
          ...Object.entries(def.props).map(
            ([k, p]) => [k, p, false] as [string, TPrimitiveTypeDef, boolean]
          ),
          ...Object.entries(def.propsPatterns).map(
            ([k, p]) => [k, p, true] as [string, TPrimitiveTypeDef, boolean]
          ),
        ]
        for (const [key, propDef, isPattern] of props) {
          const optional = typeof propDef === 'object' && propDef.optional
          this.writeln(isPattern ? `.propPattern(` : `.prop(`)
          this.indent()
          this.writeln(isPattern ? `${key},` : `"${escapeQuotes(key)}",`)
          this.renderPrimitiveDef(propDef)
          if (optional) {
            this.writeln('.optional()')
          }
          this.writeln('.$type')
          this.unindent()
          this.write(`)`)
        }
        this.unindent()
        return
      }
      default: {
        // Fallback in case of unexpected input
        return final('any')
      }
    }
  }

  /** Writes annotation `an` of `node`. */
  resolveAnnotationValue(node: SemanticNode, an: TAnnotationTokens) {
    const { value, multiple } = this.computeAnnotationValue(node, an)
    if (multiple) {
      this.writeln(`.annotate("${escapeQuotes(an.name)}", ${value}, true)`)
    } else {
      this.writeln(`.annotate("${escapeQuotes(an.name)}", ${value})`)
    }
  }

  private emitRefValue(text: string, origin: AtscriptDoc | undefined): string {
    const dotIdx = text.indexOf('.')
    if (dotIdx === -1) {
      return `() => ${this.annotationTypeName(text, origin)}`
    }
    const typeName = this.annotationTypeName(text.slice(0, dotIdx), origin)
    const field = text.slice(dotIdx + 1)
    return `{ type: () => ${typeName}, field: "${escapeQuotes(field)}" }`
  }

  private emitArgValue(
    aSpec: { type: string },
    argToken: Token,
    origin: AtscriptDoc | undefined,
    /** the annotation's main token (a `value` argument reads the field it is written on) */
    mainToken: Token
  ): string {
    if (aSpec.type === 'ref') {
      return this.emitRefValue(argToken.text, origin)
    }
    if (aSpec.type === 'query' && argToken.queryNode) {
      return this.emitQueryTree(argToken.queryNode, origin)
    }
    if (aSpec.type === 'expr' && argToken.exprNode) {
      return this.emitExprNode(argToken.exprNode.expression, origin)
    }
    if (aSpec.type === 'order' && argToken.orderNode) {
      const items = argToken.orderNode.items.map(
        item =>
          `{ ref: ${this.emitQueryFieldRef(item.ref, origin)}${item.desc ? ', desc: true' : ''} }`
      )
      return `[${items.join(', ')}]`
    }
    // (a `value` argument keeps the literal's kind: a string quoted, a number / boolean as is —
    // a number on a `decimal` field is its string, the field's runtime type)
    const quoted =
      aSpec.type === 'string' ||
      (aSpec.type === 'value' &&
        (argToken.type === 'text' ||
          (argToken.type === 'number' && this.decimalField(mainToken, origin))))
    return quoted ? `"${escapeQuotes(argToken.text)}"` : argToken.text
  }

  /** Whether annotation `mainToken` is written on a `decimal` field (not one that holds numbers). */
  private decimalField(mainToken: Token, origin: AtscriptDoc | undefined): boolean {
    const kinds = annotatedValueKinds(mainToken, origin ?? this.doc)
    return !!kinds?.has('decimal') && !kinds.has('number') && !kinds.has('unknown')
  }

  private emitExprNode(node: SemanticExprItemNode, origin: AtscriptDoc | undefined): string {
    // Discriminate by `entity` (not `instanceof`): the nodes may come from another copy of core
    switch (node.entity as string) {
      case 'query-expr-number': {
        // the parser rejects non-finite literals
        return String((node as SemanticExprNumberNode).value)
      }
      case 'query-expr-binary': {
        const { op, left, right } = node as SemanticExprBinaryNode
        return `{ op: "${op}", args: [${this.emitExprNode(left, origin)}, ${this.emitExprNode(right, origin)}] }`
      }
      case 'query-expr-unary': {
        const { op, operand } = node as SemanticExprUnaryNode
        return `{ op: "${op}", args: [${this.emitExprNode(operand, origin)}] }`
      }
      case 'query-expr-call': {
        const { fn, args } = node as SemanticExprCallNode
        return `{ op: "${fn}", args: [${args.map(a => this.emitExprNode(a, origin)).join(', ')}] }`
      }
      default: {
        return this.emitQueryFieldRef(node as SemanticQueryFieldRefNode, origin)
      }
    }
  }

  private emitQueryTree(queryNode: SemanticQueryNode, origin: AtscriptDoc | undefined): string {
    return this.emitQueryExpr(queryNode.expression, origin)
  }

  private emitQueryExpr(node: SemanticQueryExprNode, origin: AtscriptDoc | undefined): string {
    if (isQueryLogical(node)) {
      return this.emitQueryLogical(node, origin)
    }
    return this.emitQueryComparison(node as SemanticQueryComparisonNode, origin)
  }

  private emitQueryLogical(
    node: import('@atscript/core').SemanticQueryLogicalNode,
    origin: AtscriptDoc | undefined
  ): string {
    if (node.operator === 'not') {
      return `{ "$not": ${this.emitQueryExpr(node.operands[0], origin)} }`
    }
    const key = node.operator === 'and' ? '$and' : '$or'
    const items = node.operands.map(op => this.emitQueryExpr(op, origin)).join(', ')
    return `{ "${key}": [${items}] }`
  }

  private emitQueryComparison(
    node: SemanticQueryComparisonNode,
    origin: AtscriptDoc | undefined
  ): string {
    const left = this.emitQueryFieldRef(node.left, origin)
    const mappedOp = QUERY_OP_MAP[node.operator] || node.operator
    const parts = [`left: ${left}`, `op: "${mappedOp}"`]
    if (node.right) {
      if ('fieldRef' in node.right && (node.right as SemanticQueryFieldRefNode).fieldRef) {
        parts.push(
          `right: ${this.emitQueryFieldRef(node.right as SemanticQueryFieldRefNode, origin)}`
        )
      } else if ('values' in node.right && (node.right as SemanticQueryValueListNode).values) {
        const values = (node.right as SemanticQueryValueListNode).values
          .map(v => this.emitQueryLiteral(v))
          .join(', ')
        parts.push(`right: [${values}]`)
      } else if ('valueToken' in node.right) {
        parts.push(`right: ${this.emitQueryLiteral(node.right as SemanticQueryValueNode)}`)
      }
    } else if (node.operator === 'exists') {
      parts.push('right: true')
    } else if (node.operator === 'not exists') {
      parts.push('right: false')
    }
    return `{ ${parts.join(', ')} }`
  }

  private emitQueryFieldRef(
    node: SemanticQueryFieldRefNode,
    origin: AtscriptDoc | undefined
  ): string {
    const parts: string[] = []
    if (node.typeRef) {
      parts.push(`type: () => ${this.annotationTypeName(node.typeRef.text, origin)}`)
    }
    parts.push(`field: "${escapeQuotes(node.fieldRef.text)}"`)
    return `{ ${parts.join(', ')} }`
  }

  private emitQueryLiteral(node: SemanticQueryValueNode): string {
    const token = node.valueToken
    switch (token.type) {
      case 'text': {
        return `"${escapeQuotes(token.text)}"`
      }
      case 'number': {
        return token.text
      }
      case 'regexp': {
        // Extract regex source (strip /pattern/flags → "pattern")
        const match = /^\/(.*)\/[a-z]*$/.exec(token.text)
        return `"${escapeQuotes(match ? match[1] : token.text)}"`
      }
      case 'identifier': {
        if (token.text === 'true' || token.text === 'false') {
          return token.text
        }
        if (token.text === 'null' || token.text === 'undefined') {
          return 'null'
        }
        return token.text
      }
      default: {
        return token.text
      }
    }
  }

  /** The JS source of an annotation's value, and whether the annotation is a list. */
  protected computeAnnotationValue(
    node: SemanticNode,
    an: TAnnotationTokens
  ): { value: string; multiple: boolean } {
    const origin = this.doc.annotationOrigin(an)
    const spec = this.doc.resolveAnnotation(an.name)
    let targetValue = 'true'
    let multiple: boolean | undefined = false
    if (spec) {
      multiple = spec.config.multiple
      const length = spec.arguments.length
      if (length !== 0) {
        if (Array.isArray(spec.config.argument)) {
          targetValue = '{ '
          let i = 0
          for (const aSpec of spec.arguments) {
            if (an.args[i]) {
              targetValue += `${wrapProp(aSpec.name)}: ${this.emitArgValue(aSpec, an.args[i], origin, an.token)}${i === length - 1 ? '' : ', '} `
            }
            i++
          }
          targetValue += '}'
        } else if (an.args[0]) {
          const aSpec = spec.arguments[0]
          targetValue = this.emitArgValue(aSpec, an.args[0], origin, an.token)
        }
      }
    } else {
      // A list when repeated where it is written (`@x.w 'a'` and `@x.w 'c'`): counted on the
      // node declaring it, not on `node` — another file's copy of it (an inherited prop), or a
      // node whose annotations an `annotate` entry overrides (the override's occurrences win
      // together: written once, it is a single value wherever it lands, like on a hand-written
      // copy).
      const declaring = an.token.parentNode ?? node
      multiple = declaring.countAnnotations(an.name) > 1 || an.args.length > 1
      if (an.args.length > 0) {
        targetValue = unknownArg(an.args[0], origin ?? this.doc)
      }
    }
    return { value: targetValue, multiple: !!multiple }
  }
}

/**
 * The generated JS: the module prints the final structure core's `StructureModel` computes, and
 * the runtime adds nothing but metadata layers (`runtime/layers.ts`) and the helpers of
 * `runtime/blocks.ts`.
 *
 * - a reference is a thin node over its target (`$().ref(T)`); a bare plain alias IS its target
 *   (`export { T as P }`), an annotated alias / an `annotate T as X` copy is `$alias(P, T)`;
 * - each distinct merge is one hidden class per module (`$M<n>`), whose single-contributor fields
 *   are the contributor's node (`$f(Root, …path)`) and whose merged fields are own nodes layered
 *   over their contributors (later first); a named merge / an interface with `extends` is printed
 *   the same way under its own name;
 * - statements of a module in an import cycle run through `$q` (queued until the cycle's classes
 *   are there), and the module ends with `$end()`.
 */
import type {
  AtscriptDoc,
  SemanticAnnotateNode,
  SemanticNode,
  SemanticPropNode,
  SemanticTypeNode,
  TAnnotationTokens,
  TAnnotationsTree,
  TStructDecl,
  TStructDef,
  TStructBlock,
  TStructExpr,
  TStructSlot,
} from '@atscript/core'
import {
  andExprs,
  defPosition,
  documentsEpoch,
  forEachAnnotationSpec,
  isArray,
  isConst,
  isGroup,
  isNull,
  isPrimitive,
  isRef,
  isTuple,
  MERGE_TOO_COMPLEX,
  SemanticGroup,
  StructureModel,
  unshell,
} from '@atscript/core'

import {
  resolveJsonSchemaMode,
  type TCompileValidatorsMode,
  type TTsPluginOptions,
} from '../plugin'
import { uniqueName } from '../runtime/unique-name'
import { findImportCycle } from './import-cycles'
import { accountedMarker, JsRenderer, schemaMarker } from './js-renderer'
import { connected, type Realm, realmOf, type TRealmModule } from './realm'
import { escapeQuotes } from './utils'

/** Builder chains longer than this are split into statements (see `chainOf`). */
const MAX_CHAIN = 500
/** A statement's text; one starting with `(` (a split chain) must not continue the previous line. */
const stmt = (text: string) => (text.startsWith('(') ? `;${text}` : text)

/** Whether a declaration is exported from its module. */
function isExported(d: TStructDecl): boolean {
  return d.node.token('export')?.text === 'export'
}

/**
 * One structure model per build component (the documents connected to a document by imports,
 * both ways: a block's module imports its target's), per documents' epoch: a module prints the
 * shells every block of the build needs in its types.
 */
const models = { epoch: -1, byDoc: new Map<AtscriptDoc, StructureModel>() }

function modelOf(doc: AtscriptDoc): StructureModel {
  if (models.epoch !== documentsEpoch()) {
    models.epoch = documentsEpoch()
    models.byDoc.clear()
  }
  let model = models.byDoc.get(doc)
  if (!model) {
    const docs = connected(doc)
    model = new StructureModel(docs)
    for (const d of docs) {
      models.byDoc.set(d, model)
    }
  }
  return model
}

/** A builder statement of the module: what it builds, and whose finished defs it reads. */
interface TStatement {
  text: string
  /** the class it builds (a declaration id, or a hidden class key) */
  builds: string
  /** the classes it needs built first (it reads their props, or their replaced def) */
  needs: Set<string>
  /**
   * What it reads that may not be there yet in an import cycle (`$f(…)`): evaluated first in
   * `$q`, so a statement waits before it changes anything (a retry never sees half of it). By
   * text (`#…`: an order-only guard, see {@link TGuard.printed}), in the order first read.
   */
  guards: Map<string, TGuard>
}

/** A guard of a statement (see {@link TStatement.guards}). */
interface TGuard {
  /** Its code (`$f(Name, "a", "b")`, a binding's name). */
  text: string
  /** Printed in the statement's `$q`; else it orders the statements only (`shellNeeds`). */
  printed: boolean
  /** A read of a class's node: `$f` (0), `$ft` (1, typed) or `$fc` (2, cloned). */
  read?: TRead
}

/** A read of class `name`'s node at runtime `steps`: `$f`, `$ft`, `$fc` (`mode` 0, 1, 2). */
interface TRead {
  mode: 0 | 1 | 2
  name: string
  steps: string[]
}

const str = (s: string) => `"${escapeQuotes(s)}"`

/** A class's shell stages indexed by path (see `shellPathsOf`). */
interface TShellIndex {
  at: Map<string, Array<[number, string]>>
  below: Map<string, Array<[number, string, number]>>
}

/** A runtime path as a map key. */
const pathKey = (steps: string[]) => steps.join('\u0000')

/** A scalar written type's identity: its primitive / literal node, or the alias it references. */
const scalarKey = (e: TStructExpr) =>
  e.k === 'scalar' ? e.node : e.k === 'ref' ? e.decl : undefined

/** `[step, kind], …`: the `$blk` / `$sh` data of runtime steps. */
const stepsText = (steps: Array<[string, number]>) =>
  steps.map(([s, k]) => `[${str(s)}, ${k}]`).join(', ')

/** The written expression one step (`|i`, `[]`, a prop name) below `e`. */
function exprStep(e: TStructExpr, s: string): TStructExpr | undefined {
  if (s.startsWith('|')) {
    return e.k === 'uni' || e.k === 'tup' ? e.items[Number(s.slice(1))] : undefined
  }
  if (s === '[]') {
    return e.k === 'arr' ? e.of : undefined
  }
  return e.k === 'obj' ? e.props.find(p => p.name === s)?.type : undefined
}

const flagKeysMemo = new WeakMap<object, { append: string[]; notReferred: string[] }>()
/**
 * The keys layers read specially, from every spec of an annotations tree (core and plugins, not
 * only those a module writes: a raw or plugin write reads the same): `append` (multiple,
 * `mergeStrategy: 'append'`) and `notReferred` (`passedWhenReferred: false`). Sorted, memoized.
 */
function flagKeys(tree: TAnnotationsTree | undefined): { append: string[]; notReferred: string[] } {
  if (!tree) {
    return { append: [], notReferred: [] }
  }
  let out = flagKeysMemo.get(tree)
  if (!out) {
    const append = new Set<string>()
    const notReferred = new Set<string>()
    forEachAnnotationSpec(tree, (name, spec) => {
      if (spec.config.multiple && spec.config.mergeStrategy === 'append') {
        append.add(name)
      }
      if (spec.config.passedWhenReferred === false) {
        notReferred.add(name)
      }
    })
    flagKeysMemo.set(
      tree,
      (out = { append: [...append].sort(), notReferred: [...notReferred].sort() })
    )
  }
  return out
}

/**
 * The binding of an in-place merge operand of declaration `d` at `steps` (`…&i`): a module-level
 * `let`, exported with an exported declaration (another module's merge may have its fields as
 * contributors: a merge operand is flattened into its operands).
 */
function inPlaceName(d: TStructDecl, steps: string[]): string {
  const base = `$i_${d.name}_${steps.map(s => s.replace(/[^\w$]/g, c => (c === '&' ? '' : '_'))).join('_')}`
  // (`.as` names are JS identifiers: one of the declaring module's own names is skipped — the
  // same name in every module, which compute it from the declaring document)
  return uniqueName(base, n => d.doc.registry.definitions.has(n) || d.doc.importedDefs.has(n), '_')
}

const hiddenExports = new WeakMap<StructureModel, Map<AtscriptDoc, Map<string, string>>>()

/**
 * The reserved names module `doc` exports its hidden merge classes under (like its
 * in-place operands, kept out of the `.d.ts`): `$h_<Decl>_<steps>` of the first place holding
 * each, breadth first from the module's declarations in source order through its own defs (a
 * shell def and the def it shells both). Computed from the module's own structure, so the module
 * and every module importing one of its hidden classes name it alike.
 */
function hiddenExportNames(model: StructureModel, doc: AtscriptDoc): Map<string, string> {
  let byDoc = hiddenExports.get(model)
  if (!byDoc) {
    hiddenExports.set(model, (byDoc = new Map()))
  }
  let out = byDoc.get(doc)
  if (out) {
    return out
  }
  out = new Map()
  byDoc.set(doc, out)
  const names = new Set<string>()
  const own = (t: TStructDef) =>
    t.kind === 'merge' || t.kind === 'umerge'
      ? t.module === doc
      : t.kind !== 'view' && !!t.unit && model.declById(t.unit)?.doc === doc
  // (from its declarations, then from the intersections written in it — an in-place operand's own
  // merges are reached there)
  const queue = [
    ...model.decls
      .filter(d => d.doc === doc && d.kind !== 'as')
      .map(decl => ({ decl, steps: [] as string[], def: model.defAt(decl, []) })),
    ...model
      .mergeRoots()
      .filter(r => r.mod === doc)
      .map(r => ({ decl: r.decl, steps: r.path, def: r.def as TStructDef | undefined })),
  ]
  const seen = new Set<string>()
  for (const { decl, steps, def } of queue) {
    if (!def || !own(def) || seen.has(def.key)) {
      continue
    }
    seen.add(def.key)
    if (def.kind === 'shell' && def.base) {
      // (the def it shells, at the same place: its class is printed too)
      queue.push({ decl, steps, def: def.base })
    }
    if (def.kind === 'merge' || def.kind === 'umerge') {
      const base = `$h_${[decl.name, ...steps.map(s => s.replace(/[^\w$]/g, '_'))].join('_')}`
      const name = uniqueName(
        base,
        n => names.has(n) || doc.registry.definitions.has(n) || doc.importedDefs.has(n),
        '_'
      )
      names.add(name)
      out.set(def.key, name)
    }
    for (const k of def.names?.() ?? []) {
      queue.push({ decl, steps: [...steps, k], def: def.slot(k)?.def })
    }
    for (let b = 0; b < (def.size ?? 0); b++) {
      queue.push({ decl, steps: [...steps, `|${b}`], def: def.branch?.(b) })
    }
  }
  return out
}

/** Whether module `from` imports `.as` module `to`, directly or not. */
const imports = (from: AtscriptDoc, to: AtscriptDoc): boolean =>
  from.transitive('dependencies').has(to)

/** Whether a module is in an import cycle of `.as` modules. */
const inCycle = (doc: AtscriptDoc): boolean => imports(doc, doc)

export class JsNextRenderer extends JsRenderer {
  private readonly model: StructureModel
  /** Hidden merge classes printed: def key → class name, in order of first use. */
  private readonly hidden = new Map<string, { name: string; def: TStructDef }>()
  /** In-place merge operands printed once: `unit:steps` → const name. */
  private readonly inPlace = new Map<string, string>()
  private readonly inPlaceText: string[] = []
  private readonly statements: TStatement[] = []
  private readonly aliasExports: NonNullable<TRealmModule['aliases']> = []
  /** Classes whose def is replaced by their statement (aliases, chain refs, `as` copies). */
  private readonly replacing = new Set<string>()
  /** The statement being printed: what it reads (see {@link TStatement.needs}, `guards`). */
  private needs = new Set<string>()
  private guards = new Map<string, TGuard>()
  /** The reads by their code (see {@link read}, {@link typed}). */
  private readonly readsByText = new Map<string, TRead>()

  /**
   * The statement reads the structure of `d`: its statement runs first, and so does its
   * target's when `d` is an alias (its def is its target's, built by the target's statement).
   */
  private needStructure(d: TStructDecl, seen = new Set<TStructDecl>()): void {
    if (seen.has(d)) {
      return
    }
    seen.add(d)
    this.needs.add(d.id)
    const e = d.kind === 'type' ? this.model.declExpr(d) : undefined
    const target =
      d.kind === 'as'
        ? this.model.asTarget(d)
        : e?.k === 'ref' || e?.k === 'chain'
          ? e.decl
          : undefined
    if (target) {
      this.needStructure(target, seen)
    }
  }

  private needUnit(unit: string): void {
    const d = unit.startsWith('m:') ? undefined : this.model.declById(unit)
    if (d) {
      this.needStructure(d)
    } else {
      this.needs.add(unit)
    }
  }

  /** Records guard `text` (`read`: the read it codes) of the statement being printed. */
  private guard(text: string, printed = true, read?: TRead): string {
    const key = printed ? text : `#${text}`
    if (!this.guards.has(key)) {
      this.guards.set(key, { text, printed, read })
    }
    return text
  }

  /**
   * `$f(name, …steps)` (`$ft` / `$fc` for `mode` 1 / 2): a read of the node at runtime `steps` of
   * class `name`, a guard of the statement being printed (`printed`: see {@link TGuard.printed}).
   */
  private read(mode: 0 | 1 | 2, name: string, steps: string[], printed = true): string {
    const fn = this.util(mode === 0 ? '$f' : mode === 1 ? '$ft' : '$fc')
    const text = `${fn}(${[name, ...steps.map(str)].join(', ')})`
    const read = { mode, name, steps }
    this.readsByText.set(text, read)
    return this.guard(text, printed, read)
  }

  /** Runs `fn` for a statement of its own (its needs and guards). */
  private statement(builds: string, fn: () => string): void {
    const saved = [this.needs, this.guards] as const
    this.needs = new Set()
    this.guards = new Map()
    try {
      const text = fn()
      this.statements.push({ text, builds, needs: this.needs, guards: this.guards })
    } finally {
      ;[this.needs, this.guards] = saved
    }
  }

  constructor(doc: AtscriptDoc, opts: TTsPluginOptions | undefined, mode: TCompileValidatorsMode) {
    super(doc, opts, mode)
    this.model = modelOf(doc)
  }

  // ── declarations ────────────────────────────────────────────────────────────────────────

  private decl(node: SemanticNode): TStructDecl | undefined {
    return this.model.declOfNode(node)
  }

  /** A bare plain alias (no annotations of its own): the module exports its target. */
  private isBare(d: TStructDecl): boolean {
    return d.kind === 'type' && this.model.bareTarget(d) !== d
  }

  /**
   * A class whose def is another node's (an annotated alias, a chain ref, an `as` copy: its
   * `$alias` installs it): declared with `type = null`, so a read before then waits (`$q`).
   */
  private isReplacing(d: TStructDecl): boolean {
    if (d.kind === 'as') {
      return true
    }
    const e = d.kind === 'type' ? this.model.declExpr(d) : undefined
    return (e?.k === 'ref' && !this.isBare(d)) || e?.k === 'chain'
  }

  protected override classTypeInit(node: SemanticNode): string {
    const d = this.decl(node)
    return d && (this.isReplacing(d) || this.defShared(d)) ? 'null' : '{}'
  }

  /**
   * A `type X = A & B` class whose builder takes another node's def (`$("", X).ref(…)` /
   * `.type(…)`: a merge collapsing to one class or a hidden class, a scalar merge that is a
   * reference): declared with `type = null` too — a reference to it reads its def once it is
   * built, also from the other module of an import cycle.
   */
  private defShared(d: TStructDecl): boolean {
    const e = d.kind === 'type' ? this.model.declExpr(d) : undefined
    if (e?.k !== 'and' || this.model.shapeAt(d, [])?.k === 'never') {
      return false
    }
    const def = this.model.declDef(d)
    if (def?.kind === 'class' && def.unit === d.id) {
      return false
    }
    return def ? true : isRef(this.doc.mergeIntersection(e.node as SemanticNode))
  }

  /** `$a(P.metadata, …)` writes of a class's own annotations (after its `$alias`). */
  private annotateCalls(name: string, node: SemanticNode): string {
    let out = ''
    for (const an of node.annotations ?? []) {
      const { value, multiple } = this.computeAnnotationValue(node, an)
      out += `\n${this.util('annotate')}(${name}.metadata, ${str(an.name)}, ${value}${multiple ? ', true' : ''})`
    }
    return out
  }

  /**
   * A bundled JSON schema (`$jbm`): the literal while the applied block modules are
   * those the build accounted.
   */
  protected override renderJsonSchemaMethod(node: SemanticNode) {
    if (node.countAnnotations('emit.jsonSchema') === 0 && this.jsonSchemaMode !== 'bundle') {
      super.renderJsonSchemaMethod(node)
      return
    }
    this.bundledSchemas.push(node.id!)
    this.writeln('static toJsonSchema() {')
    this.indent().writeln(`return ${this.util('bundledSchemaOf')}(this, () => {`)
    this.indent()
      .writeln(`return ${schemaMarker(node.id!)}`)
      .unindent()
    this.writeln(`}${accountedMarker(node.id!)})`).unindent()
    this.writeln('}')
  }

  /** The block modules the build's realm applied (`$jbm` compares the runtime's with them). */
  protected override accountedFor(realm: Realm): string[] {
    return [...(realm.rt.appliedBlockModules() as Set<string>)].sort()
  }

  protected override realm(module: TRealmModule): Realm {
    // (this module's phase 1 known: not rendered again for the realm)
    const cache = currentModules()
    const id = `${moduleKey(this.opts, this.compileMode)}\n${this.doc.id}`
    if (!cache.has(id)) {
      cache.set(id, module)
    }
    return moduleRealm(this.doc, this.opts, this.compileMode)
  }

  override renderType(node: SemanticTypeNode): void {
    const d = this.decl(node)
    if (d && this.isBare(d)) {
      return
    }
    super.renderType(node)
  }

  override renderModule(): TRealmModule {
    // (a module with structure errors — fails the build, as its diagnostics
    // do: it is not printed, so it is never loaded)
    const errors = this.model.structureErrors().filter(e => e.doc === this.doc)
    if (errors.length > 0) {
      throw new Error(`${this.doc.id}: ${errors[0].message}`)
    }
    // (any module with error diagnostics fails the build — never `any` in its place;
    // severity 1: TSeverity.Error)
    const diag = this.doc.getDiagMessages().find(m => m.severity === 1)
    if (diag) {
      throw new Error(`${this.doc.id}: ${diag.message}`)
    }
    const module = super.renderModule()
    // (a merge this module distributes past the bound, found while printing — never
    // a truncated union)
    if (this.model.tooComplexIn(this.doc)) {
      throw new Error(`${this.doc.id}: ${MERGE_TOO_COMPLEX}`)
    }
    return { ...module, aliases: [...this.aliasExports] }
  }

  /**
   * The local name of declaration `d`'s class: a bare alias's is its target's; another module's
   * is the binding of its import (synthesized when the module does not import it).
   */
  private nameOf(d: TStructDecl): string {
    if (d.doc === this.doc) {
      if (this.isBare(d)) {
        return this.nameOf(this.model.aliasStep(d)!)
      }
      return d.name
    }
    const mine = this.boundHere(d)
    if (!mine && !isExported(d)) {
      // (its module does not export it: read through a reference to it there)
      const via = this.hiddenDeclRef(d)
      if (via) {
        return via
      }
      throw new Error(
        `${this.doc.id}: Type "${d.name}" (declared in ${d.doc.id}) is not exported but is required here — export it`
      )
    }
    const name =
      mine && !this.unused.has(d.name)
        ? d.name
        : (this.synthBinding(d.name, { doc: d.doc, node: d.node })?.alias ?? d.name)
    this.read(0, name, [])
    return name
  }

  /** Whether declaration `d` (of another module) is bound here under its own name. */
  private boundHere(d: TStructDecl): boolean {
    const mine = this.resolveOwner(this.doc, d.name)
    return mine?.doc === d.doc && mine.node === d.node
  }

  private readonly hiddenDecls = new Map<TStructDecl, string | undefined>()
  /** Chain refs into this module, filled by a statement of their own (see `expr`). */
  private readonly chainFills = new Set<string>()

  /**
   * Whether the chain ref at (U, q) is printed as a placeholder its own statement fills: every
   * chain into this module or another module of its import cycle (a chain reaching a later
   * declaration, or one whose target holds a chain back, `P.q?: Q.x` with `Q.x: P.x`, cannot be
   * read by U's builder in every order — nor in every evaluation order of the cycle's modules).
   */
  private fillsLater(t: TStructDecl, U: TStructDecl, q: string[]): boolean {
    return (
      (t.doc === this.doc || imports(t.doc, this.doc)) &&
      U.doc === this.doc &&
      q.length > 0 &&
      !q.some(s => s.startsWith('&'))
    )
  }

  private fillLater(U: TStructDecl, q: string[], text: () => string): void {
    const id = `chain:${U.id}:${q.join('.')}`
    if (!this.chainFills.has(id)) {
      this.chainFills.add(id)
      this.statement(id, text)
    }
  }

  /**
   * A declaration another module does not export (a merge here reads its class): through a
   * reference to it an exported declaration of that module holds — `$f(E, …).ref.type()` —,
   * breadth first; undefined when none (the module fails: export it).
   */
  private hiddenDeclRef(d: TStructDecl): string | undefined {
    if (this.hiddenDecls.has(d)) {
      return this.hiddenDecls.get(d)
    }
    let out: string | undefined
    const queue = this.model.decls
      .filter(x => x.doc === d.doc && x !== d && x.kind !== 'as' && isExported(x))
      .map(decl => ({ decl, steps: [] as string[] }))
    const seen = new Set<string>()
    for (let i = 0; i < queue.length && !out; i++) {
      const { decl, steps } = queue[i]
      if (steps.length > 0) {
        // (a prop's written type; a union branch's written member)
        const branch = steps.at(-1)!.startsWith('|')
        const ends = branch ? undefined : this.model.slotAt(decl, steps)?.ends
        const e = branch ? this.exprAt(decl, steps) : ends?.length === 1 ? ends[0] : undefined
        if (e?.k === 'ref' && this.model.bareTarget(e.decl) === d) {
          out = `${this.pathRef(decl, steps)}.ref.type()`
          break
        }
      }
      const def = this.model.defAt(decl, steps)
      if (!def || seen.has(`${decl.id}:${def.key}`)) {
        continue
      }
      seen.add(`${decl.id}:${def.key}`)
      for (const k of def.names?.() ?? []) {
        queue.push({ decl, steps: [...steps, k] })
      }
      for (let b = 0; b < (def.size ?? 0); b++) {
        queue.push({ decl, steps: [...steps, `|${b}`] })
      }
    }
    this.hiddenDecls.set(d, out)
    return out
  }

  /** The class a unit id names (a declaration, or a hidden class `m:<key>`). */
  private unitName(unit: string): string {
    if (unit.startsWith('m:')) {
      return this.hiddenName(this.model.defByKey(unit)!)
    }
    return this.nameOf(this.model.declById(unit)!)
  }

  /** Another module's hidden class: the binding of its export (see {@link hiddenExportNames}). */
  private importedHidden(def: TStructDef, mod: AtscriptDoc): string {
    const exported = hiddenExportNames(this.model, mod).get(def.key)
    if (!exported) {
      throw new Error(`atscript next format: hidden class ${def.key} has no place in ${mod.id}`)
    }
    const name = this.synthBinding(exported, { doc: mod })?.alias ?? exported
    this.read(0, name, [])
    return name
  }

  /** The hidden class of merge def `def` (printed on first use). */
  private hiddenName(def: TStructDef): string {
    if (def.module && def.module !== this.doc) {
      return this.importedHidden(def, def.module)
    }
    let h = this.hidden.get(def.key)
    if (!h) {
      h = { name: this.allocAlias(`$M${this.hidden.size}`, this.getSynthTaken()), def }
      this.hidden.set(def.key, h)
      // (exported under its reserved name: another module's merge may read its fields)
      const exported = hiddenExportNames(this.model, this.doc).get(def.key)
      if (exported) {
        this.aliasExports.push({
          line: `export { ${h.name} as ${exported} }`,
          name: exported,
          local: h.name,
        })
      }
      this.printHidden(h.name, def)
    }
    return h.name
  }

  /** The declaration whose structure `d` has: an `as` copy's (through copies of copies) target. */
  private structureRoot(d: TStructDecl): TStructDecl | undefined {
    let root: TStructDecl | undefined = d
    while (root?.kind === 'as') {
      root = this.model.asTarget(root)
    }
    return root
  }

  /**
   * The runtime steps below `prefix` of declaration `d` for model `steps`: a `X | null` the model
   * passes through is a union node at runtime (`|i`: its non-null item).
   */
  private runtimePath(d: TStructDecl, prefix: string[], steps: string[]): string[] {
    const out: string[] = []
    const root = this.structureRoot(d)
    for (let i = 0; i < steps.length; i++) {
      // (the node reached so far: `X | null` written there is a union node at runtime)
      const at = [...prefix, ...steps.slice(0, i)]
      const slot = at.length > 0 ? this.model.slotAt(d, at) : undefined
      const e =
        at.length === 0
          ? root?.kind === 'type'
            ? this.model.declExpr(root)
            : undefined
          : slot?.ends.length === 1
            ? slot.ends[0]
            : undefined
      // (a merged node every contributor of which is nullable: its type is item 0, see `slotNode`)
      const merged =
        slot?.contributors && this.model.nullableSlot(slot) && !this.model.nullSlot(slot)
          ? 0
          : undefined
      const items = e ? this.nullItems(e) : merged === undefined ? [] : [merged]
      for (const item of items) {
        out.push(`|${item}`)
      }
      out.push(steps[i])
    }
    return out
  }

  /**
   * The written expression at `steps` of declaration `d` (props, `[]`, `|i`, `&i`: the i-th
   * operand of an intersection, flattened as the model does).
   */
  private exprAt(d: TStructDecl, steps: string[]): TStructExpr | undefined {
    let e: TStructExpr | undefined =
      d.kind === 'interface'
        ? { k: 'obj', node: d.node, props: this.model.ownProps(d) }
        : this.model.declExpr(d)
    for (const s of steps) {
      while (e?.k === 'nul') {
        e = e.of
      }
      if (!e) {
        return undefined
      }
      e = s.startsWith('&') ? andExprs(e)[Number(s.slice(1))] : exprStep(e, s)
    }
    return e
  }

  /** The runtime steps of model `steps` below written expression `e` (see {@link runtimePath}). */
  private exprPath(e: TStructExpr | undefined, steps: string[]): string[] {
    const out: string[] = []
    for (const s of steps) {
      if (e?.k === 'nul') {
        for (const at of this.nullItems(e)) {
          out.push(`|${at}`)
        }
        e = e.of
      }
      out.push(s)
      e = e && exprStep(e, s)
    }
    return out
  }

  /**
   * The runtime items a model step passes through at a node written `e`: `X | null` is a union
   * node (its non-null item), and so is an alias of one (`type N = X | null`; `N | null`: two).
   */
  private nullItems(e0: TStructExpr): number[] {
    const out: number[] = []
    let e: TStructExpr | undefined = e0
    // (each alias once: a cycle of aliases — reported — stops)
    const seen = new Set<TStructDecl>()
    while (e) {
      if (e.k === 'nul') {
        const at = this.nonNullItem(e, this.doc)!
        out.push(at)
        e = this.model.exprOf(this.doc, (e.node as SemanticGroup).unwrap()[at])
      } else if (e.k === 'ref' && e.decl.kind === 'type' && !seen.has(e.decl)) {
        seen.add(e.decl)
        const x = this.model.declExpr(e.decl)
        e = x.k === 'nul' || x.k === 'ref' || x.k === 'and' ? x : undefined
      } else if (e.k === 'and' && this.model.nullableExpr(e)) {
        // (a merge every operand of which is nullable: its merged node is item 0, see `mergeAt`)
        out.push(0)
        e = undefined
      } else {
        e = undefined
      }
    }
    return out
  }

  /** The non-null item of a written `X | null` (the model passes through it), else undefined. */
  private nonNullItem(e: TStructExpr, doc: AtscriptDoc): number | undefined {
    if (e.k !== 'nul') {
      return undefined
    }
    const items = (e.node as SemanticGroup).unwrap()
    const at = items.findIndex(n => !isNull(this.model.exprOf(doc, n)))
    return at < 0 ? 0 : at
  }

  /** A `$f(…)` read of a node whose def is captured: `$ft(…)` (its final def), a guard too. */
  private typed(ref: string): string {
    const r = this.readsByText.get(ref)
    if (r?.mode === 0) {
      return this.read(1, r.name, r.steps)
    }
    const f = `${this.util('$f')}(`
    // (a read through another class's node — `$f(…).ref.type()`: its code, typed)
    return ref.startsWith(f) ? this.guard(`${this.util('$ft')}(${ref.slice(f.length)}`) : ref
  }

  /** The statement reads `d`'s nodes along `steps`: the classes whose defs they walk are built first. */
  private needPath(d: TStructDecl, steps: string[]): void {
    for (let i = 0; i < steps.length; i++) {
      const at = this.model.defAt(d, steps.slice(0, i))
      const def = at && unshell(at)
      if (def?.kind === 'merge' || def?.kind === 'umerge') {
        this.needs.add(def.key)
      } else if (def?.unit && !def.unit.startsWith('m:')) {
        this.needUnit(def.unit)
      }
    }
  }

  /** `Decl, [steps]` of a chain ref (`.ref`, `$alias`): its `$f` read is a guard too. */
  private chainArgs(d: TStructDecl, path: string[]): string {
    this.needPath(d, path)
    if (d.doc === this.doc) {
      // (a placeholder of this module along the path — the node a step reaches, whichever
      // declaration owns it: filled first, see `expr`)
      for (let i = 1; i <= path.length; i++) {
        this.needs.add(`chain:${d.id}:${path.slice(0, i).join('.')}`)
        const o = this.model.slotAt(d, path.slice(0, i))?.owner
        if (o) {
          this.needs.add(`chain:${o.unit}:${o.path.join('.')}`)
        }
      }
    }
    const name = this.nameOf(d)
    const steps = this.runtimePath(d, [], path)
    this.read(1, name, steps)
    return `${name}, [${steps.map(str).join(', ')}]`
  }

  /** `$f(Decl, …steps)` (the declaration's class itself without steps). */
  private pathRef(d: TStructDecl, steps: string[], defNode = false): string {
    this.needStructure(d)
    this.needPath(d, steps)
    // (`defNode`: the node typed by the def at `steps` — the non-null item of `X | null` there)
    const path = defNode
      ? this.runtimePath(d, [], [...steps, '']).slice(0, -1)
      : this.runtimePath(d, [], steps)
    if (path.length === 0) {
      return this.nameOf(d)
    }
    // (the helper's local name first: a class named like it takes the suffix)
    this.util('$f')
    return this.read(0, this.nameOf(d), path)
  }

  /**
   * The node a slot's owner names: `$f(Root, …path)`; a path through an in-place merge operand
   * (`&i`) starts at that operand's node.
   */
  private nodeRef(owner: { unit: string; path: string[] }, defNode = false): string {
    const at = owner.path.findLastIndex(s => s.startsWith('&'))
    if (at >= 0) {
      const key = `${owner.unit}:${owner.path.slice(0, at + 1).join('/')}`
      let name = this.inPlace.get(key)
      const d = this.model.declById(owner.unit)
      if (!name && d?.doc === this.doc) {
        // (an operand of a merge this module prints later: printed now)
        const q = owner.path.slice(0, at)
        let e = this.exprAt(d, q)
        while (e?.k === 'nul') {
          e = e.of
        }
        if (e?.k === 'and') {
          this.printInPlaceOperands(e, d, q)
          name = this.inPlace.get(key)
        }
      }
      if (name && d?.doc === this.doc) {
        // (its node is read: its statement runs first)
        this.needs.add(`const:${name}`)
      }
      if (!name && d && d.doc !== this.doc) {
        // (another module's: it exports its in-place operands, see `inPlaceName`)
        const exported = inPlaceName(d, owner.path.slice(0, at + 1))
        name = this.synthBinding(exported, { doc: d.doc, node: d.node })?.alias ?? exported
        this.needUnit(owner.unit)
      }
      if (!name) {
        throw new Error(`atscript next format: in-place operand ${key} is not printed`)
      }
      const rest = owner.path.slice(at + 1)
      const prefix = owner.path.slice(0, at + 1)
      const operand = this.exprAt(d!, prefix)
      // (`defNode`: below `X | null` written there, its item — as for a declaration's path below)
      const steps = !operand
        ? rest
        : defNode
          ? this.exprPath(operand, [...rest, '']).slice(0, -1)
          : this.exprPath(operand, rest)
      return this.read(0, name, steps)
    }
    const root = this.unitName(owner.unit)
    const d = this.model.declById(owner.unit)
    // (`defNode`: the node typed by the slot's def — below `X | null` written there, its item)
    const path = !d
      ? owner.path
      : defNode
        ? this.runtimePath(d, [], [...owner.path, '']).slice(0, -1)
        : this.runtimePath(d, [], owner.path)
    if (path.length === 0) {
      return root
    }
    this.needUnit(owner.unit)
    return this.read(0, root, path)
  }

  /** `.annotate(…)` calls of annotations `anns` of `node`. */
  private annotations(node: SemanticNode, anns: TAnnotationTokens[] | undefined): string {
    let out = ''
    for (const an of anns ?? []) {
      const { value, multiple } = this.computeAnnotationValue(node, an)
      out += `.annotate(${str(an.name)}, ${value}${multiple ? ', true' : ''})`
    }
    return out
  }

  /**
   * The annotations a node of `holder` (a prop, a declaration) writes itself: its own when its
   * type is a class (a reference, a chain, a merge: the rest comes through its layers), else its
   * evaluated ones (a primitive's built-ins included).
   */
  private ownAnnotations(holder: SemanticNode, e: TStructExpr): string {
    // (a union of chain refs — a chain through a union — is layered per branch)
    const layered =
      e.k === 'ref' || e.k === 'chain' || e.k === 'and' || (e.k === 'uni' && isRef(e.node))
    const anns = layered ? holder.annotations : this.doc.evalAnnotationsForNode(holder)
    const out = this.annotations(holder, anns)
    return !layered && holder.entity === 'type' ? out + this.intrinsicMarks(anns) : out
  }

  /**
   * A primitive extension's own `passedWhenReferred: false` annotations are part of
   * the type: marked (`.intrinsic(…)`) on a declaration's node, they pass the reference layers over it.
   */
  private intrinsicMarks(anns: TAnnotationTokens[] | undefined): string {
    const last = new Map((anns ?? []).map(a => [a.name, a]))
    const keys = [...last.values()]
      .filter(
        a => a.intrinsic && this.doc.resolveAnnotation(a.name)?.config.passedWhenReferred === false
      )
      .map(a => str(a.name))
    return keys.length > 0 ? `.intrinsic(${keys.join(', ')})` : ''
  }

  // ── expressions ─────────────────────────────────────────────────────────────────────────

  /** A primitive / literal node's chain (`member`: a union / tuple item or an array element). */
  private scalar(node: SemanticNode | undefined, member: boolean): string {
    return this.capture(() => {
      if (isPrimitive(node)) {
        this.definePrimitive(node)
        if (member && node.annotations?.length) {
          this.indent()
          for (const an of node.annotations) {
            this.resolveAnnotationValue(node, an)
          }
          this.unindent()
        }
      } else if (isConst(node)) {
        this.writeln(`${this.$}()`)
        this.indent().defineConst(node).unindent()
      } else {
        this.writeln(this.scalarGroup(node, member))
      }
    })
  }

  /**
   * What the scalar algebra gives besides a primitive / literal: a reference (to a scalar type),
   * a group of scalars kept as written (a union, an intersection both sides of which check
   * something, a tuple), an array of them.
   */
  private scalarGroup(node: SemanticNode | undefined, member: boolean): string {
    const $ = this.$
    if (isRef(node)) {
      const e = this.model.exprOf(this.doc, node)
      if (e.k === 'ref') {
        return `${$}().ref(${this.refTarget(e.decl)})`
      }
      if (e.k === 'chain') {
        this.needStructure(e.decl)
        return `${$}().ref(${this.chainArgs(e.decl, e.path)})`
      }
      return e.k === 'scalar' ? this.scalar(e.node, member) : `${$}().designType("any")`
    }
    if (isGroup(node) && node.op === '&') {
      // (a distributed union's branch stays an intersection in core: merged where it is printed)
      const merged = this.doc.mergeIntersection(node)
      if (merged !== node && !(isGroup(merged) && merged.op === '&')) {
        return this.scalar(merged, member).trimEnd()
      }
      // (kept as an intersection: both sides check something)
      node = merged
    }
    if (isGroup(node) && node.unwrap().length === 1) {
      return this.scalar(node.unwrap()[0], member).trimEnd()
    }
    if (isGroup(node) || isTuple(node)) {
      const kind = isTuple(node) ? 'tuple' : node.op === '&' ? 'intersection' : 'union'
      let out = `${$}("${kind}")`
      for (const item of node.unwrap()) {
        out += `\n  .item(${this.indentText(this.scalar(item, true))}.$type)`
      }
      return out
    }
    if (isArray(node)) {
      return `${$}("array").of(${this.indentText(this.scalar(node.getDefinition(), true))}.$type)`
    }
    return `${$}().designType("any")`
  }

  /**
   * The chain building the node a written expression `e` gives at (U, q) (no `.$type`): a
   * reference, a builder written in place, a merge's hidden class.
   */
  private expr(e: TStructExpr, U: TStructDecl, q: string[], member = false): string {
    const $ = this.$
    switch (e.k) {
      case 'ref': {
        const target = this.isBare(e.decl) ? this.model.bareTarget(e.decl) : e.decl
        // (a union / tuple item or an element is not the node at q: `member`)
        if (!member && this.isReplacing(target) && this.fillsLater(target, U, q)) {
          // (a class of this module that another node's def replaces — an annotated alias, a
          // chain alias `RX = R.p.x`, an `as` copy — may need this very builder built first,
          // `P.q?: RX`: a node of its own now, made a thin node over the class once it is;
          // declaration order is not semantics)
          this.fillLater(U, q, () => {
            this.needs.add(target.id)
            return `${this.util('$alias')}(${this.pathRef(U, q)}, ${this.refTarget(target)}, [])`
          })
          return `${$}()`
        }
        return `${$}().ref(${this.refTarget(e.decl)})`
      }
      case 'chain': {
        if (this.fillsLater(e.decl, U, q)) {
          // (a chain into this module may read a field this very builder — or one needing it —
          // builds, `a?: T.n`, `A.by: B.y` with `B.ax: A.x`: a node of its own now, made a thin
          // node over the field once both are built; declaration order is not semantics)
          this.fillLater(U, q, () => {
            this.needStructure(e.decl)
            // (a member at q — the item of `X | null` written there — is its def's node)
            return `${this.util('$alias')}(${this.pathRef(U, q, member)}, ${this.chainArgs(e.decl, e.path)})`
          })
          return `${$}()`
        }
        this.needStructure(e.decl)
        return `${$}().ref(${this.chainArgs(e.decl, e.path)})`
      }
      case 'obj': {
        return this.chainOf(
          `${$}("object")`,
          e.props.map(
            p =>
              `\n  .${this.propCall(p.node, p.name)}${this.indentText(this.propNode(p.node, p.type, p.optional, U, [...q, p.name]))}.$type)`
          )
        )
      }
      case 'arr': {
        return `${$}("array").of(${this.indentText(this.expr(e.of, U, [...q, '[]'], true))}.$type)`
      }
      case 'nul':
      case 'uni':
      case 'tup': {
        const group = e.node as SemanticGroup
        const items =
          e.k === 'nul' ? group.unwrap().map(n => this.model.exprOf(this.doc, n)) : e.items
        const kind = e.k === 'tup' ? 'tuple' : 'union'
        return this.chainOf(
          `${$}("${kind}")`,
          items.map((x, i) => {
            // (`X | null`: the model's steps pass through to X)
            const steps = e.k === 'nul' ? q : [...q, `|${i}`]
            return `\n  .item(${this.indentText(this.expr(x, U, steps, true))}.$type)`
          })
        )
      }
      case 'and': {
        return this.mergeAt(e, U, q)
      }
      case 'scalar': {
        return this.scalar(e.node, member)
      }
      default: {
        return `${$}().designType("any")`
      }
    }
  }

  /** The class a reference to `d` is built over (a bare alias: its target). */
  private refTarget(d: TStructDecl): string {
    const target = this.isBare(d) && d.doc === this.doc ? this.model.bareTarget(d) : d
    const name = this.nameOf(target)
    if (target.doc === this.doc && this.replacing.has(target.id)) {
      this.needs.add(target.id)
      this.read(1, name, [])
    } else if (
      target.doc === this.doc &&
      target.kind === 'type' &&
      this.model.shapeAt(target, [])?.k === 'scalar'
    ) {
      // (a scalar class of this module — `type N = string & S` — is built before a reference
      // to it reads its def: declaration order is not semantics)
      this.needs.add(target.id)
    }
    return name
  }

  /** `.prop("name", ` / `.propPattern(/re/, ` of prop `prop`. */
  private propCall(prop: SemanticPropNode, name: string): string {
    const pattern = prop.token('identifier')?.pattern
    return pattern ? `propPattern(/${pattern.source}/${pattern.flags}, ` : `prop(${str(name)}, `
  }

  /** A prop's own node (written in place): its type's chain, its annotations, `?`. */
  private propNode(
    prop: SemanticPropNode,
    e: TStructExpr,
    optional: boolean,
    U: TStructDecl,
    q: string[]
  ): string {
    return `${this.expr(e, U, q)}${this.ownAnnotations(prop, e)}${optional ? '.optional()' : ''}`
  }

  private indentText(text: string): string {
    return text.replaceAll('\n', '\n  ')
  }

  /** An unmergeable merge's node: `never`, tagged as a written `never` is (0.1.110). */
  private never(): string {
    return `${this.$}().designType("never").tags("never")`
  }

  /**
   * An intersection written at (U, q): the hidden class of its merge (`$().ref($Mn)`), a union of
   * them (a union operand distributes), the class it collapses to, or the scalar the algebra gives.
   */
  private mergeAt(e: TStructExpr & { k: 'and' }, U: TStructDecl, q: string[]): string {
    this.printInPlaceOperands(e, U, q)
    const shape = this.model.shape(e).k
    if (shape === 'never' || shape === 'mixed') {
      // (operands of different shapes — `A[] & [B]`: unmergeable; every branch of a
      // distributed merge unmergeable)
      return this.never()
    }
    if (shape === 'scalar') {
      // (scalars, `null` too — `(X | null) & null`: the core algebra)
      return this.defNode(undefined, e)
    }
    const def = this.model.defOfExpr(U, q, e)
    const root =
      def && def.kind !== 'class' && def.kind !== 'merge' && def.kind !== 'umerge'
        ? this.rootDefOf(def)
        : undefined
    if (def?.kind === 'merge' || def?.kind === 'umerge' || def?.kind === 'class' || root) {
      // (typed by its hidden class — or the one class it collapses to, `A & A`, a union `V & V`
      // too —; its own metadata reads through the operands' nodes)
      const cls = root
        ? this.nameOf(root)
        : def!.kind === 'class'
          ? this.unitName(def!.unit!)
          : this.hiddenName(def!)
      // (a merge that reduces to one declaration carries its id)
      const one = root ?? this.oneDecl(def)
      const id = one ? `.id(${str(one.name)})` : ''
      const bases = this.operandBases(e)
      const over = bases.length > 0 ? `.over([${bases.join(', ')}], true)` : ''
      // (every operand nullable: a union of the merged node and null; the merged node is the
      // merge of the operands, so it layers over them too)
      return this.model.nullableExpr(e)
        ? `${this.nullUnion(`${this.$}().type(${cls})${id}${over}`)}${over}`
        : `${this.$}().type(${cls})${id}${over}`
    }
    return this.defNode(def, e)
  }

  /** A node of type `null` (tagged as a written `null` is). */
  private nullNode(): string {
    return `${this.$}().designType("null").tags("null")`
  }

  /** `$("union", Name?)` of `item` (a chain) and `null`: a merge every operand of which is nullable. */
  private nullUnion(item: string, name?: string): string {
    return `${this.$}("union"${name ? `, ${name}` : ''})\n  .item(${this.indentText(item)}.$type)\n  .item(${this.nullNode()}.$type)`
  }

  /** The chain of a node whose def is `def` (`e`: what is written there, for scalars). */
  private defNode(def: TStructDef | undefined, e: TStructExpr): string {
    const $ = this.$
    if (!def) {
      // (scalars merge by the core algebra; the merged primitive's own annotations — an
      // extension's built-ins, `string.email`'s pattern — are the node's)
      const merged = this.doc.mergeIntersection(e.node as SemanticNode)
      return this.scalar(merged, true)
    }
    switch (def.kind) {
      case 'merge':
      case 'umerge': {
        // (a distributed merge: one union def per module too — its branch nodes are shared)
        return `${$}().ref(${this.hiddenName(def)})`
      }
      case 'class': {
        return `${$}().ref(${this.unitName(def.unit!)})`
      }
      default: {
        return `${$}().designType("any")`
      }
    }
  }

  /** The in-place object / array operands of intersection `e` at (U, q), as module constants. */
  private printInPlaceOperands(e: TStructExpr & { k: 'and' }, U: TStructDecl, q: string[]) {
    andExprs(e).forEach((x, i) => {
      if (x.k !== 'obj' && x.k !== 'arr' && x.k !== 'uni') {
        return
      }
      const steps = [...q, `&${i}`]
      const key = `${U.id}:${steps.join('/')}`
      if (!this.inPlace.has(key)) {
        const name = inPlaceName(U, steps)
        this.getSynthTaken().add(name)
        this.inPlace.set(key, name)
        if (isExported(U)) {
          this.aliasExports.push({ line: `export { ${name} }`, name, local: name })
        }
        this.statement(`const:${name}`, () => `${name} = ${this.expr(x, U, steps)}.$type`)
        this.needs.add(`const:${name}`)
        this.guard(name)
        this.inPlaceText.push(name)
      }
    })
  }

  // ── merged structure (hidden classes, named merges, extends) ───────────────────────────

  /** A hidden merge class: its declaration and its builder statement. */
  private printHidden(name: string, def: TStructDef) {
    this.declaredClasses.push(name)
    this.statement(def.key, () =>
      def.kind === 'umerge'
        ? this.unionOfMerges(name, def)
        : this.isArrayDef(def)
          ? `${this.$}("array", ${name}).of(${this.indentText(this.slotNode((def.raw ?? def.slot)('[]')!, def.key))})`
          : this.withFields(
              `${this.$}("object", ${name})${this.rootLayers(def.ops ?? [], true)}`,
              def,
              def.key
            )
    )
  }

  /**
   * A distributed merged field's own union: branch `i` is the branch merge's
   * def, its metadata layered over what each contributor gives that branch, later first — a union
   * contributor's member there; another contributor's type as written (an annotated alias its
   * own node), the branch passing through it: not the contributor's node (its own
   * annotations and path overrides are the field's, which layers over it). A reference layer,
   * as the branch's `ref` was: `passedWhenReferred: false` keys do not pass.
   */
  private mergedUnion(def: TStructDef, contributors: TStructSlot[]): string {
    let out = `${this.$}("union")`
    for (let i = 0; i < (def.size ?? 0); i++) {
      const b = def.branch!(i)
      const d = b && this.rootDefOf(b)
      const item =
        b && (b.kind === 'merge' || b.kind === 'umerge')
          ? `${this.$}().type(${this.hiddenName(b)})`
          : d
            ? `${this.$}().type(${this.nameOf(d)}).id(${str(d.name)})`
            : b
              ? this.defNode(b, { k: 'unknown' })
              : this.scalarBranch(def, i)
      const bases = contributors.flatMap(c => {
        const at = this.model.branchItem(def, i, c.def)
        if (!at || !c.owner) {
          return this.writtenTypeNodes(c)
        }
        // (its member there is an item of its union def: built first)
        const cd = this.shelled(c.def)
        if (cd?.kind === 'merge' || cd?.kind === 'umerge') {
          this.needs.add(cd.key)
        }
        return [
          this.nodeRef({ unit: c.owner.unit, path: [...c.owner.path, ...at.map(k => `|${k}`)] }),
        ]
      })
      out += `\n  .item(${this.indentText(`${item}.over([${bases.join(', ')}], true)`)}.$type)`
    }
    return out
  }

  /**
   * The nodes contributor `c`'s written type stands for (`p?: T`: T, an annotated alias its own
   * class; a chain ref: that field; a merge written there: its hidden class); an object written
   * in place has no metadata of its own: none.
   */
  private writtenTypeNodes(c: TStructSlot): string[] {
    return c.ends.flatMap(e0 => {
      let e = e0
      while (e.k === 'nul') {
        e = e.of
      }
      if (e.k === 'ref') {
        return [this.refTarget(e.decl)]
      }
      if (e.k === 'chain') {
        return [this.pathRef(e.decl, e.path)]
      }
      const d = this.shelled(c.def)
      if (e.k === 'and' && d?.kind === 'merge') {
        this.needs.add(d.key)
        return [this.hiddenName(d)]
      }
      if (e.k === 'and' && d?.kind === 'class' && d.unit) {
        // (a merge that reduces to one declaration — `I3 & I3`: that class)
        return [this.unitName(d.unit)]
      }
      return []
    })
  }

  /** The one declaration a class def is, or a hidden merge's operands are (it gives the id). */
  private oneDecl(def: TStructDef | undefined): TStructDecl | undefined {
    return def?.kind === 'class' && def.unit
      ? this.model.declById(def.unit)
      : def?.kind === 'merge'
        ? this.mergeOfOne(def)
        : undefined
  }

  /** The one declaration a hidden merge's operands are (shells looked through), if so. */
  private mergeOfOne(def: TStructDef): TStructDecl | undefined {
    const ds = (def.ops ?? []).map(op => {
      const d = this.shelled(op)
      return d && this.rootDefOf(d)
    })
    return ds.length > 0 && ds[0] && ds.every(d => d === ds[0]) ? ds[0] : undefined
  }

  /** A def with its shells looked through (the def they shell). */
  private shelled(def: TStructDef | undefined): TStructDef | undefined {
    return def && unshell(def)
  }

  /** `$("union", Name)` of a distributed merge's branches (each a merge's hidden class). */
  private unionOfMerges(name: string, def: TStructDef): string {
    let out = `${this.$}("union", ${name})`
    for (let i = 0; i < (def.size ?? 0); i++) {
      const b = def.branch!(i)
      const d = b && this.rootDefOf(b)
      const item =
        b && (b.kind === 'merge' || b.kind === 'umerge')
          ? `${this.$}().ref(${this.hiddenName(b)})`
          : d
            ? `${this.$}().ref(${this.nameOf(d)})`
            : b
              ? this.defNode(b, { k: 'unknown' })
              : this.scalarBranch(def, i)
      out += `\n  .item(${item}.$type)`
    }
    return out
  }

  /** The declaration whose root def `def` is (a class, a `type X = …` builder), if any. */
  private rootDefOf(def: TStructDef): TStructDecl | undefined {
    const d = def.unit && !def.unit.startsWith('m:') ? this.model.declById(def.unit) : undefined
    // (`a:<id>`: an annotated alias written as a merge operand)
    return d && (this.model.declDef(d)?.key === def.key || def.key === `a:${d.id}`) ? d : undefined
  }

  /** A def of an array (its only child is the element: an array merge, item-wise). */
  private isArrayDef(def: TStructDef): boolean {
    const names = def.names?.() ?? []
    return names.length === 1 && names[0] === '[]'
  }

  /** `.over([…])` of a merge root over its operands' classes (later first). */
  private rootLayers(ops: TStructDef[], reference: boolean): string {
    // (an operand's class: a declaration whose def it is — a class, an `as` copy's view)
    const bases = ops
      .map(o => this.rootDefOf(o))
      .filter((d): d is TStructDecl => !!d)
      .map(d => this.nameOf(d))
      .reverse()
    return bases.length > 0 ? `.over([${bases.join(', ')}]${reference ? ', true' : ''})` : ''
  }

  /** The props of a merged def (`unit`: its owner): references, own merged nodes, own props. */
  private withFields(
    head: string,
    def: TStructDef,
    unit: string,
    own?: Map<string, SemanticPropNode>,
    U?: TStructDecl
  ): string {
    const members: string[] = []
    for (const k of def.names?.() ?? []) {
      const s = (def.raw ?? def.slot)(k)
      if (!s) {
        continue
      }
      // (a prop pattern, `*` / `/re/f`: `.propPattern`)
      const re = k === '*' ? '/./' : /^\/.*\/[a-z]*$/.test(k) ? k : undefined
      members.push(
        `\n  .${re ? `propPattern(${re}` : `prop(${str(k)}`}, ${this.indentText(this.slotNode(s, unit, own?.get(k), U))})`
      )
    }
    return this.chainOf(head, members)
  }

  /** The handle parameter of the functions splitting long chains (see {@link chainOf}). */
  private chainHandle?: string

  /**
   * `head` and its chained `members` (`\n  .prop(…)` / `.item(…)`): more than {@link MAX_CHAIN}
   * members are split into statements on the handle in a function called with `head` — a chain of
   * tens of thousands of calls is nested too deep for V8 to parse (as the legacy renderer's `chain`).
   */
  private chainOf(head: string, members: string[]): string {
    if (members.length <= MAX_CHAIN) {
      return head + members.join('')
    }
    this.chainHandle ??= this.allocAlias('$h', this.getSynthTaken())
    const h = this.chainHandle
    let out = `(${h} => {`
    for (let i = 0; i < members.length; i += MAX_CHAIN) {
      out += `\n  ${h}${this.indentText(members.slice(i, i + MAX_CHAIN).join(''))}`
    }
    return `${out}\n  return ${h}\n})(${head})`
  }

  /** The node of slot `s` of a merged def owned by `unit` (with its `.$type`). */
  private slotNode(s: TStructSlot, unit: string, prop?: SemanticPropNode, U?: TStructDecl): string {
    const own = !s.owner || (s.owner.unit === unit && s.owner.path.length === 1)
    if (!own) {
      // (one contributor, or a node of another class: that node)
      return this.nodeRef(s.owner!)
    }
    if (prop && U) {
      // (a declaration's own prop)
      const e = this.model.exprOf(this.doc, prop.def)
      return `${this.propNode(prop, e, s.optional, U, [prop.id!])}.$type`
    }
    // (several contributors: a node of its own, layered over them, later first — the model lists
    // them in priority order, an in-place member of the merge it is written in last)
    const contributors = [...(s.contributors ?? [])].reverse()
    const bases = contributors.map(c => this.nodeRef(c.owner!))
    const end = s.ends[0] ?? { k: 'unknown' }
    let type: string
    // (a scalar merge computed with the contributors' `?`: its `null` is in it)
    let scalarMerge = false
    // (a node of a merged scalar's type, its last base: see {@link scalarTypeBase})
    let typeBase: string[] = []
    if (this.model.slotShape(s).k === 'never') {
      // (unmergeable shapes: `never`, keeping `?`)
      type = this.never()
    } else if (this.model.nullSlot(s)) {
      // (`{ a?: X } & { a: null }`: an optional contributor passes `null`, the merge is `null`)
      type = this.nullNode()
    } else if (s.def?.kind === 'umerge') {
      type = this.mergedUnion(s.def, contributors)
    } else if (s.def?.kind === 'merge') {
      // (operands that are one declaration — block shells counted as what they
      // shell — give it that declaration's id)
      const one = this.mergeOfOne(s.def)
      type = `${this.$}().type(${this.hiddenName(s.def)})${one ? `.id(${str(one.name)})` : ''}`
    } else if (s.def && this.rootDefOf(s.def)) {
      // (a declaration's def: its class's, and its id — as a reference to it has)
      const d = this.rootDefOf(s.def)!
      type = `${this.$}().type(${this.nameOf(d)}).id(${str(d.name)})`
    } else if (s.def) {
      // (the contributors' common def — a builder's, a shell def: the def of a contributor's
      // node)
      const same = s.contributors?.find(c => c.def?.key === s.def!.key && c.owner)
      // (a shell def of a declaration's def: that declaration's id — a shell counts as what it
      // shells)
      const shelled = this.shelled(s.def)
      const one = shelled && this.rootDefOf(shelled)
      type = same
        ? `${this.$}().type(${this.typed(this.nodeRef(same.owner!, true))})${one ? `.id(${str(one.name)})` : ''}`
        : this.defNode(s.def, end)
    } else {
      // (scalars: the core algebra's merge of the written types — an optional contributor passes
      // `null` when a required one may be `null`, as core merges props)
      const cs = s.contributors ?? []
      if (cs.length > 1 && cs.every(c => c.ends.length === 1 && c.ends[0].node)) {
        const merged = this.doc.mergeFieldTypes(
          cs.map(c => ({ def: c.ends[0].node as SemanticNode, optional: c.optional }))
        )
        type = this.scalar(merged, false)
        typeBase = this.scalarTypeBase(merged, s.ends)
        scalarMerge = true
      } else {
        const nodes = s.ends.map(x => x.node).filter((n): n is SemanticNode => !!n)
        const merged =
          nodes.length > 1 ? this.doc.mergeIntersection(new SemanticGroup(nodes, '&')) : nodes[0]
        type = this.scalar(merged, false)
        typeBase = this.scalarTypeBase(merged, s.ends)
      }
    }
    if (
      !scalarMerge &&
      this.model.nullableSlot(s) &&
      !this.model.nullSlot(s) &&
      type !== this.never()
    ) {
      // (every contributor is nullable: so is the merged node — its type first, then `null`; the
      // type is the merge of the contributors' items, so it layers over them)
      const items = [...contributors.map(c => this.nodeRef(c.owner!, true)), ...typeBase]
      type = this.nullUnion(`${type}.over([${items.join(', ')}])`)
      typeBase = []
    }
    return `${type}.over([${[...bases, ...typeBase].join(', ')}])${s.optional ? '.optional()' : ''}.$type`
  }

  /**
   * A merged field's scalar type `merged` picked from a union member (no
   * contributor written as it: `string & (string.email | number)` is `string.email`) is a base of
   * the field, last — a node of it, as the union's branch item is, so its own annotations (an
   * annotated alias's, a primitive extension's intrinsic checks) are read as the type's. A
   * contributor written as that type carries them already, and a primitive / literal without
   * annotations has none: no base.
   */
  private scalarTypeBase(merged: SemanticNode | undefined, ends: TStructExpr[]): string[] {
    const x = merged && this.model.exprOf(this.doc, merged)
    const k = x && scalarKey(x)
    if (
      !k ||
      ends.some(e => scalarKey(e) === k) ||
      (x.k === 'scalar' && !x.node?.annotations?.length)
    ) {
      return []
    }
    return [`${this.scalar(merged, true).trimEnd()}.$type`]
  }

  // ── per declaration ─────────────────────────────────────────────────────────────────────

  /** The builder statement of declaration `d` of this module. */
  private declStatement(d: TStructDecl): void {
    this.statement(d.id, () => this.declText(d))
    // (its shells, once what they shell is built; a read they change waits for them: the
    // statement's needs, `$ps` in an import cycle)
    this.shellStatements(d)
  }

  private declText(d: TStructDecl): string {
    const name = this.nameOf(d)
    let text: string | undefined
    if (d.kind === 'as') {
      // `annotate T as X { … }`: T's structure, a layer over T, X's entries on top (rank ⊥)
      const node = d.node as SemanticAnnotateNode
      const target = this.model.asTarget(d)!
      this.replacing.add(d.id)
      text = `${this.util('$alias')}(${name}, ${this.refTarget(target)})${this.annotateCalls(name, node)}${this.asEntries(d)}`
    } else if (d.kind === 'interface' && this.model.extendsOf(d).length === 0) {
      const props = this.model.ownProps(d)
      text = this.chainOf(
        `${this.$}("object", ${name})${this.annotations(d.node, d.node.annotations)}`,
        props.map(
          p =>
            `\n  .${this.propCall(p.node, p.name)}${this.indentText(this.propNode(p.node, p.type, p.optional, d, [p.name]))}.$type)`
        )
      )
    } else if (d.kind === 'interface') {
      // (`extends`: printed like a named merge; the parents' type-level annotations are not its)
      const def = this.model.declDef(d)!
      const own = new Map(this.model.ownProps(d).map(p => [p.name, p.node]))
      text = this.withFields(
        `${this.$}("object", ${name})${this.annotations(d.node, d.node.annotations)}`,
        def,
        d.id,
        own,
        d
      )
    } else {
      const e = this.model.declExpr(d)
      if (e.k === 'ref') {
        // an annotated alias: a thin node over its target (a bare one is not printed: exported);
        // its layer is a reference layer — no `passedWhenReferred: false` keys
        this.replacing.add(d.id)
        text = `${this.util('$alias')}(${name}, ${this.refTarget(e.decl)}, [])${this.annotateCalls(name, d.node)}`
      } else if (e.k === 'chain') {
        this.replacing.add(d.id)
        this.needStructure(e.decl)
        text = `${this.util('$alias')}(${name}, ${this.chainArgs(e.decl, e.path)})${this.annotateCalls(name, d.node)}`
      } else if (e.k === 'and') {
        this.printInPlaceOperands(e, d, [])
        const shape = this.model.shapeAt(d, [])?.k
        // (scalars, `null` too — `(X | null) & null`: the core algebra)
        const def = shape === 'scalar' ? undefined : this.model.declDef(d)
        if (shape === 'never') {
          // (unmergeable operands: `never`; core warns)
          text = `${this.$}("", ${name}).designType("never").tags("never")${this.namedRootLayers(d)}${this.annotations(d.node, d.node.annotations)}`
        } else if (def?.kind === 'class' && def.unit === d.id && def.uni) {
          // a named merge with a union operand: a union of the branches' merges
          // (its root over its operands' nodes but the union's; branch i over the operands with
          // the union's i-th member, per branch)
          text = `${this.$}("union", ${name})${this.namedRootLayers(d)}${this.annotations(d.node, d.node.annotations)}`
          for (let i = 0; i < (def.size ?? 0); i++) {
            const b = def.branch!(i)
            const bases = this.operandBases(this.branchExpr(def, i, e))
            const item =
              b && (b.kind === 'merge' || b.kind === 'umerge') && bases.length > 0
                ? `${this.$}().type(${this.hiddenName(b)}).over([${bases.join(', ')}], true)`
                : b
                  ? this.defNode(b, e)
                  : this.scalarBranch(def, i)
            text += `\n  .item(${this.indentText(item)}.$type)`
          }
        } else if (def?.kind === 'class' && def.unit === d.id && this.isArrayDef(def)) {
          // a named merge of arrays: an array class, its elements merged
          text = `${this.$}("array", ${name})${this.namedRootLayers(d)}${this.annotations(d.node, d.node.annotations)}.of(${this.indentText(this.slotNode((def.raw ?? def.slot)('[]')!, d.id))})`
        } else if (def?.kind === 'class' && def.unit === d.id) {
          // a named merge: its own class with the merged structure, layered over its operands
          text = this.model.nullableExpr(e)
            ? // (every operand nullable: a union of its merged object and null; the object is the
              // merge of the operands, so it layers over them too)
              `${this.nullUnion(this.withFields(`${this.$}("object")${this.namedRootLayers(d)}`, def, d.id), name)}${this.namedRootLayers(d)}${this.annotations(d.node, d.node.annotations)}`
            : this.withFields(
                `${this.$}("object", ${name})${this.namedRootLayers(d)}${this.annotations(d.node, d.node.annotations)}`,
                def,
                d.id
              )
        } else {
          text = this.namedNode(name, this.defNode(def, e), d, e)
          if (!def) {
            // (a merged primitive's built-ins pass references to it, as an alias of it)
            text += this.intrinsicMarks(
              this.doc.mergeIntersection(e.node as SemanticNode).annotations
            )
          }
        }
      } else {
        text = this.namedNode(name, this.expr(e, d, []), d, e)
      }
    }
    return text
  }

  /**
   * `.over([…], true)` of named merge `d`'s root: over its written operands' classes, later first
   * (an annotated alias operand is its own class, a bare one its target).
   */
  private namedRootLayers(d: TStructDecl): string {
    const bases = this.operandBases(this.model.declExpr(d))
    return bases.length > 0 ? `.over([${bases.join(', ')}], true)` : ''
  }

  /**
   * Branch `i` of a distributed merge `def` (written `e`): its members' written types (one member
   * of each union operand, the product's i-th surviving branch).
   */
  private branchExpr(def: TStructDef, i: number, e: TStructExpr): TStructExpr {
    return { k: 'and', node: e.node as SemanticNode, items: def.bsrc?.(i) ?? [] }
  }

  /** A distributed merge's branch of scalars only: the core algebra's merge of its members. */
  private scalarBranch(def: TStructDef, i: number): string {
    const nodes = (def.bsrc?.(i) ?? []).map(x => x.node).filter((n): n is SemanticNode => !!n)
    if (nodes.length === 0) {
      return this.never()
    }
    const merged =
      nodes.length > 1 ? this.doc.mergeIntersection(new SemanticGroup(nodes, '&')) : nodes[0]
    // (a node of its own, as a place's merge: its primitive's own annotations)
    return this.scalar(merged, true)
  }

  /**
   * The nodes a merge's root reads through, priority order (each operand's node, later
   * first): a class; a chain ref's field node; `X | null` written there:
   * X's class; an alias of a nullable type (`type XN = X | null`): XN's own over X's class.
   */
  private operandBases(e: TStructExpr): string[] {
    const out: string[] = []
    const nodeOf = (x: TStructExpr): string | undefined =>
      x.k === 'ref'
        ? this.refTarget(x.decl)
        : x.k === 'chain'
          ? this.pathRef(x.decl, x.path)
          : undefined
    const visit = (x: TStructExpr) => {
      if (x.k === 'and') {
        x.items.forEach(visit)
      } else if (x.k === 'nul') {
        const n = nodeOf(x.of)
        if (n) {
          out.push(n)
        }
      } else if (x.k === 'ref') {
        const t = x.decl.kind === 'type' ? this.model.declExpr(x.decl) : undefined
        const inner = t?.k === 'nul' ? nodeOf(t.of) : undefined
        if (inner) {
          out.push(inner)
        }
        out.push(this.refTarget(x.decl))
      } else {
        const n = nodeOf(x)
        if (n) {
          out.push(n)
        }
      }
    }
    visit(e)
    // (later first; a repeated operand counts at its last place, where it wins)
    return [...new Set(out.reverse())]
  }

  /** A `type T = …` class built by an expression's chain: re-rooted on the class. */
  private namedNode(name: string, chain: string, d: TStructDecl, e: TStructExpr): string {
    // (`$()` / `$("kind")` → `$("", T)` / `$("kind", T)`: the chain builds the class in place)
    const $ = this.$
    const reroot = (c: string) =>
      c.startsWith(`${$}()`)
        ? `${$}("", ${name})${c.slice($.length + 2)}`
        : c.replace(
            new RegExp(`^\\${$}\\("([a-z]*)"\\)`),
            (_, kind: string) => `${$}("${kind}", ${name})`
          )
    // (a split chain, `(h => { … })(head)`: its head — see `chainOf`)
    const split = this.chainHandle && chain.startsWith(`(${this.chainHandle} => {`)
    const at = split ? chain.lastIndexOf('})(') + 3 : 0
    const head = split ? `${chain.slice(0, at)}${reroot(chain.slice(at, -1))})` : reroot(chain)
    return `${head}${this.ownAnnotations(d.node, e)}`
  }

  /** `$blk(null, 0, X, …)`: an `as` copy's entries (below every block). */
  private asEntries(d: TStructDecl): string {
    const block = this.model.blocks.find(b => b.target === d && b.rank === undefined)
    const data = block ? this.entriesData(block, this.model.asTarget(d)!) : ''
    return data ? `\n${this.util('$blk')}(null, 0, ${this.nameOf(d)}, ${data})` : ''
  }

  /**
   * The entries of block `b` as `$blk` data (`runtime/blocks.ts`): `[annotations, ...paths]`, a
   * type-level entry (the block's own annotations) first with an empty path. `reads`: the
   * declaration whose structure the paths walk (an `as` copy's target; else the block's target).
   * The statement needs what the paths go through built (`$f` guards, needs).
   */
  private entriesData(b: TStructBlock, reads: TStructDecl): string {
    const entries: string[] = []
    const annotationsOf = (node: SemanticNode) =>
      (node.annotations ?? []).map(an => {
        const { value, multiple } = this.computeAnnotationValue(node, an)
        return `[${str(an.name)}, ${value}${multiple ? ', 1' : ''}]`
      })
    if (b.rank && b.node.annotations?.length) {
      entries.push(`[[${annotationsOf(b.node).join(', ')}], []]`)
    }
    for (const en of b.entries) {
      if (en.error || en.paths.length === 0) {
        continue
      }
      // (an `as` copy walks its target's structure: the target's root def is not the copy's own)
      const copy = reads !== b.target
      const paths = en.paths.map(
        (p, i) => `[${stepsText(this.stepsData(reads, p, en.kinds[i], false, copy))}]`
      )
      entries.push(`[[${annotationsOf(en.ref).join(', ')}], ${paths.join(', ')}]`)
    }
    return entries.length > 0 ? `[\n  ${entries.join(',\n  ')},\n]` : ''
  }

  /**
   * The runtime `[step, kind]`s of model path `p` of `reads` (an `as` copy's: its target's
   * structure), and its needs: the classes it walks are built first (a shell def clones a built
   * def).
   */
  private stepsData(
    reads: TStructDecl,
    p: string[],
    kinds: Array<0 | 1 | 2>,
    /** `$sh` in `reads`' own statement: what it builds is not waited for, the rest is */
    building = false,
    /** the steps of an `as` copy of `reads` (its root def is `reads`', not its own) */
    copy = false
  ): Array<[string, number]> {
    const steps = this.runtimeSteps(reads, p, kinds, copy)
    if (steps.length > 0) {
      if (!building) {
        this.needStructure(reads)
      }
      for (let i = 1; i <= p.length; i++) {
        let slot = this.model.slotAt(reads, p.slice(0, i))
        // (a shell of its own: what it shells)
        while (slot?.owner?.unit === reads.id && slot.shell) {
          slot = slot.shell
        }
        if (slot?.owner && slot.owner.unit !== reads.id) {
          if (building) {
            // (a node of another class: built first; a shell node over it reads its def when
            // used — a reference —, but a clone below it (the next step, of kind 2) copies
            // that def: once final, `$ft`)
            const ref = this.nodeRef(slot.owner)
            if (kinds[i] === 2) {
              this.typed(ref)
            }
          } else {
            this.needUnit(slot.owner.unit)
          }
        }
        const at = this.model.defAt(reads, p.slice(0, i - 1))
        const def = at && unshell(at)
        if (def?.kind === 'merge' || def?.kind === 'umerge') {
          this.needs.add(def.key)
        } else if (def?.unit) {
          this.needUnit(def.unit)
        }
        if (building && kinds[i - 1] === 2 && def?.unit && def.unit !== reads.id) {
          // (a clone of another declaration's def: once that declaration's shells put into it)
          this.defRead(def)
        }
      }
      if (building) {
        // (a step of kind 2 clones the def of the node above it; a node of another class there —
        // a reference, or what `reads`' own shell is over: once that class's shells put into
        // it, `I0.next.|0` before `C0`'s shell `next.|0.k` clones it)
        steps.forEach(([, k], j) => {
          if (k === 2 && j > 0) {
            // (statement order only, not a runtime guard: the clone reads the def of the node
            // its shell is over, another position — `I1.next.next` with `next?: I0 & I1` is over
            // `I1.next`: once the shells put into that def)
            const [, ...others] = this.readsThrough(
              this.nameOf(reads),
              steps.slice(0, j).map(([s]) => s)
            )
            for (const [n, at] of others) {
              this.read(2, n, at, false)
            }
          }
          const read = k === 2 && j > 0 ? this.ownedRead(reads, steps.slice(0, j)) : undefined
          if (read) {
            this.read(2, this.nameOf(read[0]), read[1])
          }
        })
      }
      if (!building) {
        const name = this.nameOf(reads)
        this.read(
          0,
          name,
          steps.map(([s]) => s)
        )
        // (a step of kind 2 clones the def of the node above it: once every shell put into it ran
        // — `reads`' own, and another class's reached by reference: that class's read, see
        // `ownedRead`)
        steps.forEach(([, k], j) => {
          if (k !== 2) {
            return
          }
          this.read(
            2,
            name,
            steps.slice(0, j).map(([s]) => s)
          )
          const read = j > 0 ? this.ownedRead(reads, steps.slice(0, j)) : undefined
          if (read) {
            this.read(2, this.nameOf(read[0]), read[1])
          }
        })
      }
    }
    return steps
  }

  /**
   * `$sh(T, [path])` statements: every shell the build's blocks need in declaration `d` (a path
   * override is the referrer's own), one statement per path (each runs once what it shells is
   * built: a merge over one of T's shells and another shell of T through that merge do not wait
   * for each other).
   */
  private shellStatements(d: TStructDecl): void {
    const seen = new Set<string>()
    for (const b of this.model.blocks) {
      if (b.target !== d || !b.rank) {
        continue
      }
      for (const en of b.entries) {
        if (en.error) {
          continue
        }
        en.paths.forEach((path, i) => {
          // (one stage per step that shells: a stage waits only for what it clones)
          en.kinds[i].forEach((kind, j) => {
            const p = path.slice(0, j + 1)
            const kinds = en.kinds[i].slice(0, j + 1)
            const key = JSON.stringify([p, kinds])
            if (kind === 0 || seen.has(key)) {
              return
            }
            seen.add(key)
            this.shellStage(d, `sh:${d.id}:${seen.size}`, p, kinds)
          })
        })
      }
    }
  }

  /** One shell stage of `d` (see {@link shellStatements}). */
  private shellStage(d: TStructDecl, id: string, p: string[], kinds: Array<0 | 1 | 2>): void {
    this.statement(id, () => {
      const path = this.stepsData(d, p, kinds, true)
      const data = `[${stepsText(path)}]`
      const name = this.nameOf(d)
      this.shellPaths.set(id, { decl: d.id, name, data, path })
      return `${this.util('$sh')}(${name}, [${data}])`
    })
  }

  /** A cloning read (`$fc`, a guard) of the node holding own def `def` of a declaration. */
  private defRead(def: TStructDef): void {
    const owner = this.model.declById(def.unit!)
    const at = defPosition(def)
    if (!owner || at === undefined || at.includes('&')) {
      return
    }
    const steps = at === '' ? [] : at.split('.')
    this.needStructure(owner)
    this.read(2, this.nameOf(owner), this.runtimePath(owner, [], steps))
  }

  /** The shell statements of this module (see {@link shellStatements}), by statement id. */
  private readonly shellPaths = new Map<
    string,
    { decl: string; name: string; data: string; path: Array<[string, number]> }
  >()

  /**
   * The `sh:<id>` statements statement `st` needs: those whose shells change a node its `$f`
   * guards read (a node replaced on the way, or a def cloned below it — `changedBy` at runtime).
   */
  private shellNeeds(st: TStatement, cycle: boolean): string[] {
    const out = new Set<string>()
    // (an import cycle: the partner module may run this statement before its own shells, so
    // the runtime waits — `$ps` — on what the read reaches by reference too: printed guards)
    const reached: TRead[] = []
    const modes = [this.util('$f'), this.util('$ft'), this.util('$fc')]
    for (const { read, printed } of st.guards.values()) {
      // (a read of a class's node — not of another expression's, `$f(…).ref.type()` —: 0
      // plain, 1 typed, 2 cloned, the runtime's `changedBy`)
      if (!read || /[,()]/.test(read.name)) {
        continue
      }
      const typed = read.mode
      for (const [k, [name0, steps0]] of this.readsThrough(read.name, read.steps).entries()) {
        // (the runtime's `changedBy`: a stage at a prefix of the read — a node replaced on the
        // way —, or, for a typed / cloning read, one step below it that clones its def)
        const hits = this.stagesChanging(name0, steps0, typed)
        for (const id of hits) {
          if (id !== st.builds) {
            out.add(id)
          }
        }
        // (not one the statement's own stage changes: it would wait for itself)
        if (cycle && k > 0 && printed && !hits.includes(st.builds)) {
          reached.push({ mode: typed, name: name0, steps: steps0 })
        }
      }
    }
    for (const r of reached) {
      const text = `${modes[r.mode]}(${[r.name, ...r.steps.map(str)].join(', ')})`
      if (!st.guards.has(text)) {
        st.guards.set(text, { text, printed: true, read: r })
      }
    }
    return [...out]
  }

  /**
   * The shell stages of class `name` that change a read of `steps` (0 plain, 1 typed, 2 cloned:
   * the runtime's `changedBy`): a stage at a prefix of the read — a node replaced on the way —,
   * or, for a typed / cloning read, one step below it that clones its def; in build order.
   */
  private stagesChanging(name: string, steps: string[], typed: number): string[] {
    const idx = this.shellPathsOf(name)
    const hits: Array<[number, string]> = []
    for (let n = 1; n <= steps.length; n++) {
      hits.push(...(idx.at.get(pathKey(steps.slice(0, n))) ?? []))
    }
    for (const [seq, id, kind] of typed > 0 ? (idx.below.get(pathKey(steps)) ?? []) : []) {
      if (typed === 2 || kind === 2) {
        hits.push([seq, id])
      }
    }
    return hits.sort((a, b) => a[0] - b[0]).map(([, id]) => id)
  }

  /**
   * The node at runtime path `steps` of `reads` as a read of the class it belongs to, when that is
   * another class (a reference, or the node `reads`' own shell is over): `[class, its path]`.
   */
  private ownedRead(
    reads: TStructDecl,
    steps: Array<[string, number]>
  ): [TStructDecl, string[]] | undefined {
    const model = steps.filter(([s]) => s[0] !== '|').map(([s]) => s)
    for (let i = model.length; i >= 1; i--) {
      let slot = this.model.slotAt(reads, model.slice(0, i))
      // (a reference to a class — its def is the class's: the rest is a read of that class)
      const def = slot?.def
      const C =
        def?.kind === 'class' && def.unit !== reads.id ? this.model.declById(def.unit!) : undefined
      if (C && steps[steps.length - 1][0][0] !== '|') {
        let r = 0
        for (let seen = 0; r < steps.length && seen < i; r++) {
          if (steps[r][0][0] !== '|') {
            seen++
          }
        }
        return [C, steps.slice(r).map(([s]) => s)]
      }
      while (slot?.owner?.unit === reads.id && slot.shell) {
        slot = slot.shell
      }
      const o = slot?.owner
      if (!o || o.unit === reads.id || o.unit.startsWith('m:') || o.path.some(x => x[0] === '&')) {
        continue
      }
      const Y = this.model.declById(o.unit)
      if (!Y) {
        return undefined
      }
      // (the runtime steps after model step i: the union items the read takes there)
      let r = 0
      for (let seen = 0; r < steps.length && seen < i; r++) {
        if (steps[r][0][0] !== '|') {
          seen++
        }
      }
      return [Y, [...this.runtimePath(Y, [], o.path), ...steps.slice(r).map(([s]) => s)]]
    }
    return undefined
  }

  /**
   * A read of `steps` below class `name`, and the reads of the same nodes below the classes it
   * passes through by reference (`I1.next.work` with `next?: I1` reads `I1.work`): a shell of one
   * of those classes changes what the read reaches.
   */
  /**
   * The shell stages of class `name` (see {@link shellPaths}) by their path (`at`) and by the
   * path above their last step (`below`, with that step's kind), each with its build order;
   * indexed once they are all known.
   */
  private shellPathsOf(name: string): TShellIndex {
    if (!this.shellIndex) {
      this.shellIndex = new Map()
      let seq = 0
      for (const [id, { name: n, path: p }] of this.shellPaths) {
        let x = this.shellIndex.get(n)
        if (!x) {
          x = { at: new Map(), below: new Map() }
          this.shellIndex.set(n, x)
        }
        const names = p.map(([s]) => s)
        const at = pathKey(names)
        x.at.set(at, [...(x.at.get(at) ?? []), [seq, id]])
        const up = pathKey(names.slice(0, -1))
        x.below.set(up, [...(x.below.get(up) ?? []), [seq, id, p[p.length - 1][1]]])
        seq++
      }
    }
    return this.shellIndex.get(name) ?? { at: new Map(), below: new Map() }
  }

  private shellIndex?: Map<string, TShellIndex>
  private readonly readsMemo = new Map<string, Array<[string, string[]]>>()

  private readsThrough(name: string, steps: string[]): Array<[string, string[]]> {
    const mk = JSON.stringify([name, steps])
    const hit = this.readsMemo.get(mk)
    if (hit) {
      return hit
    }
    const out: Array<[string, string[]]> = []
    this.readsMemo.set(mk, out)
    const seen = new Set<string>()
    const visit = (X: TStructDecl | undefined, st: string[]) => {
      // (a bare alias is its target)
      while (X?.kind === 'type' && this.isBare(X)) {
        X = this.model.aliasStep(X)
      }
      if (!X) {
        return
      }
      const key = JSON.stringify([X.id, st])
      if (seen.has(key)) {
        return
      }
      seen.add(key)
      // (a class of another module — of an import cycle — is read under the name it is bound to
      // here; one not bound here is still read through, unnamed)
      const n = this.boundName(X)
      if (n) {
        out.push([n, st])
      }
      for (let i = 1; i <= st.length; i++) {
        const at = st.slice(0, i).filter(x => x[0] !== '|')
        let slot = this.model.slotAt(X, at)
        const def = slot?.def
        const Y = def?.kind === 'class' && def.unit ? this.model.declById(def.unit) : undefined
        // (a slot's — not the root's —, past the `X | null` items of the slot: the read is in Y)
        if (Y && at.length > 0 && st[i]?.[0] !== '|') {
          visit(Y, st.slice(i))
        }
        // (a node of another class — a reference to it, or what X's own shell is over)
        while (slot?.owner?.unit === X.id && slot.shell) {
          slot = slot.shell
        }
        const o = slot?.owner
        const other = o && (o.unit !== X.id || o.path.join('.') !== at.join('.'))
        const Z = other && !o.path.some(x => x[0] === '&') ? this.model.declById(o.unit) : undefined
        if (Z && o && st[i - 1][0] !== '|') {
          visit(Z, [...this.runtimePath(Z, [], o.path), ...st.slice(i)])
        }
      }
    }
    visit(this.declNamed(name), steps)
    return out
  }

  /** The declaration a class name of this module stands for (its own, or an imported one). */
  private declNamed(n: string): TStructDecl | undefined {
    const own = this.model.decls.find(
      d => d.doc === this.doc && this.nameOf(d) === n && !this.isBare(d)
    )
    if (own) {
      return own
    }
    const o = this.resolveOwner(this.doc, n)
    return o ? this.model.decls.find(d => d.doc === o.doc && d.node === o.node) : undefined
  }

  /** The name class `X` is bound to in this module, without adding an import (none: undefined). */
  private boundName(X: TStructDecl): string | undefined {
    if (X.doc === this.doc) {
      return this.nameOf(X)
    }
    return this.boundHere(X) && !this.unused.has(X.name) ? X.name : undefined
  }

  /** The module's blocks: `$blk($R, i, T, entries)`, `$R` = the module's static rank. */
  private blockStatements(): string | undefined {
    const blocks = this.model.blocks.filter(b => b.doc === this.doc && b.rank)
    if (blocks.length === 0) {
      return undefined
    }
    const R = this.allocAlias('$R', this.getSynthTaken())
    for (const b of blocks) {
      this.statement(`blk:${b.index}`, () => {
        const data = this.entriesData(b, b.target)
        if (!data) {
          return ''
        }
        this.needStructure(b.target)
        return `${this.util('$blk')}(${R}, ${b.index}, ${this.nameOf(b.target)}, ${data})`
      })
    }
    const rank = blocks[0].rank!
    return `const ${R} = [${rank.depth}, ${str(rank.id)}]`
  }

  /** The layer registries (`$ak`, `$nr`: how layers read those keys), before any statement. */
  private registries(): string[] {
    const { append, notReferred } = flagKeys(this.doc.config.annotations)
    const out: string[] = []
    if (append.length > 0) {
      out.push(`${this.util('$ak')}(${append.map(str).join(', ')})`)
    }
    if (notReferred.length > 0) {
      out.push(`${this.util('$nr')}(${notReferred.map(str).join(', ')})`)
    }
    return out
  }

  /**
   * The runtime steps of a model path: a `X | null` union the model passes through is a union
   * node at runtime (its non-null item: `|i`, own when the union's holder is, else shelled).
   */
  private runtimeSteps(
    d: TStructDecl,
    steps: string[],
    kinds: Array<0 | 1 | 2>,
    /** an `as` copy of `d` walks it: `d`'s root union is not the copy's own */
    copy = false
  ): Array<[string, number]> {
    const out: Array<[string, number]> = []
    // (an `as` copy has its target's structure: a nullable root too, never the copy's own)
    const rd = this.structureRoot(d)
    if (rd?.kind === 'type' && steps.length > 0) {
      // (a declaration that is a nullable union: its root is a union node — its own)
      const root = this.model.declExpr(rd)
      const own = !copy && rd === d && (root.k === 'nul' || root.k === 'and')
      this.nullItems(root).forEach((at, j) => out.push([`|${at}`, j === 0 && own ? 0 : 2]))
    }
    for (let i = 0; i < steps.length; i++) {
      out.push([steps[i], kinds[i]])
      const slot = this.model.slotAt(d, steps.slice(0, i + 1))
      const items =
        slot?.ends.length === 1
          ? this.nullItems(slot.ends[0])
          : slot?.contributors && this.model.nullableSlot(slot) && !this.model.nullSlot(slot)
            ? [0]
            : []
      if (i < steps.length - 1) {
        // (the union written at the node is its own def when the node is; an alias's union —
        // `p?: N` with `type N = X | null` — never is)
        const written = slot?.ends.length === 1 && slot.ends[0].k === 'nul'
        items.forEach((at, j) => out.push([`|${at}`, j === 0 && written && kinds[i] === 0 ? 0 : 2]))
      }
    }
    return out
  }

  // ── the module ──────────────────────────────────────────────────────────────────────────

  override post() {
    const decls = this.model.decls.filter(d => d.doc === this.doc)
    for (const d of decls) {
      if (this.isBare(d) && isExported(d)) {
        const local = this.nameOf(d)
        const line = `export { ${local} as ${d.name} }`
        this.aliasExports.push({ line, name: d.name, local })
      }
    }
    // (only aliases, chain refs and `as` copies replace their def: the rest build in place)
    for (const d of decls) {
      if (this.isReplacing(d)) {
        this.replacing.add(d.id)
      }
    }
    for (const d of decls) {
      if (!this.isBare(d)) {
        this.declStatement(d)
        if (this.compiles && (!this.compiledClasses || this.compiledClasses.has(d.name))) {
          this.compiledChecks.push(this.nameOf(d))
        }
      }
    }
    const rank = this.blockStatements()
    // (registries before any statement: layers read the keys by them)
    for (const line of this.registries()) {
      this.writeln(line)
    }
    if (rank) {
      this.writeln(rank)
    }
    // hidden classes and in-place merge operands: declared before any statement runs
    if (this.inPlaceText.length > 0) {
      this.writeln(`let ${this.inPlaceText.join(', ')}`)
    }
    for (const { name } of this.hidden.values()) {
      this.writeln(
        `class ${name} { static __is_atscript_annotated_type = true; static type = {}; static metadata = new Map() }`
      )
    }
    if (this.hidden.size > 0) {
      this.writeln()
    }
    const cycle = inCycle(this.doc)
    if (this.shellPaths.size > 0 || cycle) {
      for (const st of this.statements) {
        for (const n of this.shellNeeds(st, cycle)) {
          st.needs.add(n)
        }
      }
    }
    if (cycle) {
      // (another module of the cycle may read them before their shells: it waits, see `$f`)
      const byDecl = new Map<string, { name: string; datas: string[] }>()
      for (const { decl, name, data } of this.shellPaths.values()) {
        const x = byDecl.get(decl) ?? { name, datas: [] }
        x.datas.push(data)
        byDecl.set(decl, x)
      }
      for (const { name, datas } of byDecl.values()) {
        this.writeln(`${this.util('$ps')}(${name}, [\n  ${datas.join(',\n  ')},\n])`)
      }
    }
    const { statements, queued } = this.order()
    for (const { text, guards } of statements) {
      if (!text) {
        continue
      }
      if (cycle || queued) {
        this.writeln(`${this.util('$q')}(() => {`)
        for (const g of guards.values()) {
          if (g.printed) {
            this.writeln(`  ${g.text}`)
          }
        }
        this.writeln(`  ${this.indentText(stmt(text))}`)
        this.writeln('})')
      } else {
        this.writeln(stmt(text))
      }
      this.writeln()
    }
    for (const { line } of this.aliasExports) {
      this.writeln(line)
    }
    if (cycle || queued) {
      this.writeln(`${this.util('$end')}()`)
    }
    this.renderCompiledChecks()
    this.writeln('// prettier-ignore-end')
  }

  /**
   * The statements in an order where each runs after the statements building what it needs
   * (declaration order otherwise); those in a dependency cycle are queued (`$q`).
   */
  private order(): { statements: TStatement[]; queued: boolean } {
    const byBuild = new Map(this.statements.map(s => [s.builds, s]))
    const out: TStatement[] = []
    const state = new Map<TStatement, 'visiting' | 'done'>()
    let queued = false
    const visit = (s: TStatement) => {
      const st = state.get(s)
      if (st === 'done') {
        return
      }
      if (st === 'visiting') {
        queued = true
        return
      }
      state.set(s, 'visiting')
      for (const n of s.needs) {
        const dep = byBuild.get(n)
        if (dep && dep !== s) {
          visit(dep)
        }
      }
      state.set(s, 'done')
      out.push(s)
    }
    this.statements.forEach(visit)
    // (a dependency cycle: every statement waits in the queue until it can run)
    return { statements: out, queued }
  }
}

/** The phase-1 modules rendered at a documents' epoch (see {@link moduleOf}). */
const phase1 = { epoch: -1, modules: new Map<string, TRealmModule>() }

/** The phase-1 modules of the current documents' epoch (see {@link moduleOf}). */
function currentModules(): Map<string, TRealmModule> {
  if (phase1.epoch !== documentsEpoch()) {
    phase1.epoch = documentsEpoch()
    phase1.modules.clear()
  }
  return phase1.modules
}

/** The render options a phase-1 module depends on (see {@link moduleOf}). */
function moduleKey(opts: TTsPluginOptions | undefined, mode: TCompileValidatorsMode) {
  return JSON.stringify([
    resolveJsonSchemaMode(opts),
    !!opts?.exampleData,
    opts?.moduleExtension ?? '.as',
    mode,
  ])
}

/** `doc`'s phase-1 module (see `JsRenderer.renderModule`), rendered once per documents' epoch. */
function moduleOf(
  doc: AtscriptDoc,
  opts: TTsPluginOptions | undefined,
  mode: TCompileValidatorsMode
): TRealmModule {
  const cache = currentModules()
  const id = `${moduleKey(opts, mode)}\n${doc.id}`
  let module = cache.get(id)
  if (!module) {
    module = new JsNextRenderer(doc, opts, mode).renderModule()
    cache.set(id, module)
  }
  return module
}

/** The realm of `doc` for the render options (see `realm.ts`): the one `render` uses. */
export function moduleRealm(
  doc: AtscriptDoc,
  opts: TTsPluginOptions | undefined,
  mode: TCompileValidatorsMode
): Realm {
  return realmOf(doc, moduleKey(opts, mode), d => moduleOf(d, opts, mode))
}

/**
 * {@link generatedImports}, by document, with the epoch of the documents it was computed at
 * (valid while neither the document nor those it imports, directly or not, changed).
 */
const generatedImportsCache = new WeakMap<AtscriptDoc, { epoch: number; docs: AtscriptDoc[] }>()

/**
 * The documents whose generated modules the generated module of `doc` imports: those of the
 * imports whose names it uses, and those it adds (see `synthBinding`) — what it is evaluated
 * after (see {@link importCycle}). Computed by rendering it, again once it or a document it
 * imports (directly or not) changed (see `AtscriptDoc.changedSince`).
 */
function generatedImports(doc: AtscriptDoc): AtscriptDoc[] {
  let cached = generatedImportsCache.get(doc)
  if (!cached || doc.changedSince(cached.epoch)) {
    const renderer = new JsNextRenderer(doc, { jsonSchema: false }, 'none')
    renderer.render()
    cached = { epoch: documentsEpoch(), docs: [...renderer.importedDocs] }
    generatedImportsCache.set(doc, cached)
  }
  return cached.docs
}

/** {@link importCycle}, by document, with the epoch of the documents it was found at. */
const importCycles = new WeakMap<AtscriptDoc, { epoch: number; cycle: boolean }>()

/**
 * Whether `doc`'s generated module is on an import cycle of generated modules with mutating
 * annotates (see `findImportCycle`): `unplugin-atscript` keeps such a module's side effects (the
 * cycles of the generated modules' imports, which the structure model's import ranks do not see).
 */
export function importCycle(doc: AtscriptDoc): boolean {
  const known = importCycles.get(doc)
  if (known && !doc.changedSince(known.epoch)) {
    return known.cycle
  }
  // Found for all the modules of the cycle at once (each render of one of them asks).
  const found = new Map<AtscriptDoc, boolean>()
  const cycle = findImportCycle(doc, generatedImports, found)
  const epoch = documentsEpoch()
  for (const [d, c] of found) {
    importCycles.set(d, { epoch, cycle: c })
  }
  return cycle
}

// oxlint-disable max-lines
// oxlint-disable max-depth
import type {
  AtscriptDoc,
  SemanticAnnotateNode,
  SemanticArrayNode,
  SemanticConstNode,
  SemanticExprBinaryNode,
  SemanticExprCallNode,
  SemanticExprItemNode,
  SemanticExprNumberNode,
  SemanticExprUnaryNode,
  SemanticGroup,
  SemanticInterfaceNode,
  SemanticNode,
  SemanticPrimitiveNode,
  SemanticPropNode,
  SemanticQueryComparisonNode,
  SemanticQueryExprNode,
  SemanticQueryFieldRefNode,
  SemanticQueryNode,
  SemanticQueryValueListNode,
  SemanticQueryValueNode,
  SemanticRefNode,
  SemanticStructureNode,
  SemanticTypeNode,
  TAnnotationTokens,
  Token,
  TPrimitiveTypeDef,
} from '@atscript/core'
import {
  getRelPath,
  isArray,
  isBareId,
  isBareSpecifier,
  isDbEntityNode,
  isGroup,
  isInterface,
  isPrimitive,
  isProp,
  isQueryLogical,
  isRef,
  isStructure,
} from '@atscript/core'

import { type TTsPluginOptions, resolveJsonSchemaMode } from '../plugin'
import {
  defineAnnotatedType,
  type TAtscriptAnnotatedType,
  type TAnnotatedTypeHandle,
} from '../runtime/annotated-type'
import { buildJsonSchema } from '../runtime/json-schema'
import { BaseRenderer } from './base-renderer'
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

// Placeholder line in the header; `render()` replaces it with the synthesized imports, which are
// only complete after the body is rendered. Kept in the header (not emitted by `post()`) because
// the import position is part of the generated-file snapshots.
const SYNTH_IMPORTS_MARKER = '/*@@atscript-synth-imports@@*/'

interface TSynthRefInfo {
  alias: string
  ownerDoc: AtscriptDoc
  ownerNode?: SemanticNode
}

export class JsRenderer extends BaseRenderer {
  private postAnnotate = [] as SemanticNode[]
  private _adHocAnnotations: Map<string, TAnnotationTokens[]> | null = null
  private _propPath: string[] = []
  private typeIds = new Map<SemanticNode, string>()
  private _unusedJs?: Set<string>
  private _extendsRefs?: Map<SemanticRefNode, AtscriptDoc>
  private _refSynthInfo = new Map<SemanticRefNode, TSynthRefInfo>()
  private _synthImports = new Map<string, Array<{ name: string; alias: string }>>()
  private _synthComputed = false
  private _synthTaken?: Set<string>
  private _synthAllocated = new Map<string, TSynthRefInfo>()
  private _synthPathCache = new Map<AtscriptDoc, string | undefined>()
  private _ownerCache = new Map<string, ReturnType<AtscriptDoc['getDeclarationOwnerNode']>>()

  constructor(
    doc: AtscriptDoc,
    private opts?: TTsPluginOptions
  ) {
    super(doc)
  }

  /**
   * Relative imports get the configured `moduleExtension`; bare specifiers
   * always keep `.as` — they resolve through the package's `exports` map.
   */
  override transformFromPath(path: string): string {
    return isBareSpecifier(path) ? `${path}.as` : `${path}${this.opts?.moduleExtension ?? '.as'}`
  }

  /**
   * Override base `unused` to subtract symbols that the JS output references
   * transitively through `extends`-resolved parent prop trees. Without this,
   * cross-file `extends` strips the imports needed by inherited `.refTo()` calls.
   */
  protected override get unused(): Set<string> {
    if (this._unusedJs) {
      return this._unusedJs
    }
    const base = new Set(this.doc.getUnusedTokens().map(t => t.text))
    for (const ref of this.getExtendsRefs().keys()) {
      if (ref.id) {
        base.delete(ref.id)
      }
    }
    return (this._unusedJs = base)
  }

  // Cached: walked twice (the `unused`-set override and the synth pre-pass).
  private getExtendsRefs(): Map<SemanticRefNode, AtscriptDoc> {
    if (this._extendsRefs) {
      return this._extendsRefs
    }
    const out = new Map<SemanticRefNode, AtscriptDoc>()
    const visitedInterfaces = new Set<SemanticInterfaceNode>()
    for (const node of this.doc.nodes) {
      if (isInterface(node) && node.hasExtends) {
        this.walkExtendsParents(node, this.doc, out, visitedInterfaces)
      }
    }
    return (this._extendsRefs = out)
  }

  private walkRefs(
    node: SemanticNode | undefined,
    visited: Set<SemanticNode>,
    visit: (ref: SemanticRefNode) => void
  ): void {
    if (!node || visited.has(node)) {
      return
    }
    visited.add(node)
    if (isRef(node)) {
      visit(node)
      return
    }
    if (isGroup(node)) {
      for (const item of node.unwrap()) {
        this.walkRefs(item, visited, visit)
      }
      return
    }
    if (isArray(node) || isProp(node)) {
      this.walkRefs(node.getDefinition(), visited, visit)
    }
  }

  private walkExtendsParents(
    iface: SemanticInterfaceNode,
    doc: AtscriptDoc,
    out: Map<SemanticRefNode, AtscriptDoc>,
    visited: Set<SemanticInterfaceNode>
  ): void {
    if (visited.has(iface)) {
      return
    }
    visited.add(iface)
    const visitedNodes = new Set<SemanticNode>()
    for (const token of iface.extendsTokens) {
      const unwound = doc.unwindType(token.text)
      if (!unwound?.def || !isInterface(unwound.def)) {
        continue
      }
      const parentInterface = unwound.def
      const parentDoc = unwound.doc
      this.walkRefs(parentInterface.getDefinition(), visitedNodes, ref => {
        if (!out.has(ref)) {
          out.set(ref, parentDoc)
        }
      })
      if (parentInterface.hasExtends) {
        this.walkExtendsParents(parentInterface, parentDoc, out, visited)
      }
    }
  }

  // Pre-pass: for each ref reachable through an `extends` parent prop tree,
  // assign a JS-side binding (alias) so rendered `.refTo()` calls resolve even
  // when the user didn't manually import the helper. Name clashes get suffixed
  // `_1`, `_2`, … against locals, existing imports, and earlier synth aliases.
  private computeSynthesizedImports() {
    if (this._synthComputed) {
      return
    }
    this._synthComputed = true

    const refToOriginDoc = this.getExtendsRefs()
    if (refToOriginDoc.size === 0) {
      return
    }

    for (const [refNode, originDoc] of refToOriginDoc) {
      const refId = refNode.id
      if (!refId) {
        continue
      }
      const ownerInfo = this.resolveOwner(originDoc, refId)
      if (!ownerInfo?.doc || ownerInfo.doc === this.doc) {
        continue
      }
      if (ownerInfo.node && isPrimitive(ownerInfo.node)) {
        continue
      }
      const info = this.synthBinding(refId, ownerInfo)
      if (!info) {
        continue
      }
      this._refSynthInfo.set(refNode, info)
    }
  }

  // Names already bound in this file (locals, user imports, earlier synth aliases).
  private getSynthTaken(): Set<string> {
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
  private synthBinding(
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
    if (!origin || origin === this.doc) {
      return typeName
    }
    const theirs = this.resolveOwner(origin, typeName)
    if (!theirs?.doc || !theirs.node || theirs.doc === this.doc || isPrimitive(theirs.node)) {
      return typeName
    }
    const mine = this.resolveOwner(this.doc, typeName)
    if (mine?.doc === theirs.doc && mine.node === theirs.node) {
      return typeName
    }
    return this.synthBinding(typeName, { doc: theirs.doc, node: theirs.node })?.alias ?? typeName
  }

  // Memoize `getDeclarationOwnerNode` across the synth pre-pass and the
  // per-ref `.refTo()` emit site (each ref otherwise resolves the owner twice).
  private resolveOwner(
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
    if (existing?.text === synthPath) {
      return { alias: refId, ownerDoc, ownerNode }
    }
    const alias = this.allocAlias(refId, taken)
    let group = this._synthImports.get(synthPath)
    if (!group) {
      group = []
      this._synthImports.set(synthPath, group)
    }
    group.push({ name: refId, alias })
    return { alias, ownerDoc, ownerNode }
  }

  private allocAlias(name: string, taken: Set<string>): string {
    if (!taken.has(name)) {
      taken.add(name)
      return name
    }
    let n = 1
    while (taken.has(`${name}_${n}`)) {
      n++
    }
    const alias = `${name}_${n}`
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

  pre() {
    this.writeln('// prettier-ignore-start')
    this.writeln('/* eslint-disable */')
    this.writeln('/* oxlint-disable */')

    // Pre-scan nodes: detect name collisions for typeIds and check for mutating annotate
    let hasMutatingAnnotate = false
    const nodesByName = new Map<string, SemanticNode[]>()
    for (const node of this.doc.nodes) {
      if (node.entity === 'annotate' && (node as SemanticAnnotateNode).isMutating) {
        hasMutatingAnnotate = true
      }
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

    const imports = ['defineAnnotatedType as $', 'annotate as $a']
    if (hasMutatingAnnotate) {
      imports.push('cloneRefProp as $c')
    }
    const jsonSchemaMode = resolveJsonSchemaMode(this.opts)
    if (jsonSchemaMode === 'lazy') {
      imports.push('buildJsonSchema as $$')
    }
    if (this.opts?.exampleData) {
      imports.push('createDataFromAnnotatedType as $e')
    }
    if (jsonSchemaMode === false) {
      imports.push('throwFeatureDisabled as $d')
    }
    this.writeln(`import { ${imports.join(', ')} } from "@atscript/typescript/utils"`)

    // Synthesized imports for symbols only reachable through `extends` parent prop trees.
    this.computeSynthesizedImports()
    this.writeln(SYNTH_IMPORTS_MARKER)
  }

  override render(): string {
    const out = super.render()
    const lines: string[] = []
    for (const [synthPath, names] of this._synthImports) {
      const list = names
        .map(n => (n.alias === n.name ? n.name : `${n.name} as ${n.alias}`))
        .join(', ')
      lines.push(`import { ${list} } from "${this.transformFromPath(synthPath)}"`)
    }
    const marker = `${SYNTH_IMPORTS_MARKER}\n`
    return out.replace(marker, () => (lines.length > 0 ? `${lines.join('\n')}\n` : ''))
  }

  private buildAdHocMap(annotateNodes: SemanticAnnotateNode[]) {
    const map = new Map<string, TAnnotationTokens[]>()
    for (const annotateNode of annotateNodes) {
      for (const entry of annotateNode.entries) {
        const path = entry.hasChain
          ? [entry.id!, ...entry.chain.map(c => c.text)].join('.')
          : entry.id!
        const anns = entry.annotations || []
        if (anns.length > 0) {
          const existing = map.get(path)
          if (existing) {
            existing.push(...anns)
          } else {
            map.set(path, [...anns])
          }
        }
      }
    }
    return map.size > 0 ? map : null
  }

  /**
   * Checks if any ad-hoc annotation path extends beyond the current _propPath,
   * meaning annotations target properties inside a referenced type.
   */
  private hasAdHocAnnotationsThroughRef(): boolean {
    if (!this._adHocAnnotations || this._propPath.length === 0) {
      return false
    }
    const prefix = `${this._propPath.join('.')}.`
    for (const key of this._adHocAnnotations.keys()) {
      if (key.startsWith(prefix)) {
        return true
      }
    }
    return false
  }

  post() {
    for (const node of this.postAnnotate) {
      if (node.entity === 'annotate') {
        const annotateNode = node as SemanticAnnotateNode
        if (annotateNode.isMutating) {
          this.renderMutatingAnnotateNode(annotateNode)
        } else {
          const unwound = this.doc.unwindType(annotateNode.targetName)
          if (unwound?.def) {
            let def = this.doc.mergeIntersection(unwound.def)
            if (isInterface(def)) {
              if ((def as SemanticInterfaceNode).hasExtends) {
                const resolved = unwound.doc.resolveInterfaceExtends(def as SemanticInterfaceNode)
                def = resolved || def.getDefinition() || def
              } else {
                def = def.getDefinition() || def
              }
            }
            this._adHocAnnotations = this.buildAdHocMap([annotateNode])
            this.annotateType(def, node.id)
            this._adHocAnnotations = null
            this.indent()
            this.defineMetadataForAnnotateAlias(annotateNode)
            this.unindent()
            this.writeln()
          }
        }
      } else {
        // For interface/type nodes, inline definition uses only original annotations.
        let def = node.getDefinition()
        if (isInterface(node) && (node as SemanticInterfaceNode).hasExtends) {
          const resolved = this.doc.resolveInterfaceExtends(node as SemanticInterfaceNode)
          if (resolved) {
            def = resolved
          }
        }
        this.annotateType(def, node.id)
        this.indent().defineMetadata(node).unindent()
        this.writeln()
      }
    }
    this.writeln('// prettier-ignore-end')
    super.post()
  }

  private renderClassStatics(node: SemanticNode) {
    this.writeln('static __is_atscript_annotated_type = true')
    this.writeln('static type = {}')
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
    if (node.isMutating) {
      this.postAnnotate.push(node)
      return
    }
    if (!this.doc.unwindType(node.targetName)?.def) {
      return
    }
    this.renderDefinitionClass(node)
  }

  private renderDefinitionClass(node: SemanticNode) {
    this.writeln()
    const exported = node.token('export')?.text === 'export'
    this.write(exported ? 'export ' : '')
    this.write(`class ${node.id!} `)
    this.blockln('{}')
    this.renderClassStatics(node)
    this.popln()
    this.postAnnotate.push(node)
    this.writeln()
  }

  private renderJsonSchemaMethod(node: SemanticNode) {
    const mode = resolveJsonSchemaMode(this.opts)
    const hasAnnotation = node.countAnnotations('emit.jsonSchema') > 0

    if (hasAnnotation || mode === 'bundle') {
      const schema = JSON.stringify(buildJsonSchema(this.toAnnotatedType(node)))
      this.writeln('static toJsonSchema() {')
      this.indent().writeln(`return ${schema}`).unindent()
      this.writeln('}')
    } else if (mode === 'lazy') {
      this.writeln('static toJsonSchema() {')
      this.indent().writeln('return this._jsonSchema ?? (this._jsonSchema = $$(this))').unindent()
      this.writeln('}')
    } else {
      this.writeln('static toJsonSchema() {')
      this.indent().writeln('$d("JSON Schema", "jsonSchema", "emit.jsonSchema")').unindent()
      this.writeln('}')
    }
  }

  private renderExampleDataMethod(_node: SemanticNode) {
    if (this.opts?.exampleData) {
      this.writeln('static toExampleData() {')
      this.indent().writeln('return $e(this, { mode: "example" })').unindent()
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
    if (interfaceNode.hasExtends) {
      struct = this.doc.resolveInterfaceExtends(interfaceNode)
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
      if (prop.countAnnotations('db.column.dimension') > 0) {
        dims.push(name)
      }
      if (prop.countAnnotations('db.column.measure') > 0) {
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

  private toAnnotatedType(node?: SemanticNode): TAtscriptAnnotatedType {
    return this.toAnnotatedHandle(node).$type
  }

  private toAnnotatedHandle(node?: SemanticNode, skipAnnotations = false): TAnnotatedTypeHandle {
    if (!node) {
      return defineAnnotatedType()
    }

    switch (node.entity) {
      case 'interface':
      case 'type': {
        let def = (node as SemanticInterfaceNode | SemanticTypeNode).getDefinition()
        if (isInterface(node) && (node as SemanticInterfaceNode).hasExtends) {
          const resolved = this.doc.resolveInterfaceExtends(node as SemanticInterfaceNode)
          if (resolved) {
            def = resolved
          }
        }
        const handle = this.toAnnotatedHandle(def, true)
        // Assign id for $defs/$ref support in buildJsonSchema (bundle mode)
        const typeId =
          this.typeIds.get(node) ??
          (node.__typeId !== null && node.__typeId !== undefined ? node.id : undefined)
        if (typeId) {
          handle.id(typeId)
        }
        return skipAnnotations
          ? handle
          : this.applyExpectAnnotations(handle, this.doc.evalAnnotationsForNode(node))
      }
      case 'prop': {
        const prop = node as SemanticPropNode
        const def = prop.getDefinition()
        const handle = this.toAnnotatedHandle(def, true)
        if (!skipAnnotations) {
          this.applyExpectAnnotations(handle, this.doc.evalAnnotationsForNode(prop))
          if (prop.token('optional')) {
            handle.optional()
          }
        }
        return handle
      }
      case 'ref': {
        const ref = node as SemanticRefNode
        const decl = this.doc.unwindType(ref.id!, ref.chain)?.def
        const handle = this.toAnnotatedHandle(decl!, true)
        if (skipAnnotations) {
          return handle
        }
        // Same as the emitted type (annotateType + defineInlinePrimitiveMetadata): a member /
        // element ref carries the annotations of what it references — a built-in
        // primitive's own, or a named alias's.
        const own = this.doc.evalAnnotationsForNode(node)
        const referred = this.refTargetAnnotations(ref, decl)
        return this.applyExpectAnnotations(
          handle,
          referred ? this.doc.mergeNodesAnnotations(referred, own) : own
        )
      }
      case 'primitive': {
        const prim = node as SemanticPrimitiveNode
        const handle = defineAnnotatedType()
        handle.designType(prim.id! === 'never' ? 'never' : (prim.config.type as 'string'))
        if (!skipAnnotations) {
          this.applyExpectAnnotations(handle, this.doc.evalAnnotationsForNode(node))
        }
        return handle
      }
      case 'const': {
        const c = node as SemanticConstNode
        const handle = defineAnnotatedType()
        const t = c.token('identifier')?.type
        handle.designType(t === 'number' ? 'number' : 'string')
        handle.value(t === 'number' ? Number(c.id!) : c.id!)
        return skipAnnotations
          ? handle
          : this.applyExpectAnnotations(handle, this.doc.evalAnnotationsForNode(node))
      }
      case 'structure': {
        const struct = node as SemanticStructureNode
        const handle = defineAnnotatedType('object')
        for (const prop of Array.from(struct.props.values()) as SemanticPropNode[]) {
          const propHandle = this.toAnnotatedHandle(prop)
          const pattern = prop.token('identifier')?.pattern
          if (pattern) {
            handle.propPattern(pattern, propHandle.$type)
          } else {
            handle.prop(prop.id!, propHandle.$type)
          }
        }
        return skipAnnotations
          ? handle
          : this.applyExpectAnnotations(handle, this.doc.evalAnnotationsForNode(node))
      }
      case 'group': {
        const group = node as SemanticGroup
        const kind = group.op === '|' ? 'union' : 'intersection'
        const handle = defineAnnotatedType(kind as any)
        for (const item of group.unwrap()) {
          handle.item(this.toAnnotatedHandle(item).$type)
        }
        return skipAnnotations
          ? handle
          : this.applyExpectAnnotations(handle, this.doc.evalAnnotationsForNode(node))
      }
      case 'tuple': {
        const group = node as SemanticGroup
        const handle = defineAnnotatedType('tuple')
        for (const item of group.unwrap()) {
          handle.item(this.toAnnotatedHandle(item).$type)
        }
        return skipAnnotations
          ? handle
          : this.applyExpectAnnotations(handle, this.doc.evalAnnotationsForNode(node))
      }
      case 'array': {
        const arr = node as SemanticArrayNode
        const handle = defineAnnotatedType('array')
        handle.of(this.toAnnotatedHandle(arr.getDefinition()).$type)
        return skipAnnotations
          ? handle
          : this.applyExpectAnnotations(handle, this.doc.evalAnnotationsForNode(node))
      }
      default: {
        const handle = defineAnnotatedType()
        return skipAnnotations
          ? handle
          : this.applyExpectAnnotations(handle, this.doc.evalAnnotationsForNode(node))
      }
    }
  }

  private applyExpectAnnotations(
    handle: TAnnotatedTypeHandle,
    annotations?: TAnnotationTokens[]
  ): TAnnotatedTypeHandle {
    annotations?.forEach(a => {
      switch (a.name) {
        case 'expect.minLength':
        case 'expect.maxLength': {
          if (a.args[0]) {
            handle.annotate(a.name as any, {
              length: Number(a.args[0].text),
              message: a.args[1]?.text,
            })
          }
          break
        }
        case 'expect.min': {
          if (a.args[0]) {
            handle.annotate(a.name as any, {
              minValue: Number(a.args[0].text),
              message: a.args[1]?.text,
            })
          }
          break
        }
        case 'expect.max': {
          if (a.args[0]) {
            handle.annotate(a.name as any, {
              maxValue: Number(a.args[0].text),
              message: a.args[1]?.text,
            })
          }
          break
        }
        case 'expect.pattern': {
          handle.annotate(
            a.name as any,
            {
              pattern: a.args[0]?.text || '',
              flags: a.args[1]?.text,
              message: a.args[2]?.text,
            },
            true
          )
          break
        }
        case 'expect.int':
        case 'meta.required': {
          handle.annotate(a.name as any, true)
          break
        }
        case 'expect.array.uniqueItems':
        case 'expect.array.key': {
          handle.annotate(a.name as any, { message: a.args[0]?.text })
          break
        }
        default:
      }
    })
    return handle
  }

  annotateType(_node?: SemanticNode, name?: string) {
    if (!_node) {
      return this
    }
    const node = this.doc.mergeIntersection(_node)

    let kind = node.entity as string
    switch (node.entity) {
      case 'ref': {
        const ref = node as SemanticRefNode
        const decl = this.doc.unwindType(ref.id!, ref.chain)?.def
        const primitive = this.inlinedPrimitive(ref, decl)
        if (primitive) {
          this.annotateType(primitive, name)
          return this
        }
        // When ad-hoc annotations target paths through this ref,
        // inline the referenced type so _propPath can traverse it
        if (this._adHocAnnotations && this.hasAdHocAnnotationsThroughRef()) {
          let resolved = decl ? this.doc.mergeIntersection(decl) : undefined
          if (resolved && isInterface(resolved)) {
            resolved = resolved.getDefinition() || resolved
          }
          if (resolved) {
            this.annotateType(resolved, name)
            return this
          }
        }
        // must be something imported or defined locally
        const chain = ref.hasChain
          ? `, [${ref.chain.map(c => `"${escapeQuotes(c.text)}"`).join(', ')}]`
          : ''
        // Always use lazy ref for imported types to avoid circular import/bundle TDZ issues.
        // Local types use eager ref since they're always defined before use in the same file.
        // Synth pre-pass binding (if any) wins over child-doc lookup, which would otherwise
        // resolve to a clashing local definition.
        const synth = this._refSynthInfo.get(ref)
        const ownerDecl = synth
          ? { doc: synth.ownerDoc, node: synth.ownerNode }
          : this.resolveOwner(this.doc, ref.id!)
        const refName = synth?.alias ?? ref.id!
        const isImported = !!synth || (ownerDecl ? ownerDecl.doc !== this.doc : false)
        const refExpr = isImported ? `() => ${refName}` : refName
        this.writeln(`$(${name ? `"", ${name}` : ''})`)
          .indent()
          .writeln(`.refTo(${refExpr}${chain})`)
        // Emit the referenced type's annotations at build time so that
        // metadata is available regardless of declaration order.
        if (!ref.hasChain) {
          if (ownerDecl?.node) {
            const typeAnnotations = ownerDecl.doc.filterPassedWhenReferred(
              ownerDecl.doc.evalAnnotationsForNode(ownerDecl.node)
            )
            typeAnnotations?.forEach((an: TAnnotationTokens) => {
              this.resolveAnnotationValue(ownerDecl.node!, an)
            })
          }
        }
        this.unindent()
        return this
      }
      case 'primitive': {
        this.definePrimitive(node as SemanticPrimitiveNode, name)
        return this
      }
      case 'const': {
        this.writeln(`$(${name ? `"", ${name}` : ''})`)
          .indent()
          .defineConst(node as SemanticConstNode)
          .unindent()
        return this
      }
      case 'structure': {
        this.writeln(`$("object"${name ? `, ${name}` : ''})`)
          .indent()
          .defineObject(node as SemanticStructureNode)
          .unindent()
        return this
      }
      case 'group': {
        kind = (node as SemanticGroup).op! === '|' ? 'union' : 'intersection'
        this.writeln(`$("${kind}"${name ? `, ${name}` : ''})`)
          .indent()
          .defineGroup(node as SemanticGroup)
          .unindent()
        return this
      }
      case 'tuple': {
        this.writeln(`$("tuple"${name ? `, ${name}` : ''})`)
          .indent()
          .defineGroup(node as SemanticGroup)
          .unindent()
        return this
      }
      case 'array': {
        this.writeln(`$("array"${name ? `, ${name}` : ''})`)
          .indent()
          .defineArray(node as SemanticArrayNode)
          .unindent()
        return this
      }
      default: {
        return this
      }
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

  renderPrimitiveDef(def?: TPrimitiveTypeDef | 'never', name?: string) {
    const d = (t?: string) => [`"${t || ''}"`, name].filter(Boolean).join(', ').replace(/^""$/, '')
    if (!def) {
      return this.writeln(`$(${d()}).designType("any")`)
    }
    // If it's a direct final type, return it
    if (typeof def === 'string') {
      return this.writeln(`$(${d()}).designType("${def === 'void' ? 'undefined' : def}")`)
    }

    switch (def.kind) {
      case 'final': {
        return this.writeln(
          `$(${d()}).designType("${def.value === 'void' ? 'undefined' : def.value}")`
        )
      }
      case 'union':
      case 'intersection':
      case 'tuple': {
        this.writeln(`$(${d(def.kind)})`)
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
        this.writeln(`$(${d('array')})`)
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
        this.writeln(`$(${d('object')})`)
        this.indent()
        for (const [key, propDef] of Object.entries(def.props)) {
          const optional = typeof propDef === 'object' && propDef.optional
          this.writeln(`.prop(`)
          this.indent()
          this.writeln(`"${escapeQuotes(key)}",`)
          this.renderPrimitiveDef(propDef)
          if (optional) {
            this.writeln('.optional()')
          }
          this.writeln('.$type')
          this.unindent()
          this.write(`)`)
        }
        for (const [key, propDef] of Object.entries(def.propsPatterns)) {
          const optional = typeof propDef === 'object' && propDef.optional
          this.writeln(`.propPattern(`)
          this.indent()
          this.writeln(`${key},`)
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
        return this.writeln(`$(${d()}).designType("any")`)
      }
    }
  }

  defineObject(node: SemanticStructureNode) {
    const props = Array.from(node.props.values())
    for (const prop of props) {
      const pattern = prop.token('identifier')?.pattern
      const optional = !!prop.token('optional')
      this._propPath.push(prop.id!)
      if (pattern) {
        this.writeln(`.propPattern(`)
        this.indent()
        this.writeln(`/${pattern.source}/${pattern.flags},`)
      } else {
        this.writeln(`.prop(`)
        this.indent()
        this.writeln(`"${escapeQuotes(prop.id!)}",`)
      }
      this.annotateType(prop.getDefinition())
      this.indent().defineMetadata(prop).unindent()
      if (optional) {
        this.writeln('  .optional()')
      }
      this.writeln('  .$type')
      this.unindent()
      this.write(`)`)
      this._propPath.pop()
    }
    this.writeln()
    return this
  }
  defineGroup(node: SemanticGroup) {
    const items = node.unwrap()
    for (const item of items) {
      this.write('.item(')
        .indent()
        .annotateType(item)
        .defineInlinePrimitiveMetadata(item)
        .write('  .$type')
        .writeln(`)`)
        .unindent()
    }
    return this
  }
  defineArray(node: SemanticArrayNode) {
    const of = node.getDefinition()
    this.write('.of(')
      .indent()
      .annotateType(of)
      .defineInlinePrimitiveMetadata(of)
      .write('  .$type')
      .writeln(`)`)
      .unindent()
    return this
  }

  /**
   * A built-in primitive extension used directly as a union / tuple member or array
   * element (`number.int | null`, `string.email[]`) is inlined by `annotateType` without
   * its built-in annotations (`expect.int`, the email pattern, …) — a prop gets them
   * through `defineMetadata`, a member has no prop to carry them, so emit them here.
   */
  private defineInlinePrimitiveMetadata(node?: SemanticNode) {
    const primitive = node && this.inlinedPrimitive(node)
    if (primitive?.annotations?.length) {
      this.indent()
      for (const an of primitive.annotations) {
        this.resolveAnnotationValue(primitive, an)
      }
      this.unindent()
    }
    return this
  }

  /**
   * The built-in primitive a ref is inlined as by `annotateType` — not a named alias that
   * resolves to one (`type MyString = string`), which is emitted as a `refTo`.
   */
  private inlinedPrimitive(
    node: SemanticNode,
    decl = isRef(node) ? this.doc.unwindType(node.id!, node.chain)?.def : undefined
  ): SemanticPrimitiveNode | undefined {
    if (!isRef(node) || !isPrimitive(decl)) {
      return undefined
    }
    const ownerDecl = this.resolveOwner(this.doc, node.id!)
    if (
      ownerDecl?.node &&
      (ownerDecl.node.entity === 'type' || ownerDecl.node.entity === 'interface')
    ) {
      return undefined
    }
    return decl
  }

  /** Annotations a ref inherits from its target (see `annotateType`'s ref case). */
  private refTargetAnnotations(
    ref: SemanticRefNode,
    decl: SemanticNode | undefined
  ): TAnnotationTokens[] | undefined {
    const primitive = this.inlinedPrimitive(ref, decl)
    if (primitive) {
      return primitive.annotations
    }
    if (ref.hasChain) {
      return undefined
    }
    const ownerDecl = this.resolveOwner(this.doc, ref.id!)
    return ownerDecl?.node
      ? ownerDecl.doc.filterPassedWhenReferred(ownerDecl.doc.evalAnnotationsForNode(ownerDecl.node))
      : undefined
  }

  defineMetadata(node: SemanticNode) {
    // When the node's definition is a non-primitive ref, use only the node's
    // own annotations. The referenced type's annotations are emitted at build
    // time by annotateType, so using evalAnnotationsForNode here would duplicate them.
    let annotations: TAnnotationTokens[] | undefined
    const nodeDef = node.getDefinition?.()
    if (nodeDef && isRef(nodeDef)) {
      const refNode = nodeDef as SemanticRefNode
      // Only skip evalAnnotationsForNode for simple refs (no chain).
      // Chain refs still use evalAnnotationsForNode since annotateType
      // only emits build-time annotations for simple refs.
      if (!refNode.hasChain) {
        const resolved = this.doc.unwindType(refNode.id!, refNode.chain)?.def
        if (resolved && !isPrimitive(resolved)) {
          annotations = node.annotations ?? []
        } else if (resolved && isPrimitive(resolved)) {
          // Also use own annotations when the ref targets a named type alias
          // that resolves to a primitive — annotateType emits refTo + type-level
          // annotations for these, so evalAnnotationsForNode would duplicate them.
          const ownerDecl = this.doc.getDeclarationOwnerNode(refNode.id!)
          if (
            ownerDecl?.node &&
            (ownerDecl.node.entity === 'type' || ownerDecl.node.entity === 'interface')
          ) {
            annotations = node.annotations ?? []
          }
        }
      }
    }
    if (annotations === undefined) {
      annotations = this.doc.evalAnnotationsForNode(node)
    }
    // Merge ad-hoc annotations (from annotate blocks) with original annotations
    if (this._adHocAnnotations && this._propPath.length > 0) {
      const path = this._propPath.join('.')
      const adHoc = this._adHocAnnotations.get(path)
      if (adHoc) {
        annotations = this.doc.mergeNodesAnnotations(annotations, adHoc)
      }
    }
    annotations?.forEach((an: TAnnotationTokens) => {
      this.resolveAnnotationValue(node, an)
    })
    return this
  }

  /**
   * For non-mutating annotate aliases: merge the target's type-level annotations
   * with the annotate block's own annotations (annotate's take priority).
   */
  defineMetadataForAnnotateAlias(annotateNode: SemanticAnnotateNode) {
    const annotateAnnotations = this.doc.evalAnnotationsForNode(annotateNode)
    const targetDecl = this.doc.getDeclarationOwnerNode(annotateNode.targetName)
    const targetAnnotations = targetDecl?.node
      ? targetDecl.doc.evalAnnotationsForNode(targetDecl.node)
      : undefined
    const merged = this.doc.mergeNodesAnnotations(targetAnnotations, annotateAnnotations)
    merged.forEach((an: TAnnotationTokens) => {
      this.resolveAnnotationValue(annotateNode, an)
    })
    return this
  }

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
    origin: AtscriptDoc | undefined
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
    return aSpec.type === 'string' ? `"${escapeQuotes(argToken.text)}"` : argToken.text
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

  private computeAnnotationValue(
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
              targetValue += `${wrapProp(aSpec.name)}: ${this.emitArgValue(aSpec, an.args[i], origin)}${i === length - 1 ? '' : ', '} `
            }
            i++
          }
          targetValue += '}'
        } else {
          const aSpec = spec.arguments[0]
          targetValue = an.args[0] ? this.emitArgValue(aSpec, an.args[0], origin) : 'true'
        }
      }
    } else {
      multiple = node.countAnnotations(an.name) > 1 || an.args.length > 1
      if (an.args.length > 0) {
        targetValue =
          an.args[0].type === 'text' ? `"${escapeQuotes(an.args[0].text)}"` : an.args[0].text
      }
    }
    return { value: targetValue, multiple: !!multiple }
  }

  private renderMutatingAnnotateNode(node: SemanticAnnotateNode) {
    const targetName = node.targetName
    const targetDef = this.resolveTargetDef(targetName)
    this.writeln('// Ad-hoc annotations for ', targetName)

    // First pass: collect all accessor paths and clone operations
    const allClones: Array<{ parentPath: string; propName: string }> = []
    const entryAccessors: Array<{
      entry: SemanticAnnotateNode['entries'][number]
      accessors: string[]
    }> = []

    for (const entry of node.entries) {
      const anns = entry.annotations
      if (!anns || anns.length === 0) {
        continue
      }
      const parts = entry.hasChain ? [entry.id!, ...entry.chain.map(c => c.text)] : [entry.id!]
      const { accessors, clones } = this.buildMutatingAccessors(targetName, targetDef, parts)
      allClones.push(...clones)
      entryAccessors.push({ entry, accessors })
    }

    // Emit deduplicated clone operations (shallowest first, already in order)
    const cloneKeys = new Set<string>()
    for (const clone of allClones) {
      const key = `${clone.parentPath}|${clone.propName}`
      if (!cloneKeys.has(key)) {
        cloneKeys.add(key)
        this.writeln(`$c(${clone.parentPath}, "${escapeQuotes(clone.propName)}")`)
      }
    }

    // Emit mutation statements
    for (const { entry, accessors } of entryAccessors) {
      for (const accessor of accessors) {
        this.emitMutatingAnnotations(entry, entry.annotations!, accessor)
      }
    }
    // Top-level annotations on the annotate block mutate the target's metadata
    const topAnnotations = node.annotations
    if (topAnnotations && topAnnotations.length > 0) {
      this.emitMutatingAnnotations(node, topAnnotations, targetName)
    }

    this.writeln()
  }

  private emitMutatingAnnotations(
    node: SemanticNode,
    annotations: TAnnotationTokens[],
    accessor: string
  ) {
    const cleared = new Set<string>()
    for (const an of annotations) {
      const { value, multiple } = this.computeAnnotationValue(node, an)
      if (multiple) {
        if (!cleared.has(an.name)) {
          const spec = this.doc.resolveAnnotation(an.name)
          if (!spec || spec.config.mergeStrategy !== 'append') {
            this.writeln(`${accessor}.metadata.delete("${escapeQuotes(an.name)}")`)
          }
          cleared.add(an.name)
        }
        this.writeln(`$a(${accessor}.metadata, "${escapeQuotes(an.name)}", ${value}, true)`)
      } else {
        this.writeln(`$a(${accessor}.metadata, "${escapeQuotes(an.name)}", ${value})`)
      }
    }
  }

  private resolveTargetDef(targetName: string): SemanticNode | undefined {
    const unwound = this.doc.unwindType(targetName)
    if (!unwound?.def) {
      return undefined
    }
    let def = unwound.def
    if (isInterface(def)) {
      def = def.getDefinition() || def
    }
    return def
  }

  /**
   * Builds the runtime accessor paths for mutating annotate entries.
   * Computes exact paths at compile time by walking the AST,
   * so the generated JS accesses props directly without runtime search.
   * Returns multiple paths when a property appears in multiple union branches.
   */
  private buildMutatingAccessors(
    targetName: string,
    targetDef: SemanticNode | undefined,
    parts: string[]
  ): { accessors: string[]; clones: Array<{ parentPath: string; propName: string }> } {
    let accessors = [{ prefix: `${targetName}.type`, def: targetDef }]
    const clones: Array<{ parentPath: string; propName: string }> = []

    for (let i = 0; i < parts.length; i++) {
      const nextAccessors: Array<{ prefix: string; def: SemanticNode | undefined }> = []
      for (const { prefix, def } of accessors) {
        const results = this.buildPropPaths(def, parts[i])
        if (results.length > 0) {
          for (const result of results) {
            if (i < parts.length - 1) {
              // If this prop's definition is a ref, its .type is shared via refTo().
              // Clone this prop so mutations don't leak to the referenced type.
              if (result.propDef && isRef(result.propDef)) {
                clones.push({ parentPath: prefix, propName: parts[i] })
              }
              nextAccessors.push({ prefix: `${prefix}${result.path}?.type`, def: result.propDef })
            } else {
              nextAccessors.push({ prefix: `${prefix}${result.path}?`, def: result.propDef })
            }
          }
        } else {
          // Fallback for unresolvable paths
          const suffix = `.props.get("${escapeQuotes(parts[i])}")${i < parts.length - 1 ? '?.type' : '?'}`
          nextAccessors.push({ prefix: `${prefix}${suffix}`, def: undefined })
        }
      }
      accessors = nextAccessors
    }

    return { accessors: accessors.map(a => a.prefix), clones }
  }

  /**
   * Finds a property in a type tree at compile time, returning all
   * matching runtime path strings and prop definitions for further chaining.
   * Returns multiple results when the same property appears in different union branches.
   */
  private buildPropPaths(
    def: SemanticNode | undefined,
    propName: string
  ): Array<{ path: string; propDef: SemanticNode | undefined }> {
    if (!def) {
      return []
    }

    // Merge intersections into structures
    def = this.doc.mergeIntersection(def)

    // Resolve refs
    if (isRef(def)) {
      const ref = def as SemanticRefNode
      const unwound = this.doc.unwindType(ref.id!, ref.chain)?.def
      return this.buildPropPaths(unwound, propName)
    }

    // Interface → get its structure
    if (isInterface(def)) {
      return this.buildPropPaths(def.getDefinition(), propName)
    }

    // Structure → direct prop access
    if (isStructure(def)) {
      const prop = def.props.get(propName) as SemanticPropNode | undefined
      if (prop) {
        return [
          {
            path: `.props.get("${escapeQuotes(propName)}")`,
            propDef: prop.getDefinition(),
          },
        ]
      }
      return []
    }

    // Group (union/intersection/tuple) → search all items
    if (isGroup(def)) {
      const group = def as SemanticGroup
      const items = group.unwrap()
      const results: Array<{ path: string; propDef: SemanticNode | undefined }> = []
      for (let i = 0; i < items.length; i++) {
        for (const result of this.buildPropPaths(items[i], propName)) {
          results.push({
            path: `.items[${i}].type${result.path}`,
            propDef: result.propDef,
          })
        }
      }
      return results
    }

    return []
  }
}

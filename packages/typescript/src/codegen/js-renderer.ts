// oxlint-disable max-lines
// oxlint-disable max-depth
import type {
  AtscriptDoc,
  SemanticAnnotateNode,
  SemanticArrayNode,
  SemanticConstNode,
  SemanticGroup,
  SemanticInterfaceNode,
  SemanticNode,
  SemanticPrimitiveNode,
  SemanticPropNode,
  SemanticRefNode,
  SemanticStructureNode,
  SemanticTypeNode,
  TAnnotationTokens,
  TPrimitiveTypeDef,
} from '@atscript/core'
import { isGroup, isInterface, isPrimitive, isRef, isStructure } from '@atscript/core'

import {
  defineAnnotatedType,
  type TAtscriptAnnotatedType,
  type TAnnotatedTypeHandle,
} from '../annotated-type'
import { buildJsonSchema } from '../json-schema'
import { type TTsPluginOptions, resolveJsonSchemaMode } from '../plugin'
import { BaseRenderer } from './base-renderer'
import { escapeQuotes, wrapProp } from './utils'

export class JsRenderer extends BaseRenderer {
  postAnnotate = [] as SemanticNode[]
  private _adHocAnnotations: Map<string, TAnnotationTokens[]> | null = null
  private _propPath: string[] = []

  constructor(
    doc: AtscriptDoc,
    private opts?: TTsPluginOptions
  ) {
    super(doc)
  }

  pre() {
    this.writeln('// prettier-ignore-start')
    this.writeln('/* eslint-disable */')
    this.writeln('/* oxlint-disable */')
    const imports = ['defineAnnotatedType as $', 'annotate as $a']
    if (resolveJsonSchemaMode(this.opts) === 'lazy') {
      imports.push('buildJsonSchema as $$')
    }
    this.writeln(`import { ${imports.join(', ')} } from "@atscript/typescript/utils"`)
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
          map.set(path, existing ? [...existing, ...anns] : anns)
        }
      }
    }
    return map.size > 0 ? map : null
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
              def = def.getDefinition() || def
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
        this.annotateType(node.getDefinition(), node.id)
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
    this.renderJsonSchemaMethod(node)
  }

  renderInterface(node: SemanticInterfaceNode): void {
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

  renderType(node: SemanticTypeNode): void {
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

  renderAnnotate(node: SemanticAnnotateNode): void {
    if (node.isMutating) {
      this.postAnnotate.push(node)
      return
    }
    const targetName = node.targetName
    const unwound = this.doc.unwindType(targetName)
    if (!unwound?.def) {
      return
    }
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
      this.indent()
        .writeln(
          "throw new Error(\"JSON Schema support is disabled. To enable, set `jsonSchema: 'lazy'` or `jsonSchema: 'bundle'` in tsPlugin options, or add @emit.jsonSchema annotation to individual interfaces.\")"
        )
        .unindent()
      this.writeln('}')
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
        const def = (node as SemanticInterfaceNode | SemanticTypeNode).getDefinition()
        const handle = this.toAnnotatedHandle(def, true)
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
        return skipAnnotations
          ? handle
          : this.applyExpectAnnotations(handle, this.doc.evalAnnotationsForNode(node))
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
        case 'expect.int': {
          handle.annotate(a.name as any, true)
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
        if (isPrimitive(decl)) {
          this.annotateType(decl, name)
          return this
        }
        // must be something imported or defined locally
        const chain = ref.hasChain
          ? `, [${ref.chain.map(c => `"${escapeQuotes(c.text)}"`).join(', ')}]`
          : ''
        this.writeln(`$(${name ? `"", ${name}` : ''})`)
          .indent()
          .writeln(`.refTo(${ref.id!}${chain})`)
        // Emit the referenced type's annotations at build time so that
        // metadata is available regardless of declaration order.
        if (!ref.hasChain) {
          const ownerDecl = this.doc.getDeclarationOwnerNode(ref.id!)
          if (ownerDecl?.node) {
            const typeAnnotations = ownerDecl.doc.evalAnnotationsForNode(ownerDecl.node)
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
        // this.writeln(`$(${name ? `"", ${name}` : ''})`)
        //   .indent()
        //   .definePrimitive(node as SemanticPrimitiveNode)
        //   .unindent()
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
        console.log('!!!!!!! UNKNOWN', node.entity)
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
  //   defineRef(node: SemanticRefNode) {
  //     const def = this.doc.unwindType(node.id!, node.chain)?.def
  //     if (!def) {
  //       // imported?
  //       this.writeln(`.refTo(${node.id!})`)
  //       //   this.writeln('// unknown def ', node.id!)
  //     }
  //     if (isPrimitive(def)) {
  //       this.definePrimitive(def)
  //     }
  //     if (isInterface(def)) {
  //       // def.id!
  //       this.writeln(`.refTo(${def.id!})`)
  //     }
  //     if (isGroup(def)) {
  //       this.defineGroup(def)
  //     }
  //     return this
  //   }
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
      this.write('.item(').indent().annotateType(item).write('  .$type').writeln(`)`).unindent()
    }
    return this
  }
  defineArray(node: SemanticArrayNode) {
    this.write('.of(')
      .indent()
      .annotateType(node.getDefinition())
      .write('  .$type')
      .writeln(`)`)
      .unindent()
    return this
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

  private computeAnnotationValue(
    node: SemanticNode,
    an: TAnnotationTokens
  ): { value: string; multiple: boolean } {
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
              targetValue += `${wrapProp(aSpec.name)}: ${
                aSpec.type === 'string' ? `"${escapeQuotes(an.args[i]?.text)}"` : an.args[i]?.text
              }${i === length - 1 ? '' : ', '} `
            }
            i++
          }
          targetValue += '}'
        } else {
          const aSpec = spec.arguments[0]
          if (an.args[0]) {
            targetValue =
              aSpec.type === 'string' ? `"${escapeQuotes(an.args[0]?.text)}"` : an.args[0]?.text
          } else {
            targetValue = 'true'
          }
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
    for (const entry of node.entries) {
      const anns = entry.annotations
      if (!anns || anns.length === 0) {
        continue
      }

      // Build the navigation chain at compile time
      const parts = entry.hasChain ? [entry.id!, ...entry.chain.map(c => c.text)] : [entry.id!]
      const accessors = this.buildMutatingAccessors(targetName, targetDef, parts)

      for (const accessor of accessors) {
        const cleared = new Set<string>()
        for (const an of anns) {
          const { value, multiple } = this.computeAnnotationValue(entry, an)
          if (multiple) {
            // For multiple+replace: clear existing values before first append
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
    }
    // Top-level annotations on the annotate block mutate the target's metadata
    const topAnnotations = node.annotations
    if (topAnnotations && topAnnotations.length > 0) {
      const cleared = new Set<string>()
      for (const an of topAnnotations) {
        const { value, multiple } = this.computeAnnotationValue(node, an)
        if (multiple) {
          if (!cleared.has(an.name)) {
            const spec = this.doc.resolveAnnotation(an.name)
            if (!spec || spec.config.mergeStrategy !== 'append') {
              this.writeln(`${targetName}.metadata.delete("${escapeQuotes(an.name)}")`)
            }
            cleared.add(an.name)
          }
          this.writeln(`$a(${targetName}.metadata, "${escapeQuotes(an.name)}", ${value}, true)`)
        } else {
          this.writeln(`$a(${targetName}.metadata, "${escapeQuotes(an.name)}", ${value})`)
        }
      }
    }

    this.writeln()
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
  ): string[] {
    let accessors = [{ prefix: `${targetName}.type`, def: targetDef }]

    for (let i = 0; i < parts.length; i++) {
      const nextAccessors: Array<{ prefix: string; def: SemanticNode | undefined }> = []
      for (const { prefix, def } of accessors) {
        const results = this.buildPropPaths(def, parts[i])
        if (results.length > 0) {
          for (const result of results) {
            if (i < parts.length - 1) {
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

    return accessors.map(a => a.prefix)
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

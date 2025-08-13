// oxlint-disable max-lines
// oxlint-disable max-depth
import {
  AtscriptDoc,
  isPrimitive,
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
import { BaseRenderer } from './base-renderer'
import { escapeQuotes, wrapProp } from './utils'
import type { TTsPluginOptions } from '../plugin'
import {
  defineAnnotatedType,
  type TAtscriptAnnotatedType,
  type TAnnotatedTypeHandle,
} from '../annotated-type'
import { buildJsonSchema } from '../json-schema'

export class JsRenderer extends BaseRenderer {
  postAnnotate = [] as SemanticNode[]

  constructor(
    doc: AtscriptDoc,
    private opts?: TTsPluginOptions
  ) {
    super(doc)
  }

  pre() {
    this.writeln('// prettier-ignore-start')
    this.writeln('/* eslint-disable */')
    const imports = ['defineAnnotatedType as $']
    if (!this.opts?.preRenderJsonSchema) {
      imports.push('buildJsonSchema as $$')
    }
    this.writeln(`import { ${imports.join(', ')} } from "@atscript/typescript"`)
  }

  post() {
    for (const node of this.postAnnotate) {
      this.annotateType(node.getDefinition(), node.id)
      this.indent().defineMetadata(node).unindent()
      this.writeln()
    }
    this.writeln('// prettier-ignore-end')
    super.post()
  }

  renderInterface(node: SemanticInterfaceNode): void {
    this.writeln()
    const exported = node.token('export')?.text === 'export'
    this.write(exported ? 'export ' : '')
    this.write(`class ${node.id!} `)
    this.blockln('{}')
    this.writeln('static __is_atscript_annotated_type = true')
    this.writeln('static type = {}')
    this.writeln('static metadata = new Map()')
    if (this.opts?.preRenderJsonSchema) {
      const schema = JSON.stringify(buildJsonSchema(this.toAnnotatedType(node)))
      this.writeln(`static _jsonSchema = ${schema}`)
      this.writeln('static toJsonSchema() {')
      this.indent().writeln('return this._jsonSchema').unindent()
      this.writeln('}')
    } else {
      this.writeln('static _jsonSchema')
      this.writeln('static toJsonSchema() {')
      this.indent().writeln('return this._jsonSchema ?? (this._jsonSchema = $$(this))').unindent()
      this.writeln('}')
    }
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
    this.writeln('static __is_atscript_annotated_type = true')
    this.writeln('static type = {}')
    this.writeln('static metadata = new Map()')
    if (this.opts?.jsonSchema) {
      if (typeof this.opts.jsonSchema === 'object' && this.opts.jsonSchema.preRender) {
        const schema = JSON.stringify(buildJsonSchema(this.toAnnotatedType(node)))
        this.writeln(`static _jsonSchema = ${schema}`)
        this.writeln('static toJsonSchema() {')
        this.indent().writeln('return this._jsonSchema').unindent()
        this.writeln('}')
      } else {
        this.writeln('static _jsonSchema')
        this.writeln('static toJsonSchema() {')
        this.indent().writeln('return this._jsonSchema ?? (this._jsonSchema = $$(this))').unindent()
        this.writeln('}')
      }
    }
    this.popln()
    this.postAnnotate.push(node)
    this.writeln()
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
        case 'expect.maxLength':
        case 'expect.min':
        case 'expect.max':
          if (a.args[0]) {
            handle.annotate(a.name as any, Number(a.args[0].text))
          }
          break
        case 'expect.pattern':
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
        case 'expect.int':
          handle.annotate(a.name as any, true)
          break
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
          .unindent()
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
        console.log('!!!!!!! UNKNOWN ', node.entity)
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
      case 'final':
        return this.writeln(
          `$(${d()}).designType("${def.value === 'void' ? 'undefined' : def.value}")`
        )
      case 'union':
      case 'intersection':
      case 'tuple':
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
      case 'array':
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
      case 'object':
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
      default:
        // Fallback in case of unexpected input
        return this.writeln(`$(${d()}).designType("any")`)
    }
  }

  defineObject(node: SemanticStructureNode) {
    const props = Array.from(node.props.values())
    for (const prop of props) {
      const pattern = prop.token('identifier')?.pattern
      const optional = !!prop.token('optional')
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
    const annotations = this.doc.evalAnnotationsForNode(node)
    annotations?.forEach(an => {
      this.resolveAnnotationValue(node, an)
    })
    return this
  }

  resolveAnnotationValue(node: SemanticNode, an: TAnnotationTokens) {
    const spec = this.doc.resolveAnnotation(an.name)
    let targetValue = 'true'
    let multiple: boolean | undefined = false
    if (spec) {
      // resolve according spec
      multiple = spec.config.multiple
      const length = spec.arguments.length
      if (length !== 0) {
        if (Array.isArray(spec.config.argument)) {
          // as object
          targetValue = '{ '
          let i = 0
          for (const aSpec of spec.arguments) {
            if (an.args[i]) {
              targetValue += `${wrapProp(aSpec.name)}: ${
                aSpec.type === 'string' ? `"${escapeQuotes(an.args[i]?.text)}"` : an.args[i]?.text
              }${i === length - 1 ? '' : ', '} `
            } else {
              // targetValue += `${wrapProp(aSpec.name)}: undefined${i === length - 1 ? '' : ', '} `
            }
            i++
          }
          targetValue += '}'
        } else {
          // as constant
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
      // generic resolve
      multiple = node.countAnnotations(an.name) > 1 || an.args.length > 1
      if (an.args.length) {
        targetValue =
          an.args[0].type === 'text' ? `"${escapeQuotes(an.args[0].text)}"` : an.args[0].text
      }
    }
    if (multiple) {
      this.writeln(`.annotate("${escapeQuotes(an.name)}", ${targetValue}, true)`)
    } else {
      this.writeln(`.annotate("${escapeQuotes(an.name)}", ${targetValue})`)
    }
  }
}

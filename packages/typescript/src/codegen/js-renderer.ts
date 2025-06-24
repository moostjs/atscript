// oxlint-disable max-lines
// oxlint-disable max-depth
import {
  isPrimitive,
  SemanticArrayNode,
  SemanticConstNode,
  SemanticGroup,
  SemanticInterfaceNode,
  SemanticNode,
  SemanticPrimitiveNode,
  SemanticRefNode,
  SemanticStructureNode,
  SemanticTypeNode,
  TAnnotationTokens,
  TPrimitiveTypeDef,
} from '@atscript/core'
import { BaseRenderer } from './base-renderer'
import { escapeQuotes, wrapProp } from './utils'

export class JsRenderer extends BaseRenderer {
  postAnnotate = [] as SemanticNode[]

  pre() {
    this.writeln('import { defineAnnotatedType as $ } from "@atscript/typescript"')
  }

  post() {
    for (const node of this.postAnnotate) {
      this.annotateType(node.getDefinition(), node.id)
      this.indent().defineMetadata(node).unindent()
      this.writeln()
    }
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
    this.popln()
    this.postAnnotate.push(node)
    this.writeln()
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
    const type = t === 'text' ? 'String' : t === 'number' ? 'Number' : 'undefined'
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

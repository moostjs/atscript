import {
  isGroup,
  isInterface,
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
} from '@anscript/core'
import { BaseRenderer } from './base-renderer'
import { escapeQuotes, wrapProp } from './utils'

export class JsRenderer extends BaseRenderer {
  pre() {
    this.writeln('import { defineAnnotatedType as $ } from "@anscript/typescript"')
  }

  renderInterface(node: SemanticInterfaceNode): void {
    this.writeln()
    const exported = node.token('export')?.text === 'export'
    this.write(exported ? 'export ' : '')
    this.writeln(`class ${node.id!} {}`)
    this.annotateType(node.getDefinition(), node.id)
    this.indent().defineMetadata(node).unindent()
    this.writeln()
  }

  renderType(node: SemanticTypeNode): void {
    this.writeln()
    const exported = node.token('export')?.text === 'export'
    this.write(exported ? 'export ' : '')
    this.writeln(`class ${node.id!} {}`)
    this.annotateType(node.getDefinition(), node.id)
    this.indent().defineMetadata(node).unindent()
    this.writeln()
  }

  annotateType(node?: SemanticNode, name?: string) {
    if (!node) {
      return
    }

    let kind = node.entity as string
    switch (node.entity) {
      case 'ref': {
        const ref = node as SemanticRefNode
        const decl = this.doc.getDeclarationOwnerNode(ref.id!)?.node
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
        this.writeln(`$(${name ? `"", ${name}` : ''})`)
          .indent()
          .definePrimitive(node as SemanticPrimitiveNode)
          .unindent()
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
    this.writeln(`.type(${type})`)
    this.writeln(`.value(${t === 'text' ? `"${escapeQuotes(node.id!)}"` : node.id!})`)
    return this
  }
  defineRef(node: SemanticRefNode) {
    const def = this.doc.unwindType(node.id!, node.chain)?.def
    if (!def) {
      // imported?
      this.writeln(`.refTo(${node.id!})`)
      //   this.writeln('// unknown def ', node.id!)
    }
    if (isPrimitive(def)) {
      this.definePrimitive(def)
    }
    if (isInterface(def)) {
      // def.id!
      this.writeln(`.refTo(${def.id!})`)
    }
    if (isGroup(def)) {
      this.defineGroup(def)
    }
    return this
  }
  definePrimitive(node: SemanticPrimitiveNode) {
    const designType = node.config?.nativeTypes?.typescript ?? 'unknown'
    const type = node.config?.nativeConstructors?.typescript ?? 'Object'
    this.writeln(`.designType("${escapeQuotes(designType)}")`)
    this.writeln(`.type(${type})`)
    return this
  }
  defineObject(node: SemanticStructureNode) {
    const props = Array.from(node.props.values())
    for (const prop of props) {
      const optional = !!prop.token('optional')
      this.writeln(`.prop(`)
      this.indent()
      this.writeln(`"${escapeQuotes(prop.id!)}",`)
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
      this.write('.item(')
      this.indent()
      this.annotateType(item)
      this.write('  .$type')
      this.writeln(`)`)
      this.unindent()
    }
    return this
  }
  defineArray(node: SemanticArrayNode) {
    this.write('.of(')
    this.indent()
    this.annotateType(node.getDefinition())
    this.write('  .$type')
    this.writeln(`)`)
    this.unindent()
    return this
  }

  defineMetadata(node: SemanticNode) {
    node.annotations?.forEach(an => {
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
            targetValue += `${wrapProp(aSpec.name)}: ${
              aSpec.type === 'string' ? `"${escapeQuotes(an.args[0]?.text)}"` : an.args[i]?.text
            }${i === length - 1 ? '' : ', '} `
            i++
          }
          targetValue += '}'
        } else {
          // as constant
          const aSpec = spec.arguments[0]
          targetValue =
            aSpec.type === 'string' ? `"${escapeQuotes(an.args[0]?.text)}"` : an.args[0]?.text
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

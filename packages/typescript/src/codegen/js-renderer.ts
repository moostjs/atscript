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
} from '@anscript/core'
import { BaseRenderer } from './base-renderer'
import { escapeQuotes } from './utils'

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
        this.writeln(`$("ref"${name ? `, ${name}` : ''})`)
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

  defineMetadata(node: SemanticNode) {
    node.annotations?.forEach(a => {
      let targetValue = 'true'
      if (a.args.length) {
        targetValue =
          a.args[0].type === 'text' ? `"${escapeQuotes(a.args[0].text)}"` : a.args[0].text
      }
      this.writeln(`.annotate("${escapeQuotes(a.token.text.slice(1))}", ${targetValue})`)
    })
    return this
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
      this.writeln(`.prop(`)
      this.indent()
      this.writeln(`"${escapeQuotes(prop.id!)}",`)
      this.annotateType(prop.getDefinition())
      this.indent().defineMetadata(prop).unindent()
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
      this.write('  .$def')
      this.writeln(`)`)
      this.unindent()
    }
    return this
  }
  defineArray(node: SemanticArrayNode) {
    this.write('.of(')
    this.indent()
    this.annotateType(node.getDefinition())
    this.write('  .$def')
    this.writeln(`)`)
    this.unindent()
    return this
  }
}

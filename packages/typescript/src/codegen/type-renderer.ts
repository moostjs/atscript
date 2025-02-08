import {
  isArray,
  isConst,
  isGroup,
  isInterface,
  isPrimitive,
  isRef,
  isStructure,
  SemanticArrayNode,
  SemanticInterfaceNode,
  SemanticNode,
  SemanticRefNode,
  SemanticStructureNode,
  SemanticTypeNode,
  TPrimitiveTypeDef,
} from '@atscript/core'
import { BaseRenderer } from './base-renderer'
import { escapeQuotes, wrapProp } from './utils'

export class TypeRenderer extends BaseRenderer {
  pre() {
    this.writeln('// prettier-ignore-start')
    this.writeln('/* eslint-disable */')
    this.writeln(`/// <reference path="./${this.doc.name}" />`)
    this.writeln('/**')
    this.writeln(' * 🪄 This file was generated by Atscript')
    this.writeln(' * Do not edit this file!')
    this.writeln(' */')
    this.writeln()
    this.writeln(
      'import type { TAtscriptTypeObject, TAtscriptTypeComplex, TAtscriptTypeFinal, TAtscriptTypeArray, TMetadataMap, Validator } from "@atscript/typescript"'
    )
  }

  post() {
    this.writeln('// prettier-ignore-end')
  }

  renderTypeDef(def?: SemanticNode) {
    if (!def) {
      this.write('unknown')
      return
    }
    if (isStructure(def)) {
      return this.renderStructure(def)
    }
    if (isGroup(def)) {
      const tuple = def.entity === 'tuple'
      const operator = tuple ? ', ' : ` ${def.op!} `
      const children = def.unwrap()
      const hasSubgroup = !tuple && children.some(c => c.entity === 'group')
      this.write(tuple ? '[' : hasSubgroup ? '(' : '')
      this.renderTypeDef(def.first)
      for (const child of children.slice(1)) {
        this.write(operator)
        this.renderTypeDef(child)
      }
      return this.write(tuple ? ']' : hasSubgroup ? ')' : '')
    }
    if (isConst(def)) {
      const name =
        def.token('identifier')?.type === 'number' ? def.id! : `"${escapeQuotes(def.id!)}"`
      return this.write(name)
    }
    if (isRef(def)) {
      const node = def as SemanticRefNode
      const unwound = this.doc.unwindType(node.id!, node.chain)
      if (isPrimitive(unwound?.def)) {
        this.write(renderPrimitiveTypeDef(unwound.def.config.type))
        if (node.hasChain) {
          this.write(` /* ${node.chain.map(c => c.text).join('.')} */`)
        }
        return
      }
      let name = node.id!
      for (const c of node.chain) {
        name += `["${escapeQuotes(c.text)}"]`
      }
      return this.write(name)
    }
    if (isArray(def)) {
      const node = def as SemanticArrayNode
      const def2 = node.getDefinition()
      const isGrp = def2?.entity === 'group'
      if (isGrp) {
        this.write('(')
      }
      this.renderTypeDef(def2)
      if (isGrp) {
        this.write(')')
      }
      return this.write('[]')
    }
  }

  renderStructure(struct: SemanticStructureNode, asClass?: string) {
    this.blockln('{}')
    // let propsList = ''
    for (const prop of Array.from(struct.props.values())) {
      // propsList += (propsList ? ' | ' : '') + `"${escapeQuotes(prop.id!)}"`
      const optional = !!prop.token('optional')
      this.write(wrapProp(prop.id!), optional ? '?' : '', ': ')
      this.renderTypeDef(prop.getDefinition())
      this.writeln()
    }
    if (asClass) {
      this.writeln('static __is_anscript_annotated_type: true')
      this.writeln(`static type: TAtscriptTypeObject<keyof ${asClass}>`)
      this.writeln(`static metadata: TMetadataMap<AtscriptMetadata>`)
      this.writeln(`static validator: () => Validator`)
    }
    this.pop()
  }

  renderInterface(node: SemanticInterfaceNode) {
    this.writeln()
    const exported = node.token('export')?.text === 'export'
    this.renderJsDoc(node)
    this.write(exported ? 'export declare ' : 'declare ')
    this.write(`class ${node.id!} `)
    const struct = node.getDefinition()
    if (struct?.entity === 'structure') {
      this.renderStructure(struct as SemanticStructureNode, node.id!)
    } else {
      this.writeln('{}')
    }
    this.writeln()
  }

  renderType(node: SemanticTypeNode) {
    this.writeln()
    const exported = node.token('export')?.text === 'export'
    this.renderJsDoc(node)
    this.write(exported ? 'export ' : 'declare ')
    this.write(`type ${node.id!} = `)
    this.renderTypeDef(node.getDefinition())
    this.writeln()
    this.renderTypeNamespace(node)
  }

  renderTypeNamespace(node: SemanticTypeNode) {
    this.write(`declare namespace ${node.id!} `)
    this.blockln('{}')
    const def = node.getDefinition()
    let typeDef = 'TAtscriptTypeDef'
    if (def) {
      let realDef = def
      if (isRef(def)) {
        realDef = this.doc.unwindType(def.id!, def.chain)?.def || realDef
      }
      realDef = this.doc.mergeIntersection(realDef)
      if (isStructure(realDef) || isInterface(realDef)) {
        typeDef = `TAtscriptTypeObject<keyof ${node.id!}}>`
      } else if (isGroup(realDef)) {
        typeDef = 'TAtscriptTypeComplex'
      } else if (isArray(realDef)) {
        typeDef = 'TAtscriptTypeArray'
      } else if (isPrimitive(realDef)) {
        typeDef = 'TAtscriptTypeFinal'
      }
    }
    this.writeln(`const __is_anscript_annotated_type: true`)
    this.writeln(`const type: ${typeDef}`)
    this.writeln(`const metadata: TMetadataMap<AtscriptMetadata>`)
    this.writeln(`const validator: () => Validator`)
    this.popln()
  }

  renderJsDoc(node: SemanticNode) {
    const range = node.token('identifier')?.range
    const rangeStr = range ? `:${range.start.line + 1}:${range.start.character + 1}` : ''
    this.writeln(`/**`)
    this.writeln(` * Atscript ${node.entity} **${node.id!}**`)
    this.writeln(` * @see {@link ./${this.doc.name}${rangeStr}}`)
    this.writeln(` */`)
  }
}

function renderPrimitiveTypeDef(def?: TPrimitiveTypeDef): string {
  if (!def) {
    return 'unknown'
  }
  // If it's a direct final type, return it
  if (typeof def === 'string') {
    return def === 'void' ? 'undefined' : def
  }

  switch (def.kind) {
    case 'final':
      return def.value === 'void' ? 'undefined' : def.value
    case 'union':
      return def.items.map(renderPrimitiveTypeDef).join(' | ')
    case 'intersection':
      return def.items.map(renderPrimitiveTypeDef).join(' & ')
    case 'tuple':
      return `[${def.items.map(renderPrimitiveTypeDef).join(', ')}]`
    case 'array':
      return `${renderPrimitiveTypeDef(def.of)}[]`
    case 'object': {
      const props = Object.entries(def.props)
        .map(
          ([key, val]) =>
            `${wrapProp(key)}${
              typeof val === 'object' && val.optional ? '?' : ''
            }: ${renderPrimitiveTypeDef(val)}`
        )
        .join('; ')
      return `{ ${props} }`
    }
    default:
      // Fallback in case of unexpected input
      return 'unknown'
  }
}

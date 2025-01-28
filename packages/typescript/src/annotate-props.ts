import {
  AnscriptDoc,
  isArray,
  isConst,
  isGroup,
  isInterface,
  isPrimitive,
  isProp,
  isRef,
  isStructure,
  isTuple,
  SemanticArrayNode,
  SemanticConstNode,
  SemanticGroup,
  SemanticNode,
  SemanticPropNode,
  SemanticRefNode,
  SemanticStructureNode,
  SemanticTupleNode,
} from '@anscript/core'
import { TsArtifact } from './ts-gen/ts-artifact'
import { TsObject } from './ts-gen/ts-object'
import { escapeQuotes } from './ts-gen/utils'
import { TsArray } from './ts-gen/ts-array'

export class AnnotatedProps extends TsArtifact {
  private props: SemanticPropNode[] = []

  constructor(
    private readonly doc: AnscriptDoc,
    name: string,
    private readonly realName: string
  ) {
    super(name)
  }

  addProp(prop: SemanticPropNode) {
    this.props.push(prop)
  }

  private renderProp(p: SemanticPropNode, prefix = '') {
    const def = p.getDefinition()
    let rootType = def
    const toInherit = [] as SemanticNode[]
    const toInheritSet = new Set<SemanticNode>()
    if (isRef(def)) {
      const unwoundType = this.doc.unwindType(def.id!, def.chain)?.node
      let needToInherit: SemanticNode | undefined
      if (isProp(unwoundType)) {
        needToInherit = unwoundType
      } else {
        needToInherit = this.doc.getDeclarationOwnerNode(def.id!)?.node
      }
      while (needToInherit && !toInheritSet.has(needToInherit)) {
        // deep inheritance
        toInherit.push(needToInherit)
        toInheritSet.add(needToInherit)
        const def = needToInherit.getDefinition()
        needToInherit = undefined
        if (isRef(def)) {
          const unwoundType = this.doc.unwindType(def.id!, def.chain)?.node
          if (isProp(unwoundType)) {
            needToInherit = unwoundType
          } else {
            needToInherit = this.doc.getDeclarationOwnerNode(def.id!)?.node
          }
        }
      }
      rootType = needToInherit || rootType
    }
    const annotations = genAnnotations(p, toInherit).render(prefix + '    ')
    const ref = safeRef(p.id!)
    const tempConst = this.name === `$$md_${ref}` ? `$$md_${ref}_` : `$$md_${ref}`
    const annotatedProps = def
      ? annotateProps(
          this.doc,
          tempConst,
          def,
          `${this.realName}["${escapeQuotes(p.id!)}"]`
        ).render(prefix + '  ')
      : ''
    return (
      `{ // ${this.realName}["${escapeQuotes(p.id!)}"]\n` +
      `${prefix}  const ${tempConst} = defineAnnotatedType({\n` +
      `${prefix}    type: ${parseType(this.doc, rootType).render(prefix + '    ')},\n` +
      `${prefix}    metadata: ${annotations},\n` +
      `${prefix}  });\n` +
      `${prefix}  ${this.name}.type.props.set("${escapeQuotes(p.id!)}", ${tempConst});\n` +
      annotatedProps +
      `${prefix}}`
    )
  }

  public render(prefix = ''): string {
    if (this.props.length === 0) {
      return ''
    }
    return (
      `\n${prefix}//#region Annotations for ${this.realName}\n${prefix}` +
      this.props.map(p => this.renderProp(p, prefix)).join('') +
      `\n${prefix}//#endregion\n`
    )
  }
  public renderTypes(): string {
    return ''
  }
}

/**
 * Factory for TsAnnotatedProps
 * @param doc
 * @param name
 * @param node
 * @param realName
 * @returns {AnnotatedProps}
 */
export function annotateProps(
  doc: AnscriptDoc,
  name: string,
  node: SemanticNode,
  realName?: string
): AnnotatedProps {
  const annotated = new AnnotatedProps(doc, name, realName || name)

  if (isInterface(node) || isStructure(node)) {
    for (const prop of Array.from(node.props.values())) {
      annotated.addProp(prop)
    }
  }

  return annotated
}

export function genAnnotations(node: SemanticNode, toInherit: SemanticNode[] = []): TsObject {
  const o = new TsObject()

  const objects = new Map<string, TsObject>()
  const sources = [node, ...toInherit].filter(Boolean) as SemanticNode[]
  const saved = new Set<string>()

  for (const n of sources) {
    for (const [key, val] of Array.from(n.annotations?.entries() || [])) {
      if (saved.has(key)) {
        continue
      }
      saved.add(key)
      let targetValue = 'true'
      if (val.args.length) {
        targetValue =
          val.args[0].type === 'text' ? `"${escapeQuotes(val.args[0].text)}"` : val.args[0].text
      }
      const keys = key.split('.')
      let currentObj = o
      let currentKey = ''
      let i = 0
      for (const k of keys) {
        i++
        if (i === keys.length) {
          currentObj.addEntry(k, targetValue)
          break
        }
        currentKey += k
        if (!objects.has(currentKey)) {
          const newObj = new TsObject()
          objects.set(currentKey, newObj)
          currentObj.addEntry(k, newObj)
        }
        currentObj = objects.get(currentKey)!
      }
    }
  }
  return o
}

/**
 * Removes all characters from `name` that are not alphanumeric, underscore, or dollar sign.
 * If the result is empty after removal, returns "_ref".
 *
 * Example:
 *   safeRef("some-prop") => "someprop"
 *   safeRef("42?test!") => "42test"
 *   safeRef("???") => "_ref"
 */
export function safeRef(name: string): string {
  // Keep [A-Za-z0-9_$], remove all else
  const sanitized = name.replace(/[^A-Za-z0-9_$]+/g, '')
  return sanitized || '_ref'
}

const typesMap = new WeakMap<SemanticNode, { render: (prefix?: string) => string }>()

function parseType(
  doc: AnscriptDoc,
  _node?: SemanticNode
): { render: (prefix?: string) => string } {
  if (!_node) {
    return new TsObject()
  }
  if (typesMap.has(_node)) {
    return typesMap.get(_node)!
  }
  const obj = new TsObject()
  const o = { render: (prefix?: string) => obj.render(prefix) }
  if (isRef(_node)) {
    const node = _node as SemanticRefNode
    const def = doc.unwindType(node.id!, node.chain)?.def
    if (!def) {
      return o
    }
    if (typesMap.has(def)) {
      return typesMap.get(def)!
    }

    if (isPrimitive(def)) {
      const designType = def.config?.nativeTypes?.typescript
      const type = def.config?.nativeConstructors?.typescript
      obj.addEntry('kind', '"final"')
      obj.addEntry('designType', `"${escapeQuotes(designType ?? 'undefined')}"`)
      obj.addEntry('type', type ?? 'undefined')
      typesMap.set(def, o)
      return o
    }
    if (isInterface(def)) {
      o.render = () => `${def.id!}.type`
      typesMap.set(def, o)
      return o
    }
    if (isGroup(def)) {
      return parseType(doc, def)
    }
  } else if (isConst(_node)) {
    const node = _node as SemanticConstNode
    const t = node.token('identifier')?.type
    const designType = t === 'text' ? 'string' : t === 'number' ? 'number' : 'unknown'
    const type = t === 'text' ? 'String' : t === 'number' ? 'Number' : 'undefined'
    obj.addEntry('kind', '"final"')
    obj.addEntry('designType', `"${escapeQuotes(designType ?? 'undefined')}"`)
    obj.addEntry('type', type ?? 'undefined')
    obj.addEntry('value', t === 'text' ? `"${escapeQuotes(node.id!)}"` : node.id!)
    typesMap.set(node, o)
    return o
  } else if (isArray(_node)) {
    const node = _node as SemanticArrayNode
    obj.addEntry('kind', '"array"')
    obj.addEntry('of', parseType(doc, node.getDefinition()) as TsArtifact)
    typesMap.set(node, o)
  } else if (isTuple(_node)) {
    const node = _node as SemanticTupleNode
    obj.addEntry('kind', '"tuple"')
    const items = new TsArray()
    for (const item of node.unwrap()) {
      items.addItem(parseType(doc, item) as TsArtifact)
    }
    obj.addEntry('items', items)
    typesMap.set(node, o)
    return o
  } else if (isStructure(_node)) {
    const node = _node as SemanticStructureNode
    obj.addEntry('kind', '"object"')
    obj.addEntry('type', 'Object')
    obj.addEntry('props', 'new Map()')
    typesMap.set(node, o)
    return o
  } else if (isGroup(_node)) {
    const node = _node as SemanticGroup
    const items = new TsArray()
    obj.addEntry('kind', node.op === '|' ? '"union"' : '"intersection"')
    for (const item of node.unwrap()) {
      items.addItem(parseType(doc, item) as TsArtifact)
    }
    obj.addEntry('items', items)
    typesMap.set(node, o)
    return o
  }
  return o
}

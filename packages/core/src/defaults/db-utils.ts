import type { AtscriptDoc } from '../document'
import {
  isInterface,
  isRef,
  isStructure,
  type SemanticInterfaceNode,
  type SemanticPropNode,
  type SemanticRefNode,
  type SemanticStructureNode,
} from '../parser/nodes'

export interface TFKFieldMatch {
  name: string
  prop: SemanticPropNode
  chainRef: { type: string; field: string }
}

/**
 * Find all `@db.rel.FK` fields on a type that reference `targetTypeName`.
 * Resolves `extends` to include inherited fields.
 */
export function findFKFieldsPointingTo(
  doc: AtscriptDoc,
  iface: SemanticInterfaceNode | SemanticStructureNode,
  targetTypeName: string,
  alias?: string,
): TFKFieldMatch[] {
  const results: TFKFieldMatch[] = []

  // Resolve extends if it's an interface with parents
  let struct: SemanticStructureNode | undefined
  if (isInterface(iface) && iface.hasExtends) {
    const resolved = doc.resolveInterfaceExtends(iface)
    if (resolved && isStructure(resolved)) {
      struct = resolved
    }
  }
  if (!struct) {
    struct = isStructure(iface)
      ? iface
      : isInterface(iface) && isStructure(iface.getDefinition())
        ? iface.getDefinition() as SemanticStructureNode
        : undefined
  }
  if (!struct) {
    return results
  }

  for (const [name, prop] of struct.props) {
    if (prop.countAnnotations('db.rel.FK') === 0) {
      continue
    }

    const def = prop.getDefinition()
    if (!def || !isRef(def)) {
      continue
    }

    const ref = def as SemanticRefNode
    if (!ref.hasChain) {
      continue
    }

    const refTypeName = ref.id!
    const refField = ref.chain.map(c => c.text).join('.')

    if (refTypeName !== targetTypeName) {
      continue
    }

    // If alias filter provided, check the FK alias annotation argument
    if (alias !== undefined) {
      const fkAnnotations = prop.annotations?.filter(a => a.name === 'db.rel.FK')
      const hasMatchingAlias = fkAnnotations?.some(a =>
        a.args.length > 0 && a.args[0].text === alias
      )
      if (!hasMatchingAlias) {
        continue
      }
    }

    results.push({
      name,
      prop,
      chainRef: { type: refTypeName, field: refField },
    })
  }

  return results
}

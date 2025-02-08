import { SemanticArrayNode } from './array-node'
import { SemanticConstNode } from './const-node'
import { SemanticGroup } from './group-node'
import { SemanticImportNode } from './import-node'
import { SemanticInterfaceNode } from './interface-node'
import { SemanticNode } from './semantic-node'
import { SemanticPrimitiveNode } from './primitive-node'
import { SemanticPropNode } from './prop-node'
import { SemanticRefNode } from './ref-node'
import { SemanticStructureNode } from './structure-node'
import { SemanticTupleNode } from './tuple-node'
import { SemanticTypeNode } from './type-node'

export const $n = {
  SemanticGroup,
  SemanticInterfaceNode,
  SemanticTypeNode,
  SemanticRefNode,
  SemanticConstNode,
  SemanticPropNode,
  SemanticStructureNode,
  SemanticTupleNode,
  SemanticArrayNode,
  SemanticImportNode,
  SemanticPrimitiveNode,
}

export { SemanticArrayNode } from './array-node'
export { SemanticConstNode } from './const-node'
export { SemanticGroup } from './group-node'
export { SemanticImportNode } from './import-node'
export { SemanticInterfaceNode } from './interface-node'
export { SemanticNode } from './semantic-node'
export { SemanticPrimitiveNode } from './primitive-node'
export { SemanticPropNode } from './prop-node'
export { SemanticRefNode } from './ref-node'
export { SemanticStructureNode } from './structure-node'
export { SemanticTupleNode } from './tuple-node'
export { SemanticTypeNode } from './type-node'
export * from './types'

export function isGroup(node?: SemanticNode): node is SemanticGroup {
  return node?.entity === 'group' || node?.entity === 'structure' || node?.entity === 'tuple'
}

export function isInterface(node?: SemanticNode): node is SemanticInterfaceNode {
  return node?.entity === 'interface'
}

export function isType(node?: SemanticNode): node is SemanticTypeNode {
  return node?.entity === 'type'
}

export function isRef(node?: SemanticNode): node is SemanticRefNode {
  return node?.entity === 'ref'
}

export function isConst(node?: SemanticNode): node is SemanticConstNode {
  return node?.entity === 'const'
}

export function isProp(node?: SemanticNode): node is SemanticPropNode {
  return node?.entity === 'prop'
}

export function isStructure(node?: SemanticNode): node is SemanticStructureNode {
  return node?.entity === 'structure'
}

export function isTuple(node?: SemanticNode): node is SemanticTupleNode {
  return node?.entity === 'tuple'
}

export function isArray(node?: SemanticNode): node is SemanticArrayNode {
  return node?.entity === 'array'
}

export function isImport(node?: SemanticNode): node is SemanticImportNode {
  return node?.entity === 'import'
}

export function isPrimitive(node?: SemanticNode): node is SemanticPrimitiveNode {
  return node?.entity === 'primitive'
}

import { SemanticArrayNode } from './array-node'
import { SemanticConstNode } from './const-node'
import { SemanticGroup } from './group-node'
import { SemanticInterfaceNode } from './interface-node'
import type { SemanticNode } from './node'
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
}

export * from './node'
export * from './types'

export function isGroup(node: SemanticNode): node is SemanticGroup {
  return node instanceof SemanticGroup
}

export function isInterface(node: SemanticNode): node is SemanticInterfaceNode {
  return node instanceof SemanticInterfaceNode
}

export function isType(node: SemanticNode): node is SemanticTypeNode {
  return node instanceof SemanticTypeNode
}

export function isRef(node: SemanticNode): node is SemanticRefNode {
  return node instanceof SemanticRefNode
}

export function isConst(node: SemanticNode): node is SemanticConstNode {
  return node instanceof SemanticConstNode
}

export function isProp(node: SemanticNode): node is SemanticPropNode {
  return node instanceof SemanticPropNode
}

export function isStructure(node: SemanticNode): node is SemanticStructureNode {
  return node instanceof SemanticStructureNode
}

export function isTuple(node: SemanticNode): node is SemanticTupleNode {
  return node instanceof SemanticTupleNode
}

export function isArray(node: SemanticNode): node is SemanticArrayNode {
  return node instanceof SemanticArrayNode
}

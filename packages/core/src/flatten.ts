import type { AtscriptDoc } from './document'
import type { SemanticNode } from './parser/nodes/semantic-node'
import type { SemanticPropNode } from './parser/nodes/prop-node'
import type { SemanticInterfaceNode } from './parser/nodes/interface-node'
import type { SemanticStructureNode } from './parser/nodes/structure-node'
import type { SemanticArrayNode } from './parser/nodes/array-node'
import type { SemanticRefNode } from './parser/nodes/ref-node'
import {
  SemanticGroup,
} from './parser/nodes/group-node'
import {
  isArray,
  isGroup,
  isInterface,
  isPrimitive,
  isRef,
  isStructure,
} from './parser/nodes'

/**
 * Descriptor for a single field in the flattened interface map.
 */
export interface TFlatFieldDescriptor {
  /** The resolved type definition node. */
  def: SemanticNode
  /** The owning document (may differ from root for cross-file refs). */
  doc: AtscriptDoc
  /** Whether the field is optional. */
  optional: boolean
  /** The property node (for annotation access). Undefined for the root entry. */
  propNode?: SemanticPropNode
  /**
   * Whether this is an intermediate (non-leaf) path — a structure, array of structures,
   * or union of only complex types. Intermediate entries should be typed as `never`
   * in the rendered output to prevent meaningless `$eq` comparisons, while still
   * appearing in autocomplete for `$select` and `$exists` checks.
   */
  intermediate?: boolean
  /** Whether this field has the `@db.json` annotation (stored as JSON string in DB). */
  dbJson?: boolean
}

export interface TFlattenOptions {
  /** When true, skip properties annotated with @db.rel.to, @db.rel.from, or @db.rel.via. */
  skipNavProps?: boolean
}

/**
 * Flattens an interface node into a map of dot-notation paths to their type descriptors.
 *
 * This utility exists to improve type-safety for filter expressions and `$select`/`$sort`
 * operations in the DB layer. The generated `__flat` static property on `@db.table`
 * interfaces uses this map to provide autocomplete and compile-time checks for
 * dot-notation query paths.
 *
 * Walks the interface structure (including inherited props from `extends`) and collects
 * all reachable field paths. Nested objects are recursed into, arrays are recursed through
 * their element types, and unions/intersections are recursed through each branch (with
 * colliding paths merged into union groups).
 *
 * Fields annotated with `@db.json` are treated as leaves — their sub-paths are NOT included,
 * because `@db.json` fields are stored as a single JSON column in the database and their
 * sub-paths are not individually queryable.
 *
 * @param doc - The document owning the interface node.
 * @param node - The interface node to flatten.
 * @returns A map of dot-separated paths to their field descriptors.
 */
export function flattenInterfaceNode(
  doc: AtscriptDoc,
  node: SemanticInterfaceNode,
  options?: TFlattenOptions
): Map<string, TFlatFieldDescriptor> {
  const flatMap = new Map<string, TFlatFieldDescriptor>()
  const stack = new Set<SemanticNode>()

  // Resolve the full structure (including extends)
  let struct: SemanticNode | undefined
  if (node.hasExtends) {
    struct = doc.resolveInterfaceExtends(node)
  }
  if (!struct) {
    struct = node.getDefinition()
  }
  if (!struct || !isStructure(struct)) {
    return flatMap
  }

  walkStructure(doc, struct as SemanticStructureNode, '', false, flatMap, stack, options)
  return flatMap
}

/**
 * Checks whether a property has the `@db.json` annotation.
 *
 * NOTE: This is intentionally hardcoded to `db.json` (rather than being
 * configurable) because the flattening behavior is tightly coupled to DB
 * semantics — `@db.json` fields are stored as a single JSON column, so their
 * sub-paths must not appear in the flat map (they are not individually
 * queryable in filters or selectable in projections).
 */
function hasDbJsonAnnotation(prop: SemanticPropNode): boolean {
  if (!prop.annotations) {
    return false
  }
  return prop.annotations.some(a => a.name === 'db.json')
}

export function hasNavPropAnnotation(prop: SemanticPropNode): boolean {
  if (!prop.annotations) {
    return false
  }
  return prop.annotations.some(a =>
    a.name === 'db.rel.to' || a.name === 'db.rel.from' || a.name === 'db.rel.via'
  )
}

export function isPhantomNode(doc: AtscriptDoc, def?: SemanticNode): boolean {
  if (!def) {
    return false
  }
  if (isPrimitive(def) && def.config.type === 'phantom') {
    return true
  }
  if (isRef(def)) {
    const unwound = doc.unwindType(def.id!, def.chain)
    return !!(unwound?.def && isPrimitive(unwound.def) && unwound.def.config.type === 'phantom')
  }
  return false
}

function resolveNode(
  doc: AtscriptDoc,
  def: SemanticNode
): { def: SemanticNode; doc: AtscriptDoc } | undefined {
  if (isRef(def)) {
    const ref = def as SemanticRefNode
    const unwound = doc.unwindType(ref.id!, ref.chain)
    if (unwound?.def) {
      // Recursively resolve in case ref points to an interface
      return resolveNode(unwound.doc, unwound.def)
    }
    return undefined
  }
  if (isInterface(def)) {
    const iface = def as SemanticInterfaceNode
    let struct: SemanticNode | undefined
    if (iface.hasExtends) {
      struct = doc.resolveInterfaceExtends(iface)
    }
    if (!struct) {
      struct = iface.getDefinition()
    }
    if (struct) {
      return { def: struct, doc }
    }
    return undefined
  }
  return { def, doc }
}

function isComplexNode(def: SemanticNode): boolean {
  return isStructure(def) || isArray(def) || (isGroup(def) && def.entity !== 'tuple')
}

function addToFlatMap(
  flatMap: Map<string, TFlatFieldDescriptor>,
  path: string,
  descriptor: TFlatFieldDescriptor
) {
  const existing = flatMap.get(path)
  if (existing) {
    // Merge: wrap both defs in a union group (synthetic union for colliding paths)
    const group = new SemanticGroup([existing.def, descriptor.def], '|')
    flatMap.set(path, {
      def: group,
      doc: existing.doc,
      optional: existing.optional || descriptor.optional,
      propNode: existing.propNode,
      intermediate: existing.intermediate && descriptor.intermediate ? true : undefined,
    })
  } else {
    flatMap.set(path, descriptor)
  }
}

function walkStructure(
  doc: AtscriptDoc,
  struct: SemanticStructureNode,
  prefix: string,
  parentOptional: boolean,
  flatMap: Map<string, TFlatFieldDescriptor>,
  stack: Set<SemanticNode>,
  options?: TFlattenOptions
) {
  for (const [name, prop] of struct.props) {
    // Skip pattern properties ([key: string])
    if (prop.token('identifier')?.pattern) {
      continue
    }

    const propDef = prop.getDefinition()

    // Skip phantom types
    if (isPhantomNode(doc, propDef)) {
      continue
    }

    // Skip navigation properties when requested
    if (options?.skipNavProps && hasNavPropAnnotation(prop)) {
      continue
    }

    const path = prefix ? `${prefix}.${name}` : name
    const optional = parentOptional || !!prop.token('optional')
    const dbJson = hasDbJsonAnnotation(prop)

    if (!propDef) {
      addToFlatMap(flatMap, path, { def: prop, doc, optional, propNode: prop })
      continue
    }

    const resolved = resolveNode(doc, propDef)
    if (!resolved) {
      addToFlatMap(flatMap, path, { def: propDef, doc, optional, propNode: prop })
      continue
    }

    // @db.json fields are always leaves — do not recurse
    if (dbJson) {
      addToFlatMap(flatMap, path, { def: resolved.def, doc: resolved.doc, optional, propNode: prop, dbJson: true })
      continue
    }

    walkNode(resolved.doc, resolved.def, path, optional, prop, flatMap, stack, options)
  }
}

function walkNode(
  doc: AtscriptDoc,
  def: SemanticNode,
  path: string,
  optional: boolean,
  propNode: SemanticPropNode | undefined,
  flatMap: Map<string, TFlatFieldDescriptor>,
  stack: Set<SemanticNode>,
  options?: TFlattenOptions
) {
  // Circular reference guard (tracks current recursion stack)
  if (stack.has(def)) {
    addToFlatMap(flatMap, path, { def, doc, optional, propNode })
    return
  }
  stack.add(def)

  try {
    if (isStructure(def)) {
      // Structure is intermediate — add entry typed as never, then recurse sub-paths
      addToFlatMap(flatMap, path, { def, doc, optional, propNode, intermediate: true })
      walkStructure(doc, def as SemanticStructureNode, path, optional, flatMap, stack, options)
    } else if (isArray(def)) {
      // Check if array element is a complex type (structure/group/array)
      const elementDef = (def as SemanticArrayNode).getDefinition()
      const resolvedElement = elementDef ? resolveNode(doc, elementDef) : undefined
      const isComplexElement = resolvedElement && (isStructure(resolvedElement.def) || (isGroup(resolvedElement.def) && resolvedElement.def.entity !== 'tuple') || isArray(resolvedElement.def))
      if (isComplexElement) {
        // Array of complex type — intermediate entry, then recurse element sub-paths
        addToFlatMap(flatMap, path, { def, doc, optional, propNode, intermediate: true })
        walkArrayElement(doc, def as SemanticArrayNode, path, optional, flatMap, stack, options)
      } else {
        // Array of primitive/leaf — leaf entry
        addToFlatMap(flatMap, path, { def, doc, optional, propNode })
      }
    } else if (isGroup(def) && def.entity !== 'structure') {
      const group = def as SemanticGroup
      if (group.op === '&') {
        // Collapse intersection then re-dispatch
        const merged = doc.mergeIntersection(def)
        if (merged !== def && isStructure(merged)) {
          addToFlatMap(flatMap, path, { def: merged, doc, optional, propNode, intermediate: true })
          walkStructure(doc, merged as SemanticStructureNode, path, optional, flatMap, stack, options)
        } else {
          addToFlatMap(flatMap, path, { def, doc, optional, propNode })
        }
      } else if (group.op === '|') {
        // Union: check branches for complexity
        const branches = group.unwrap()
        let hasComplexBranch = false
        let hasLeafBranch = false
        for (const branch of branches) {
          const resolved = resolveNode(doc, branch)
          if (resolved && isComplexNode(resolved.def)) {
            hasComplexBranch = true
          } else {
            hasLeafBranch = true
          }
        }
        if (hasComplexBranch) {
          // Has at least one complex branch — recurse all branches for sub-paths
          if (hasLeafBranch) {
            // Mixed union (some primitive, some complex) — add as leaf (primitive branches usable in $eq)
            addToFlatMap(flatMap, path, { def, doc, optional, propNode })
          } else {
            // All complex — intermediate, typed as never
            addToFlatMap(flatMap, path, { def, doc, optional, propNode, intermediate: true })
          }
          for (const branch of branches) {
            const resolved = resolveNode(doc, branch)
            if (resolved) {
              walkBranch(resolved.doc, resolved.def, path, optional, flatMap, stack, options)
            }
          }
        } else {
          // All branches are leaves — add as leaf
          addToFlatMap(flatMap, path, { def, doc, optional, propNode })
        }
      } else {
        // Tuple or other
        addToFlatMap(flatMap, path, { def, doc, optional, propNode })
      }
    } else {
      // Primitive, const, resolved ref — leaf
      addToFlatMap(flatMap, path, { def, doc, optional, propNode })
    }
  } finally {
    stack.delete(def) // allow revisiting from different paths
  }
}

function walkArrayElement(
  doc: AtscriptDoc,
  arrayNode: SemanticArrayNode,
  prefix: string,
  parentOptional: boolean,
  flatMap: Map<string, TFlatFieldDescriptor>,
  stack: Set<SemanticNode>,
  options?: TFlattenOptions
) {
  const elementDef = arrayNode.getDefinition()
  if (!elementDef) {
    return
  }

  const resolved = resolveNode(doc, elementDef)
  if (!resolved) {
    return
  }

  walkBranch(resolved.doc, resolved.def, prefix, parentOptional, flatMap, stack, options)
}

/**
 * Walks a branch (union branch or array element) to collect sub-paths.
 * Does NOT add an entry for the branch itself — the parent already did that.
 */
function walkBranch(
  doc: AtscriptDoc,
  def: SemanticNode,
  prefix: string,
  parentOptional: boolean,
  flatMap: Map<string, TFlatFieldDescriptor>,
  stack: Set<SemanticNode>,
  options?: TFlattenOptions
) {
  if (isStructure(def)) {
    walkStructure(doc, def as SemanticStructureNode, prefix, parentOptional, flatMap, stack, options)
  } else if (isArray(def)) {
    walkArrayElement(doc, def as SemanticArrayNode, prefix, parentOptional, flatMap, stack, options)
  } else if (isGroup(def) && def.entity !== 'structure') {
    const group = def as SemanticGroup
    if (group.op === '&') {
      const merged = doc.mergeIntersection(def)
      if (isStructure(merged)) {
        walkStructure(doc, merged as SemanticStructureNode, prefix, parentOptional, flatMap, stack, options)
      }
    } else if (group.op === '|') {
      for (const branch of group.unwrap()) {
        const resolved = resolveNode(doc, branch)
        if (resolved) {
          walkBranch(resolved.doc, resolved.def, prefix, parentOptional, flatMap, stack, options)
        }
      }
    }
  }
  // Primitives/consts: no further sub-paths
}

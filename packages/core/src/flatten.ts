import type { AtscriptDoc, TUnwound } from './document'
import { unwoundFields } from './document'
import {
  isArray,
  isGroup,
  isInterface,
  isPhantomPrimitive,
  isRef,
  isStructure,
} from './parser/nodes'
import type { SemanticInterfaceNode } from './parser/nodes/interface-node'
import type { SemanticPropNode } from './parser/nodes/prop-node'
import type { SemanticNode } from './parser/nodes/semantic-node'
import type { SemanticStructureNode } from './parser/nodes/structure-node'

/** Annotations that make a prop a navigation property (a relation, not a stored field). */
export const NAV_PROP_ANNOTATIONS = ['db.rel.to', 'db.rel.from', 'db.rel.via'] as const

export function hasNavPropAnnotation(prop: SemanticPropNode): boolean {
  if (!prop.annotations) {
    return false
  }
  return prop.annotations.some(a => NAV_PROP_ANNOTATIONS.some(name => name === a.name))
}

/**
 * Annotations that make an interface a DB entity — a table, or a managed view.
 * `@db.view.for` alone declares a managed view (`@db.view`, the name, is
 * optional), so codegen (`__flat` / `__ownProps`), the `asc db sync` inventory
 * and `DbSpace.get()` in `@atscript/db` all share this one rule.
 */
export const DB_ENTITY_ANNOTATIONS = ['db.table', 'db.view', 'db.view.for'] as const

/** AST side of {@link DB_ENTITY_ANNOTATIONS}: whether a node carries a DB-entity annotation. */
export function isDbEntityNode(node: SemanticNode): boolean {
  return !!node.annotations?.some(a => DB_ENTITY_ANNOTATIONS.some(name => name === a.name))
}

/**
 * Whether a type path's resolution (`AtscriptDoc.unwindType`) is phantom: every field it names
 * is the `phantom` primitive (through a union, several fields: all of them; a mix is a compile
 * error).
 */
export function isPhantomPath(unwound?: TUnwound): boolean {
  const fields = unwoundFields(unwound)
  return fields.length > 0 && fields.every(f => isPhantomPrimitive(f.def))
}

/**
 * Whether `def` (a prop's type) is phantom: the `phantom` primitive, or a reference to it (a
 * type path: see {@link isPhantomPath}).
 */
export function isPhantomNode(doc: AtscriptDoc, def?: SemanticNode): boolean {
  return isPhantomPrimitive(def) || (isRef(def) && isPhantomPath(doc.unwindRef(def)))
}

/** A definition written at a path of a type (see {@link flatDefinitions}). */
export interface TFlatDefinition {
  /** The prop at the path's last step. */
  prop: SemanticPropNode
  /** Its type, resolved through references and declarations (an interface: its structure). */
  def: SemanticNode
  /** The document `def` is read in. */
  doc: AtscriptDoc
}

/**
 * The written definitions at the dot-separated paths of interface `node` (for the TS types of
 * its flattened paths; the paths themselves are the runtime flatten's, `flattenAnnotatedType`):
 * the props a path's last step names in every structure its prefix reaches — through
 * references, aliases, `extends`, merges (`&`), unions (`| null` too), arrays, tuples and chain
 * references. Several when branches (or merge members) reach different props at one path.
 * A path is looked up step by step from its longest prefix looked up already (memoized).
 */
export function flatDefinitions(
  doc: AtscriptDoc,
  node: SemanticInterfaceNode
): (path: string) => TFlatDefinition[] {
  const root = resolveDefinition(doc, node)
  const memo = new Map<string, TFlatDefinition[]>()
  return path => {
    // (the longest prefix looked up already: `at` its end, -1 none)
    let at = path.length
    let found = memo.get(path)
    while (!found && at > 0) {
      at = path.lastIndexOf('.', at - 1)
      found = at > 0 ? memo.get(path.slice(0, at)) : undefined
    }
    let defs: Array<{ def: SemanticNode; doc: AtscriptDoc }> = found ?? (root ? [root] : [])
    for (let start = at + 1; start <= path.length; ) {
      const dot = path.indexOf('.', start)
      const end = dot < 0 ? path.length : dot
      const step = propsNamed(defs, path.slice(start, end))
      memo.set(path.slice(0, end), step)
      defs = step
      start = end + 1
    }
    return defs as TFlatDefinition[]
  }
}

/** The props `name` names in the structures `defs` hold (each prop once). */
function propsNamed(
  defs: Array<{ def: SemanticNode; doc: AtscriptDoc }>,
  name: string
): TFlatDefinition[] {
  const out: TFlatDefinition[] = []
  const seen = new Set<SemanticPropNode>()
  for (const parent of defs) {
    for (const { struct, doc } of structuresOf(parent.def, parent.doc)) {
      const prop = struct.props.get(name)
      if (prop && !seen.has(prop)) {
        seen.add(prop)
        const written = prop.getDefinition()
        const resolved = written ? resolveDefinition(doc, written) : undefined
        out.push({ prop, def: resolved?.def ?? written ?? prop, doc: resolved?.doc ?? doc })
      }
    }
  }
  return out
}

/** `def` through references and declarations (an interface: its structure). */
function resolveDefinition(
  doc: AtscriptDoc,
  def: SemanticNode
): { def: SemanticNode; doc: AtscriptDoc } | undefined {
  for (const seen = new Set<SemanticNode>(); !seen.has(def); ) {
    seen.add(def)
    if (isRef(def)) {
      const target = doc.declRef(def)
      if (!target?.def) {
        return undefined
      }
      ;({ def, doc } = target)
    } else if (isInterface(def)) {
      const struct = (def.hasExtends && doc.resolveInterfaceExtends(def)) || def.getDefinition()
      return struct ? { def: struct, doc } : undefined
    } else {
      return { def, doc }
    }
  }
  return undefined
}

/** The structures `def` holds at its own level: itself, its elements, branches and merges. */
function structuresOf(
  def: SemanticNode,
  doc: AtscriptDoc
): Array<{ struct: SemanticStructureNode; doc: AtscriptDoc }> {
  const out: Array<{ struct: SemanticStructureNode; doc: AtscriptDoc }> = []
  const seen = new Set<SemanticNode>()
  const pending: Array<{ def: SemanticNode; doc: AtscriptDoc }> = [{ def, doc }]
  for (let next = pending.pop(); next; next = pending.pop()) {
    const resolved = resolveDefinition(next.doc, next.def)
    if (!resolved || seen.has(resolved.def)) {
      continue
    }
    seen.add(resolved.def)
    const node = resolved.def
    if (isStructure(node)) {
      out.push({ struct: node, doc: resolved.doc })
    } else if (isArray(node)) {
      const element = node.getDefinition()
      if (element) {
        pending.push({ def: element, doc: resolved.doc })
      }
    } else if (isGroup(node)) {
      // (a merge: the structure it merges into — or a union of such —, its members when it does
      // not merge; a union, a tuple: its branches, items)
      const merged = node.op === '&' ? resolved.doc.mergeIntersection(node) : node
      const items = merged === node ? node.unwrap() : [merged]
      for (let i = items.length - 1; i >= 0; i--) {
        pending.push({ def: items[i], doc: resolved.doc })
      }
    }
  }
  return out
}

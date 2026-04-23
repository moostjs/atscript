import type { AtscriptDoc } from '../document'
import {
  isArray,
  isInterface,
  isRef,
  isStructure,
  type SemanticInterfaceNode,
  type SemanticNode,
  type SemanticPropNode,
  type SemanticQueryFieldRefNode,
} from '../parser/nodes'
import type { Token } from '../parser/token'

export interface TQueryScope {
  allowedTypes: string[]
  unqualifiedTarget: string | null
}

/**
 * Determine the allowed type scope for a query arg token
 * by reading sibling annotations on the owner node.
 */
export function getQueryScope(queryArgToken: Token, doc: AtscriptDoc): TQueryScope | undefined {
  const annotationRef = queryArgToken.annotationRef
  if (!annotationRef) {
    return undefined
  }
  const owner = queryArgToken.parentNode
  if (!owner) {
    return undefined
  }

  const annotationName = annotationRef.text.slice(1) // remove '@'

  if (annotationName === 'db.view.filter') {
    return getViewFilterScope(owner)
  }

  if (annotationName === 'db.view.joins') {
    return getViewJoinsScope(owner, queryArgToken)
  }

  if (annotationName === 'db.rel.filter') {
    return getRelFilterScope(owner)
  }

  return undefined
}

function getViewFilterScope(owner: SemanticNode): TQueryScope | undefined {
  const forAnnotations = owner.annotations?.filter(a => a.name === 'db.view.for')
  const entryTypeName = forAnnotations?.[0]?.args[0]?.text
  if (!entryTypeName) {
    return undefined
  }

  const allowedTypes = [entryTypeName]
  const joinsAnnotations = owner.annotations?.filter(a => a.name === 'db.view.joins')
  if (joinsAnnotations) {
    for (const join of joinsAnnotations) {
      if (join.args[0]) {
        allowedTypes.push(join.args[0].text)
      }
    }
  }

  return { allowedTypes, unqualifiedTarget: entryTypeName }
}

function getViewJoinsScope(owner: SemanticNode, queryArgToken: Token): TQueryScope | undefined {
  const forAnnotations = owner.annotations?.filter(a => a.name === 'db.view.for')
  const entryTypeName = forAnnotations?.[0]?.args[0]?.text
  if (!entryTypeName) {
    return undefined
  }

  // Find the join target from the same annotation instance
  // The queryArgToken is arg[1] (condition), arg[0] is the join target ref
  const joinsAnnotation = owner.annotations?.find(
    a => a.name === 'db.view.joins' && a.args.includes(queryArgToken)
  )
  const joinTargetName = joinsAnnotation?.args[0]?.text
  if (!joinTargetName) {
    return undefined
  }

  return { allowedTypes: [joinTargetName, entryTypeName], unqualifiedTarget: entryTypeName }
}

function getRelFilterScope(owner: SemanticNode): TQueryScope | undefined {
  // owner is a prop node with @db.rel.to/@db.rel.from/@db.rel.via
  let def = owner.getDefinition()
  if (isArray(def)) {
    def = def?.getDefinition()
  }
  if (!isRef(def)) {
    return undefined
  }

  const targetTypeName = def.id!
  const allowedTypes = [targetTypeName]

  // For @db.rel.via, also allow junction type
  const viaAnnotation = owner.annotations?.find(a => a.name === 'db.rel.via')
  if (viaAnnotation?.args[0]) {
    allowedTypes.push(viaAnnotation.args[0].text)
  }

  return { allowedTypes, unqualifiedTarget: targetTypeName }
}

/**
 * Resolve a query field ref node to a property definition.
 */
export function resolveQueryFieldRef(
  fieldRefNode: SemanticQueryFieldRefNode,
  doc: AtscriptDoc,
  scope: TQueryScope
): { targetUri: string; doc: AtscriptDoc; prop?: SemanticPropNode } | undefined {
  const typeName = fieldRefNode.typeRef?.text ?? scope.unqualifiedTarget
  if (!typeName) {
    return undefined
  }

  const fieldPath = fieldRefNode.fieldRef.text
  const chain = fieldPath.split('.')

  // Resolve to the parent type (all chain steps except the last)
  // to get the doc where the final prop is defined
  const parentChain = chain.slice(0, -1)
  const parentUnwound = doc.unwindType(typeName, parentChain)
  if (!parentUnwound?.def) {
    return undefined
  }

  // Then resolve with the full chain to find the prop
  const unwound = doc.unwindType(typeName, chain)
  if (!unwound?.node) {
    return undefined
  }

  const prop = unwound.node as SemanticPropNode | undefined
  // Use the parent type's doc (where the prop is defined), not unwound.doc
  // which follows through the prop's type to a foreign doc
  return {
    targetUri: parentUnwound.doc.id,
    doc: parentUnwound.doc,
    prop,
  }
}

/**
 * Get fields available for a type (resolving extends/intersections).
 */
export function getFieldsForType(doc: AtscriptDoc, typeName: string): SemanticPropNode[] {
  const unwound = doc.unwindType(typeName)
  if (!unwound?.def) {
    return []
  }

  let def: SemanticNode = doc.mergeIntersection(unwound.def)
  if (isInterface(def)) {
    const resolved = doc.resolveInterfaceExtends(def as SemanticInterfaceNode)
    if (resolved) {
      def = resolved
    } else {
      def = def.getDefinition() || def
    }
  }
  if (isStructure(def) || isInterface(def)) {
    return Array.from(def.props.values())
  }
  return []
}

/**
 * Get completion scope data for a query context.
 */
export function getQueryCompletionScope(
  queryArgToken: Token,
  doc: AtscriptDoc
):
  | {
      typeNames: string[]
      unqualifiedTarget: string | null
      getFields: (typeName: string) => SemanticPropNode[]
    }
  | undefined {
  const scope = getQueryScope(queryArgToken, doc)
  if (!scope) {
    return undefined
  }

  return {
    typeNames: scope.allowedTypes,
    unqualifiedTarget: scope.unqualifiedTarget,
    getFields: (typeName: string) => getFieldsForType(doc, typeName),
  }
}

// Operators and keywords used for cursor context analysis
const SYMBOLIC_OPS = new Set(['=', '!=', '>', '>=', '<', '<='])
const KEYWORD_OPS = new Set(['in', 'matches', 'exists'])
const LOGICAL_KEYWORDS = new Set(['and', 'or', 'not'])
const VALUE_KEYWORDS = new Set(['true', 'false', 'null', 'undefined'])

export type TQueryCursorContext =
  | { type: 'field-start' }
  | { type: 'after-dot'; typeName: string }
  | { type: 'after-field' }
  | { type: 'after-operator' }
  | { type: 'after-comparison' }

/**
 * Analyze text inside backticks up to cursor position
 * to determine what kind of completions to offer.
 * Uses lightweight text scanning, not full AST parsing,
 * so it works on incomplete/mid-typing input.
 */
export function analyzeQueryCursorContext(textBeforeCursor: string): TQueryCursorContext {
  const trimmed = textBeforeCursor.trimEnd()
  // If the user is mid-typing (no trailing whitespace), analyze what they're typing in context
  const hasTrailingSpace = textBeforeCursor.length > trimmed.length

  // Empty or whitespace-only → field start
  if (trimmed.length === 0) {
    return { type: 'field-start' }
  }

  // Ends with '.' → after-dot, find the type name before it
  if (trimmed.endsWith('.')) {
    const before = trimmed.slice(0, -1).trimEnd()
    const match = /(\w+)$/u.exec(before)
    if (match) {
      return { type: 'after-dot', typeName: match[1] }
    }
    return { type: 'field-start' }
  }

  // Tokenize: extract the last meaningful token
  const tokens = tokenizeQueryText(trimmed)
  if (tokens.length === 0) {
    return { type: 'field-start' }
  }

  const last = tokens[tokens.length - 1]

  // After logical keyword or opening paren → field start
  if (LOGICAL_KEYWORDS.has(last) || last === '(') {
    return { type: 'field-start' }
  }

  // After symbolic operator → after operator
  if (SYMBOLIC_OPS.has(last)) {
    return { type: 'after-operator' }
  }

  // After keyword operator → after operator
  if (last === 'in' || last === 'matches') {
    return { type: 'after-operator' }
  }

  // After 'exists' or 'not exists' → after comparison (complete expression)
  if (last === 'exists') {
    return { type: 'after-comparison' }
  }

  // After a value (string literal, number, keyword value) → after comparison
  if (VALUE_KEYWORDS.has(last)) {
    return { type: 'after-comparison' }
  }
  // Check if last token looks like a quoted string or number
  if (/^['"]/.test(last) || /^\d/.test(last)) {
    return { type: 'after-comparison' }
  }

  // After an identifier — could be a field ref or a type name
  // Check if previous token is an operator → this is a value/field, so after-comparison
  if (tokens.length >= 2) {
    const prev = tokens[tokens.length - 2]
    if (SYMBOLIC_OPS.has(prev) || KEYWORD_OPS.has(prev)) {
      return { type: 'after-comparison' }
    }
  }

  // Default: last token is an identifier (field ref)
  if (/^\w+$/u.test(last)) {
    // If user is mid-typing (no space after), offer field completions so VSCode can filter
    if (!hasTrailingSpace) {
      return { type: 'field-start' }
    }
    return { type: 'after-field' }
  }

  return { type: 'field-start' }
}

/**
 * Simple tokenizer for query text — splits into identifiers, operators, and punctuation.
 * Does NOT need to handle all edge cases; just enough for cursor context analysis.
 */
function tokenizeQueryText(text: string): string[] {
  const tokens: string[] = []
  let i = 0
  while (i < text.length) {
    // Skip whitespace
    if (/\s/.test(text[i])) {
      i++
      continue
    }

    // String literal (skip over it as a single token)
    if (text[i] === "'" || text[i] === '"') {
      const quote = text[i]
      let j = i + 1
      while (j < text.length && text[j] !== quote) {
        if (text[j] === '\\') {
          j++
        }
        j++
      }
      tokens.push(text.slice(i, j + 1))
      i = j + 1
      continue
    }

    // Multi-char operators: !=, >=, <=
    if (i + 1 < text.length) {
      const two = text.slice(i, i + 2)
      if (two === '!=' || two === '>=' || two === '<=') {
        tokens.push(two)
        i += 2
        continue
      }
    }

    // Single-char operators/punctuation
    if ('=><(),'.includes(text[i])) {
      tokens.push(text[i])
      i++
      continue
    }

    // Dot — treat as punctuation
    if (text[i] === '.') {
      tokens.push('.')
      i++
      continue
    }

    // Identifier or number
    if (/[\w]/u.test(text[i])) {
      let j = i
      while (j < text.length && /[\w]/u.test(text[j])) {
        j++
      }
      tokens.push(text.slice(i, j))
      i = j
      continue
    }

    // Unknown char — skip
    i++
  }
  return tokens
}

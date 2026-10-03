import type {
  TAnnotationArgument,
  TBacktickArgKind,
  TQueryScope,
} from '../annotations/annotation-spec'
import type { AtscriptDoc } from '../document'
import {
  isInterface,
  isQueryFieldRef,
  isStructure,
  type SemanticInterfaceNode,
  type SemanticNode,
  type SemanticPropNode,
  type SemanticQueryFieldRefNode,
} from '../parser/nodes'
import { BACKTICK_ARG_VOCABULARY, ORDER_DIRECTIONS } from '../parser/pipes/expr.pipe'
import { SYMBOLIC_OPS, VALUE_KEYWORDS } from '../parser/pipes/query.pipe'
import type { Token } from '../parser/token'
import { getLegacyDbQueryScope } from './legacy-db-query-scope'

/** A field reference resolved to the property it names. */
export interface TFieldRefTarget {
  /** Type the field path was resolved against. */
  typeName: string
  /** Range of the referencing text: a query field ref, or one segment of a field-path string. */
  range: Token['range']
  prop: SemanticPropNode
  /** Document that declares `prop`. */
  doc: AtscriptDoc
}

interface TFieldPathSegment {
  /** Field path up to and including this segment. */
  path: string
  range: Token['range']
}

function getArgSpec(argToken: Token, doc: AtscriptDoc): TAnnotationArgument | undefined {
  const annotationRef = argToken.annotationRef
  if (!annotationRef || typeof argToken.index !== 'number') {
    return undefined
  }
  return doc.resolveAnnotation(annotationRef.text.slice(1))?.arguments[argToken.index]
}

/**
 * Field scope of an annotation argument: the answer of the argument spec's `fieldScope`
 * hook when it declares one, otherwise the deprecated built-in `@db.*` query rules.
 */
export function getQueryScope(argToken: Token, doc: AtscriptDoc): TQueryScope | undefined {
  const argSpec = getArgSpec(argToken, doc)
  return argSpec?.fieldScope ? argSpec.fieldScope(argToken, doc) : getLegacyDbQueryScope(argToken)
}

/**
 * Type a field-path `string` argument names a field of: the `unqualifiedTarget` of the
 * argument spec's `fieldScope`. `undefined` for any other token.
 */
function getFieldPathTarget(argToken: Token, doc: AtscriptDoc): string | undefined {
  if (argToken.type !== 'text') {
    return undefined
  }
  const argSpec = getArgSpec(argToken, doc)
  if (argSpec?.type !== 'string' || !argSpec.fieldScope) {
    return undefined
  }
  return argSpec.fieldScope(argToken, doc)?.unqualifiedTarget ?? undefined
}

/**
 * Resolve a (possibly dotted) field path of a type to the property it names and the
 * document that declares that property.
 */
function resolveFieldPath(
  doc: AtscriptDoc,
  typeName: string,
  segment: TFieldPathSegment
): TFieldRefTarget | undefined {
  const chain = segment.path.split('.')
  const [name] = chain.splice(-1)
  // The type that declares the last segment, and the document it lives in
  const parent = doc.unwindType(typeName, chain)
  if (!parent || !(isStructure(parent.def) || isInterface(parent.def))) {
    return undefined
  }
  const prop = parent.def.props.get(name)
  return prop && { typeName, range: segment.range, prop, doc: parent.doc }
}

/**
 * Segments of a field-path string argument (`'address.city'` → `address`, `city`), with
 * ranges that exclude the quotes. A string spanning several lines is a single segment.
 */
function fieldPathSegments(argToken: Token): TFieldPathSegment[] {
  const { text, range } = argToken
  if (range.start.line !== range.end.line) {
    return [{ path: text, range }]
  }
  const line = range.start.line
  // The token range includes the opening quote
  const contentStart = range.start.character + 1
  const segments: TFieldPathSegment[] = []
  let start = 0
  for (const part of text.split('.')) {
    const end = start + part.length
    segments.push({
      path: text.slice(0, end),
      range: {
        start: { line, character: contentStart + start },
        end: { line, character: contentStart + end },
      },
    })
    start = end + 1
  }
  return segments
}

/** The segment under `character`, or the last segment when `character` is omitted. */
function fieldPathSegmentAt(argToken: Token, character?: number): TFieldPathSegment {
  const segments = fieldPathSegments(argToken)
  const atCursor =
    character === undefined ? undefined : segments.find(s => s.range.end.character >= character)
  return atCursor ?? segments[segments.length - 1]
}

/**
 * Resolve a field reference token to the property it names:
 * - a field ref inside a `query` argument (`amount`, `Customer.name` in backticks);
 * - a `string` argument whose spec declares `fieldScope`: a (dotted) field path of the
 *   scope's `unqualifiedTarget`. With `character` (a cursor column), the path resolves
 *   only up to the segment under the cursor — `'address.city'` with the cursor on
 *   `address` resolves `address` — and `range` is that segment's range.
 *
 * Returns `undefined` for any other token, or when the scope or the path does not resolve.
 */
export function resolveFieldRefAt(
  token: Token,
  doc: AtscriptDoc,
  character?: number
): TFieldRefTarget | undefined {
  if (isQueryFieldRef(token.parentNode)) {
    const { fieldRef, typeRef, queryArgToken } = token.parentNode
    const scope =
      token === fieldRef && queryArgToken ? getQueryScope(queryArgToken, doc) : undefined
    const typeName = scope && (typeRef?.text ?? scope.unqualifiedTarget)
    return typeName
      ? resolveFieldPath(doc, typeName, { path: token.text, range: token.range })
      : undefined
  }
  const typeName = getFieldPathTarget(token, doc)
  return typeName
    ? resolveFieldPath(doc, typeName, fieldPathSegmentAt(token, character))
    : undefined
}

/**
 * Resolve the segments named `fieldName` of a field-path `string` argument
 * (`'address.city'` has the segments `address` and `city`). Supports find-references.
 */
export function resolveFieldPathArgSegments(
  argToken: Token,
  doc: AtscriptDoc,
  fieldName: string
): TFieldRefTarget[] {
  const segments = fieldPathSegments(argToken).filter(
    s => s.path === fieldName || s.path.endsWith(`.${fieldName}`)
  )
  const typeName = segments.length > 0 ? getFieldPathTarget(argToken, doc) : undefined
  if (!typeName) {
    return []
  }
  const targets: TFieldRefTarget[] = []
  for (const segment of segments) {
    const target = resolveFieldPath(doc, typeName, segment)
    if (target) {
      targets.push(target)
    }
  }
  return targets
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
  const { fieldRef } = fieldRefNode
  const resolved = typeName
    ? resolveFieldPath(doc, typeName, { path: fieldRef.text, range: fieldRef.range })
    : undefined
  return resolved && { targetUri: resolved.doc.id, doc: resolved.doc, prop: resolved.prop }
}

/**
 * Get fields available for a type (resolving extends/intersections).
 * With `chain`, returns the fields of the nested object that field path leads to.
 */
export function getFieldsForType(
  doc: AtscriptDoc,
  typeName: string,
  chain: string[] = []
): SemanticPropNode[] {
  const unwound = doc.unwindType(typeName, chain)
  if (!unwound?.def) {
    return []
  }
  // Resolve in the document that declares the type (it may be imported)
  let def: SemanticNode = unwound.doc.mergeIntersection(unwound.def)
  if (isInterface(def)) {
    const resolved = unwound.doc.resolveInterfaceExtends(def as SemanticInterfaceNode)
    def = resolved || def.getDefinition() || def
  }
  if (isStructure(def) || isInterface(def)) {
    return Array.from(def.props.values())
  }
  return []
}

/**
 * Completion scope of a field-path `string` argument (spec declares `fieldScope`) at the
 * cursor column `character`: the fields of the level being typed — `'address.ci'` offers
 * the fields of `address` (`chain` = `['address']`).
 */
export function getFieldPathCompletionScope(
  argToken: Token,
  doc: AtscriptDoc,
  character: number
): { typeName: string; chain: string[]; fields: SemanticPropNode[] } | undefined {
  const typeName = getFieldPathTarget(argToken, doc)
  if (!typeName) {
    return undefined
  }
  const chain = fieldPathSegmentAt(argToken, character).path.split('.').slice(0, -1)
  return { typeName, chain, fields: getFieldsForType(doc, typeName, chain) }
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
const KEYWORD_OPS = new Set(['in', 'matches', 'exists'])
const LOGICAL_KEYWORDS = new Set(['and', 'or', 'not'])

export type TQueryCursorContext =
  | { type: 'field-start' }
  | { type: 'after-dot'; typeName: string }
  | { type: 'after-field' }
  | { type: 'after-operator' }
  | { type: 'after-comparison' }
  /** `expr`: after a field, a number or `)` — an arithmetic operator follows. */
  | { type: 'after-operand' }
  /** `order`: after an order key — `asc`, `desc` or `,` follows. */
  | { type: 'after-order-key' }
  /** `order`: after `asc` / `desc` — `,` follows. */
  | { type: 'after-order-direction' }

/**
 * Analyze text inside backticks up to cursor position
 * to determine what kind of completions to offer.
 * Uses lightweight text scanning, not full AST parsing,
 * so it works on incomplete/mid-typing input.
 *
 * `mode` selects the grammar of the argument (default `query`).
 */
export function analyzeQueryCursorContext(
  textBeforeCursor: string,
  mode: TBacktickArgKind = 'query'
): TQueryCursorContext {
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

  if (mode !== 'query') {
    return analyzeArgCursorContext(trimmed, hasTrailingSpace, mode)
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

const ARITHMETIC_OPS = new Set<string>(BACKTICK_ARG_VOCABULARY.arithmeticOps)

/** An order key (an identifier other than `asc` / `desc`). */
function isOrderKey(token: string | undefined): boolean {
  return token !== undefined && /^\w+$/u.test(token) && !ORDER_DIRECTIONS.has(token)
}

/**
 * Cursor context inside an `expr` or `order` argument — `trimmed` is the
 * non-empty text before the cursor that does not end with `.`.
 */
function analyzeArgCursorContext(
  trimmed: string,
  hasTrailingSpace: boolean,
  mode: 'expr' | 'order'
): TQueryCursorContext {
  const tokens = tokenizeQueryText(trimmed, true)
  const last = tokens[tokens.length - 1]
  if (last === undefined || last === ',' || last === '(' || ARITHMETIC_OPS.has(last)) {
    return { type: 'field-start' }
  }
  if (mode === 'order') {
    if (!/^\w+$/u.test(last)) {
      return { type: 'after-order-direction' }
    }
    if (!hasTrailingSpace) {
      // An identifier typed right after a key is a direction being typed
      return isOrderKey(tokens[tokens.length - 2])
        ? { type: 'after-order-key' }
        : { type: 'field-start' }
    }
    return isOrderKey(last) ? { type: 'after-order-key' } : { type: 'after-order-direction' }
  }
  // expr: an identifier being typed still offers fields (the editor filters them)
  if (/^[a-z_$]\w*$/iu.test(last) && !hasTrailingSpace) {
    return { type: 'field-start' }
  }
  return { type: 'after-operand' }
}

/**
 * Simple tokenizer for query text — splits into identifiers, operators, and punctuation.
 * Does NOT need to handle all edge cases; just enough for cursor context analysis.
 * With `arithmetic`, `+ - * /` are tokens too (otherwise they are skipped).
 */
function tokenizeQueryText(text: string, arithmetic = false): string[] {
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
    if ('=><(),'.includes(text[i]) || (arithmetic && ARITHMETIC_OPS.has(text[i]))) {
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

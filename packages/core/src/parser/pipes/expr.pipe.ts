import type { TBacktickArgKind } from '../../annotations/annotation-spec'
import type { TLexicalToken } from '../../tokenizer/types'
import { NodeIterator } from '../iterator'
import {
  SemanticExprBinaryNode,
  SemanticExprCallNode,
  SemanticExprNode,
  SemanticExprNumberNode,
  SemanticExprUnaryNode,
  SemanticOrderNode,
  type SemanticExprItemNode,
  type TExprBinaryOperator,
  type TOrderItem,
} from '../nodes/query-nodes'
import { Token } from '../token'
import type { TMessages } from '../types'
import { parseFieldRef, parseQueryExpression, pushError, VALUE_KEYWORDS } from './query.pipe'

/**
 * Parse a backtick annotation argument as the given kind and attach the tree to
 * the token (`queryNode`, `exprNode` or `orderNode`). Returns the diagnostics.
 */
export function parseBacktickArg(argToken: Token, kind: TBacktickArgKind): TMessages {
  const messages: TMessages = []
  const ni = new NodeIterator(
    argToken.children,
    messages,
    new Map(),
    {},
    argToken.lexicalToken,
    0
  ).update()
  switch (kind) {
    case 'expr': {
      argToken.exprNode = parseExprExpression(ni, argToken)
      break
    }
    case 'order': {
      argToken.orderNode = parseOrderList(ni, argToken)
      break
    }
    default: {
      argToken.queryNode = parseQueryExpression(ni, argToken)
    }
  }
  return messages
}

/** Vocabulary of `expr` / `order` arguments: arithmetic operators, functions, order directions. */
export const BACKTICK_ARG_VOCABULARY = {
  arithmeticOps: ['+', '-', '*', '/'],
  functions: ['coalesce'],
  orderDirections: ['asc', 'desc'],
} as const

export const ORDER_DIRECTIONS = new Set<string>(BACKTICK_ARG_VOCABULARY.orderDirections)

// ── Arithmetic expressions ───────────────────────────────────────────────────

/**
 * Parse a backtick arithmetic expression:
 *
 * ```
 * expr     := additive
 * additive := mult (('+' | '-') mult)*
 * mult     := unary (('*' | '/') unary)*
 * unary    := '-' unary | primary
 * primary  := NUMBER | fieldRef | 'coalesce' '(' expr (',' expr)+ ')' | '(' expr ')'
 * ```
 *
 * A signed number in binary-operator position (`a -5`, `a+1`) is split into the
 * operator and an unsigned operand. Returns `undefined` when the content is empty.
 */
function parseExprExpression(ni: NodeIterator, sourceToken: Token): SemanticExprNode | undefined {
  if (!ni.$) {
    pushError(ni, 'Empty expression')
    return undefined
  }
  const expr = parseAdditive(ni)
  if (!expr) {
    return undefined
  }
  if (ni.$) {
    pushError(ni, `Unexpected token in expression: "${ni.$.text}"`)
  }
  const node = new SemanticExprNode()
  node.expression = expr
  node.sourceToken = sourceToken
  return node
}

function isPunct(t: TLexicalToken | undefined, chars: string): t is TLexicalToken {
  return t?.type === 'punctuation' && t.text.length === 1 && chars.includes(t.text)
}

function isParenBlock(t: TLexicalToken | undefined): t is TLexicalToken {
  return t?.type === 'block' && t.text === '('
}

/** A number token whose text carries a sign (`-5`, `+1`). */
function signedNumber(t: TLexicalToken | undefined): '+' | '-' | undefined {
  if (t?.type !== 'number') {
    return undefined
  }
  const c = t.text.charAt(0)
  return c === '-' || c === '+' ? c : undefined
}

function binary(
  op: TExprBinaryOperator,
  left: SemanticExprItemNode,
  right: SemanticExprItemNode
): SemanticExprBinaryNode {
  const node = new SemanticExprBinaryNode()
  node.op = op
  node.left = left
  node.right = right
  return node
}

function parseAdditive(ni: NodeIterator): SemanticExprItemNode | undefined {
  let left = parseMult(ni)
  if (!left) {
    return undefined
  }
  for (;;) {
    // `a - 5`, or `a -5` / `a+1`: the sign of a number token is the binary operator
    const punct = isPunct(ni.$, '+-')
    const op = (punct ? ni.$?.text : signedNumber(ni.$)) as TExprBinaryOperator | undefined
    if (!op) {
      break
    }
    if (punct) {
      ni.move()
    }
    const right = parseMult(ni, !punct)
    if (!right) {
      pushError(ni, `Expected operand after "${op}"`)
      return undefined
    }
    left = binary(op, left, right)
  }
  return left
}

function parseMult(ni: NodeIterator, unsignFirst = false): SemanticExprItemNode | undefined {
  let left = parseUnary(ni, unsignFirst)
  if (!left) {
    return undefined
  }
  for (let t = ni.$; isPunct(t, '*/'); t = ni.$) {
    const op = t.text as TExprBinaryOperator
    ni.move()
    const right = parseUnary(ni)
    if (!right) {
      pushError(ni, `Expected operand after "${op}"`)
      return undefined
    }
    left = binary(op, left, right)
  }
  return left
}

function parseUnary(ni: NodeIterator, unsign = false): SemanticExprItemNode | undefined {
  if (!unsign && isPunct(ni.$, '-')) {
    ni.move()
    const operand = parseUnary(ni)
    if (!operand) {
      pushError(ni, 'Expected operand after "-"')
      return undefined
    }
    const node = new SemanticExprUnaryNode()
    node.operand = operand
    return node
  }
  return parsePrimary(ni, unsign)
}

function parsePrimary(ni: NodeIterator, unsign = false): SemanticExprItemNode | undefined {
  const t = ni.$
  if (!t) {
    pushError(ni, 'Expected operand')
    return undefined
  }

  if (t.type === 'number') {
    return parseNumber(ni, t, unsign)
  }

  if (isParenBlock(t)) {
    const subNi = ni.fork(t.children || [])
    ni.move()
    if (!subNi.$) {
      pushError(subNi, 'Empty parenthesized expression')
      return undefined
    }
    const expr = parseAdditive(subNi)
    if (expr && subNi.$) {
      pushError(subNi, `Unexpected token in parenthesized expression: "${subNi.$.text}"`)
    }
    return expr
  }

  if (t.type === 'identifier') {
    if (VALUE_KEYWORDS.has(t.text)) {
      pushError(ni, `"${t.text}" is not allowed in an arithmetic expression`)
      return undefined
    }
    if (t.text === 'coalesce' && isParenBlock(ni.next().$)) {
      ni.move()
      return parseCoalesce(ni)
    }
    return parseFieldRef(ni)
  }

  pushError(ni, `Unexpected token in expression: "${t.text}"`)
  return undefined
}

/** Why a number literal cannot be used in an expression (or `undefined` when it can). */
function numberLiteralProblem(text: string, value: number): string | undefined {
  if (!Number.isFinite(value)) {
    return 'is out of range'
  }
  // a non-zero mantissa that parses to 0 (`1e-400`)
  if (value === 0 && /[1-9]/.test(text.replace(/[eE].*$/, ''))) {
    return 'underflows to 0'
  }
  if (Math.abs(value) > Number.MAX_SAFE_INTEGER) {
    return 'exceeds the safe integer range (±2^53 - 1)'
  }
  return undefined
}

function parseNumber(
  ni: NodeIterator,
  lexical: TLexicalToken,
  unsign: boolean
): SemanticExprNumberNode | undefined {
  const token = new Token(lexical)
  const text = unsign ? token.text.slice(1) : token.text
  const value = Number(text)
  const problem = numberLiteralProblem(text, value)
  if (problem) {
    pushError(ni, `Number literal "${token.text}" ${problem}`)
    ni.move()
    return undefined
  }
  ni.move()
  const node = new SemanticExprNumberNode()
  node.valueToken = token
  node.value = value
  return node
}

function parseCoalesce(ni: NodeIterator): SemanticExprCallNode | undefined {
  // `ni.$` is the "(" block of `coalesce(…)`
  const subNi = ni.fork(ni.$?.children || [])
  ni.move()
  const args: SemanticExprItemNode[] = []
  if (subNi.$) {
    // after a `,` an operand is required (`coalesce(a,)` reports "Expected operand")
    for (;;) {
      const arg = parseAdditive(subNi)
      if (!arg) {
        return undefined
      }
      args.push(arg)
      if (!isPunct(subNi.$, ',')) {
        break
      }
      subNi.move()
    }
  }
  if (subNi.$) {
    pushError(subNi, `Unexpected token in coalesce(): "${subNi.$.text}"`)
    return undefined
  }
  if (args.length < 2) {
    pushError(subNi, 'coalesce() requires at least 2 arguments')
    return undefined
  }
  const node = new SemanticExprCallNode()
  node.args = args
  return node
}

// ── Order lists ──────────────────────────────────────────────────────────────

/**
 * Parse a backtick ordering: `key (asc|desc)? (, key (asc|desc)?)*`.
 * Returns `undefined` when the content is empty or a key does not parse.
 */
function parseOrderList(ni: NodeIterator, sourceToken: Token): SemanticOrderNode | undefined {
  if (!ni.$) {
    pushError(ni, 'Empty order list')
    return undefined
  }
  const items: TOrderItem[] = []
  for (;;) {
    const ref = parseFieldRef(ni)
    if (!ref) {
      return undefined
    }
    const item: TOrderItem = { ref, desc: false }
    if (ni.$?.type === 'identifier' && ORDER_DIRECTIONS.has(ni.$.text)) {
      item.desc = ni.$.text === 'desc'
      item.dirToken = new Token(ni.$)
      ni.move()
    }
    items.push(item)
    if (!ni.$) {
      break
    }
    if (isPunct(ni.$, ',')) {
      ni.move()
      continue
    }
    pushError(ni, `Unexpected token in order list: "${ni.$.text}" (expected "," or "asc" / "desc")`)
    return undefined
  }
  const node = new SemanticOrderNode()
  node.items = items
  node.sourceToken = sourceToken
  return node
}

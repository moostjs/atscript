import type { TLexicalToken } from '../../tokenizer/types'
import { NodeIterator } from '../iterator'
import {
  SemanticQueryComparisonNode,
  SemanticQueryFieldRefNode,
  SemanticQueryLogicalNode,
  SemanticQueryNode,
  SemanticQueryValueListNode,
  SemanticQueryValueNode,
  type SemanticQueryExprNode,
  type TQueryOperator,
} from '../nodes/query-nodes'
import { Token } from '../token'
import type { TMessages } from '../types'

const SYMBOLIC_OPS = new Set<string>(['=', '!=', '>', '>=', '<', '<='])

const VALUE_KEYWORDS = new Set<string>(['true', 'false', 'null', 'undefined'])

type TRange = TMessages[number]['range']

/**
 * Query parsing context.
 * Carries the diagnostics sink plus the range to blame when the offending
 * token has no range of its own — the enclosing query token, or the enclosing
 * "(...)" block when parsing a parenthesized sub-expression.
 */
interface TQueryCtx {
  messages: TMessages
  fallback: TRange
}

/**
 * Parse a backtick-delimited query expression from its child tokens.
 * Returns a SemanticQueryNode or undefined if the content is empty.
 */
export function parseQueryExpression(
  children: TLexicalToken[],
  messages: TMessages,
  sourceToken: Token
): SemanticQueryNode | undefined {
  if (children.length === 0) {
    return undefined
  }

  const ctx: TQueryCtx = { messages, fallback: sourceToken.range }

  const ni = new NodeIterator(children, messages)
  ni.move() // position at first token

  const expr = parseOrExpr(ni, ctx)
  if (!expr) {
    return undefined
  }

  // Check for unconsumed tokens
  if (ni.$) {
    pushError(ni, ctx, `Unexpected token in query expression: "${ni.$.text}"`)
  }

  const node = new SemanticQueryNode()
  node.expression = expr
  node.sourceToken = sourceToken
  return node
}

function parseOrExpr(ni: NodeIterator, ctx: TQueryCtx): SemanticQueryExprNode | undefined {
  const left = parseAndExpr(ni, ctx)
  if (!left) {
    return undefined
  }

  const operands: SemanticQueryExprNode[] = [left]
  while (ni.$?.type === 'identifier' && ni.$.text === 'or') {
    ni.move() // consume 'or'
    const right = parseAndExpr(ni, ctx)
    if (!right) {
      pushError(ni, ctx, 'Expected expression after "or"')
      break
    }
    operands.push(right)
  }

  if (operands.length === 1) {
    return operands[0]
  }

  const node = new SemanticQueryLogicalNode()
  node.operator = 'or'
  node.operands = operands
  return node
}

function parseAndExpr(ni: NodeIterator, ctx: TQueryCtx): SemanticQueryExprNode | undefined {
  const left = parseUnaryExpr(ni, ctx)
  if (!left) {
    return undefined
  }

  const operands: SemanticQueryExprNode[] = [left]
  while (ni.$?.type === 'identifier' && ni.$.text === 'and') {
    ni.move() // consume 'and'
    const right = parseUnaryExpr(ni, ctx)
    if (!right) {
      pushError(ni, ctx, 'Expected expression after "and"')
      break
    }
    operands.push(right)
  }

  if (operands.length === 1) {
    return operands[0]
  }

  const node = new SemanticQueryLogicalNode()
  node.operator = 'and'
  node.operands = operands
  return node
}

function parseUnaryExpr(ni: NodeIterator, ctx: TQueryCtx): SemanticQueryExprNode | undefined {
  // NOT
  if (ni.$?.type === 'identifier' && ni.$.text === 'not') {
    ni.move() // consume 'not'
    const operand = parseUnaryExpr(ni, ctx)
    if (!operand) {
      pushError(ni, ctx, 'Expected expression after "not"')
      return undefined
    }
    const node = new SemanticQueryLogicalNode()
    node.operator = 'not'
    node.operands = [operand]
    return node
  }

  // Parenthesized subexpression
  if (ni.$?.type === 'block' && ni.$.text === '(') {
    const blockToken = ni.$
    const blockChildren = blockToken.children || []
    ni.move() // consume the block token
    // Inside the parens the block itself is the best fallback for diagnostics
    const subCtx: TQueryCtx = { messages: ctx.messages, fallback: rangeOf(blockToken, ctx) }
    if (blockChildren.length === 0) {
      pushErrorAt(subCtx.fallback, ctx, 'Empty parenthesized expression')
      return undefined
    }
    const subNi = new NodeIterator(blockChildren, ctx.messages)
    subNi.move()
    const expr = parseOrExpr(subNi, subCtx)
    if (subNi.$) {
      pushError(subNi, subCtx, `Unexpected token in parenthesized expression: "${subNi.$.text}"`)
    }
    return expr
  }

  return parseComparison(ni, ctx)
}

function parseComparison(ni: NodeIterator, ctx: TQueryCtx): SemanticQueryExprNode | undefined {
  const left = parseFieldRef(ni, ctx)
  if (!left) {
    return undefined
  }

  // Symbolic operators: =, !=, >, >=, <, <=
  if (ni.$?.type === 'punctuation' && SYMBOLIC_OPS.has(ni.$.text)) {
    const opText = ni.$.text as TQueryOperator
    ni.move()
    const right = parseValueOrFieldRef(ni, ctx)
    if (!right) {
      pushError(ni, ctx, `Expected value or field reference after "${opText}"`)
      return undefined
    }
    const node = new SemanticQueryComparisonNode()
    node.left = left
    node.operator = opText
    node.right = right
    return node
  }

  // Keyword operators
  if (ni.$?.type === 'identifier') {
    const opText = ni.$.text

    // 'in' with value list
    if (opText === 'in') {
      ni.move()
      const right = parseValueList(ni, ctx)
      if (!right) {
        return undefined
      }
      const node = new SemanticQueryComparisonNode()
      node.left = left
      node.operator = 'in'
      node.right = right
      return node
    }

    // 'matches' with value (regex literal)
    if (opText === 'matches') {
      ni.move()
      const right = parseValueOrFieldRef(ni, ctx)
      if (!right) {
        pushError(ni, ctx, 'Expected value after "matches"')
        return undefined
      }
      const node = new SemanticQueryComparisonNode()
      node.left = left
      node.operator = 'matches'
      node.right = right
      return node
    }

    // 'exists' (no right side)
    if (opText === 'exists') {
      ni.move()
      const node = new SemanticQueryComparisonNode()
      node.left = left
      node.operator = 'exists'
      return node
    }

    // 'not in' / 'not exists' (two-keyword operators after field ref)
    if (opText === 'not') {
      return parseNotComparison(ni, ctx, left)
    }

    pushError(ni, ctx, `Unknown operator "${opText}"`)
    return undefined
  }

  pushError(ni, ctx, 'Expected operator after field reference')
  return undefined
}

function parseNotComparison(
  ni: NodeIterator,
  ctx: TQueryCtx,
  left: SemanticQueryFieldRefNode
): SemanticQueryComparisonNode | undefined {
  ni.move() // consume 'not'
  if (ni.$?.type === 'identifier' && ni.$.text === 'in') {
    ni.move()
    const right = parseValueList(ni, ctx)
    if (!right) {
      return undefined
    }
    const node = new SemanticQueryComparisonNode()
    node.left = left
    node.operator = 'not in'
    node.right = right
    return node
  }
  if (ni.$?.type === 'identifier' && ni.$.text === 'exists') {
    ni.move()
    const node = new SemanticQueryComparisonNode()
    node.left = left
    node.operator = 'not exists'
    return node
  }
  pushError(ni, ctx, 'Expected "in" or "exists" after "not"')
  return undefined
}

function parseFieldRef(ni: NodeIterator, ctx: TQueryCtx): SemanticQueryFieldRefNode | undefined {
  if (ni.$?.type !== 'identifier') {
    pushError(ni, ctx, 'Expected field reference')
    return undefined
  }

  const firstToken = new Token(ni.$)
  ni.move()

  // Check for qualified ref: identifier . identifier
  if ((ni.$?.type as string) === 'punctuation' && ni.$.text === '.') {
    ni.move() // consume '.'
    if (ni.$?.type === 'identifier') {
      const secondToken = new Token(ni.$)
      ni.move()

      // Check for multi-hop chain: Type.field1.field2
      let fieldText = secondToken.text
      while ((ni.$?.type as string) === 'punctuation' && ni.$.text === '.') {
        ni.move() // consume '.'
        if (ni.$?.type === 'identifier') {
          fieldText += `.${ni.$.text}`
          ni.move()
        } else {
          pushError(ni, ctx, 'Expected identifier after "."')
          break
        }
      }

      const node = new SemanticQueryFieldRefNode()
      node.typeRef = firstToken
      // Create a fieldRef token with potentially joined text for multi-hop
      node.fieldRef =
        fieldText === secondToken.text ? secondToken : secondToken.clone({ text: fieldText })
      return node
    }

    // Dot without following identifier — unexpected
    pushError(ni, ctx, 'Expected identifier after "."')
    // Recover: treat as unqualified ref
    const node = new SemanticQueryFieldRefNode()
    node.fieldRef = firstToken
    return node
  }

  // Unqualified ref
  const node = new SemanticQueryFieldRefNode()
  node.fieldRef = firstToken
  return node
}

function parseValueOrFieldRef(
  ni: NodeIterator,
  ctx: TQueryCtx
): SemanticQueryFieldRefNode | SemanticQueryValueNode | undefined {
  if (!ni.$) {
    return undefined
  }

  // Literal values: text, number, regexp
  if (ni.$.type === 'text' || ni.$.type === 'number' || ni.$.type === 'regexp') {
    return parseValue(ni, ctx)
  }

  // Identifier: could be keyword value (true/false/null) or field ref
  if (ni.$.type === 'identifier') {
    if (VALUE_KEYWORDS.has(ni.$.text)) {
      return parseValue(ni, ctx)
    }
    // It's a field ref
    return parseFieldRef(ni, ctx)
  }

  pushError(ni, ctx, 'Expected value or field reference')
  return undefined
}

function parseValue(ni: NodeIterator, ctx: TQueryCtx): SemanticQueryValueNode | undefined {
  if (!ni.$) {
    pushError(ni, ctx, 'Expected value')
    return undefined
  }

  const token = ni.$
  if (
    token.type === 'text' ||
    token.type === 'number' ||
    token.type === 'regexp' ||
    (token.type === 'identifier' && VALUE_KEYWORDS.has(token.text))
  ) {
    const node = new SemanticQueryValueNode()
    node.valueToken = new Token(token)
    ni.move()
    return node
  }

  pushError(ni, ctx, `Unexpected token "${token.text}" where value expected`)
  return undefined
}

function parseValueList(ni: NodeIterator, ctx: TQueryCtx): SemanticQueryValueListNode | undefined {
  // Expect a block token '(' containing comma-separated values
  if (ni.$?.type === 'block' && ni.$.text === '(') {
    const blockToken = ni.$
    const blockChildren = blockToken.children || []
    ni.move() // consume the block token
    const subCtx: TQueryCtx = { messages: ctx.messages, fallback: rangeOf(blockToken, ctx) }

    const values: SemanticQueryValueNode[] = []
    if (blockChildren.length === 0) {
      pushErrorAt(subCtx.fallback, ctx, 'Empty value list in "in" expression')
      return undefined
    }

    const subNi = new NodeIterator(blockChildren, ctx.messages)
    subNi.move()

    const first = parseValue(subNi, subCtx)
    if (first) {
      values.push(first)
    }

    while (subNi.$?.type === 'punctuation' && subNi.$.text === ',') {
      subNi.move() // consume ','
      const v = parseValue(subNi, subCtx)
      if (v) {
        values.push(v)
      }
    }

    if (subNi.$) {
      pushError(subNi, subCtx, `Unexpected token in value list: "${subNi.$.text}"`)
    }

    const node = new SemanticQueryValueListNode()
    node.values = values
    return node
  }

  pushError(ni, ctx, 'Expected parenthesized value list after "in"')
  return undefined
}

/**
 * Range of a token, falling back to the enclosing query/paren range when the
 * token carries no position of its own.
 */
function rangeOf(token: TLexicalToken | undefined, ctx: TQueryCtx): TRange {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  return token?.getRange?.() ?? ctx.fallback
}

function pushError(ni: NodeIterator, ctx: TQueryCtx, message: string): void {
  pushErrorAt(rangeOf(ni.$, ctx), ctx, message)
}

function pushErrorAt(range: TRange, ctx: TQueryCtx, message: string): void {
  ctx.messages.push({
    severity: 1,
    message,
    range,
  })
}

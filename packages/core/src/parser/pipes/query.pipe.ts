import type { NodeIterator } from '../iterator'
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
import type { TVsCodeRange } from '../utils'

const SYMBOLIC_OPS = new Set<string>(['=', '!=', '>', '>=', '<', '<='])

const VALUE_KEYWORDS = new Set<string>(['true', 'false', 'null', 'undefined'])

const ZERO_RANGE: TVsCodeRange = {
  start: { line: 0, character: 0 },
  end: { line: 0, character: 0 },
}

/**
 * Parse a backtick-delimited query expression.
 *
 * `ni` iterates the query token's children and carries that token as its
 * `parent` — the range to blame when a diagnostic has no token of its own —
 * so fork it from the annotation iterator while the query token is current.
 * Returns a SemanticQueryNode or undefined if the content is empty.
 */
export function parseQueryExpression(
  ni: NodeIterator,
  sourceToken: Token
): SemanticQueryNode | undefined {
  if (!ni.$) {
    return undefined
  }

  const expr = parseOrExpr(ni)
  if (!expr) {
    return undefined
  }

  // Check for unconsumed tokens
  if (ni.$) {
    pushError(ni, `Unexpected token in query expression: "${ni.$.text}"`)
  }

  const node = new SemanticQueryNode()
  node.expression = expr
  node.sourceToken = sourceToken
  return node
}

function parseOrExpr(ni: NodeIterator): SemanticQueryExprNode | undefined {
  const left = parseAndExpr(ni)
  if (!left) {
    return undefined
  }

  const operands: SemanticQueryExprNode[] = [left]
  while (ni.$?.type === 'identifier' && ni.$.text === 'or') {
    ni.move() // consume 'or'
    const right = parseAndExpr(ni)
    if (!right) {
      pushError(ni, 'Expected expression after "or"')
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

function parseAndExpr(ni: NodeIterator): SemanticQueryExprNode | undefined {
  const left = parseUnaryExpr(ni)
  if (!left) {
    return undefined
  }

  const operands: SemanticQueryExprNode[] = [left]
  while (ni.$?.type === 'identifier' && ni.$.text === 'and') {
    ni.move() // consume 'and'
    const right = parseUnaryExpr(ni)
    if (!right) {
      pushError(ni, 'Expected expression after "and"')
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

function parseUnaryExpr(ni: NodeIterator): SemanticQueryExprNode | undefined {
  // NOT
  if (ni.$?.type === 'identifier' && ni.$.text === 'not') {
    ni.move() // consume 'not'
    const operand = parseUnaryExpr(ni)
    if (!operand) {
      pushError(ni, 'Expected expression after "not"')
      return undefined
    }
    const node = new SemanticQueryLogicalNode()
    node.operator = 'not'
    node.operands = [operand]
    return node
  }

  // Parenthesized subexpression — fork before moving on so the "(" block is
  // the sub-iterator's parent, the fallback range for diagnostics inside it
  if (ni.$?.type === 'block' && ni.$.text === '(') {
    const subNi = ni.fork(ni.$.children || [])
    ni.move() // consume the block token
    if (!subNi.$) {
      pushError(subNi, 'Empty parenthesized expression')
      return undefined
    }
    const expr = parseOrExpr(subNi)
    if (subNi.$) {
      pushError(subNi, `Unexpected token in parenthesized expression: "${subNi.$.text}"`)
    }
    return expr
  }

  return parseComparison(ni)
}

function parseComparison(ni: NodeIterator): SemanticQueryExprNode | undefined {
  const left = parseFieldRef(ni)
  if (!left) {
    return undefined
  }

  // Symbolic operators: =, !=, >, >=, <, <=
  if (ni.$?.type === 'punctuation' && SYMBOLIC_OPS.has(ni.$.text)) {
    const opText = ni.$.text as TQueryOperator
    ni.move()
    const right = parseValueOrFieldRef(ni)
    if (!right) {
      pushError(ni, `Expected value or field reference after "${opText}"`)
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
      const right = parseValueList(ni)
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
      const right = parseValueOrFieldRef(ni)
      if (!right) {
        pushError(ni, 'Expected value after "matches"')
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
      return parseNotComparison(ni, left)
    }

    pushError(ni, `Unknown operator "${opText}"`)
    return undefined
  }

  pushError(ni, 'Expected operator after field reference')
  return undefined
}

function parseNotComparison(
  ni: NodeIterator,
  left: SemanticQueryFieldRefNode
): SemanticQueryComparisonNode | undefined {
  ni.move() // consume 'not'
  if (ni.$?.type === 'identifier' && ni.$.text === 'in') {
    ni.move()
    const right = parseValueList(ni)
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
  pushError(ni, 'Expected "in" or "exists" after "not"')
  return undefined
}

function parseFieldRef(ni: NodeIterator): SemanticQueryFieldRefNode | undefined {
  if (ni.$?.type !== 'identifier') {
    pushError(ni, 'Expected field reference')
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
          pushError(ni, 'Expected identifier after "."')
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
    pushError(ni, 'Expected identifier after "."')
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
  ni: NodeIterator
): SemanticQueryFieldRefNode | SemanticQueryValueNode | undefined {
  if (!ni.$) {
    return undefined
  }

  // Literal values: text, number, regexp
  if (ni.$.type === 'text' || ni.$.type === 'number' || ni.$.type === 'regexp') {
    return parseValue(ni)
  }

  // Identifier: could be keyword value (true/false/null) or field ref
  if (ni.$.type === 'identifier') {
    if (VALUE_KEYWORDS.has(ni.$.text)) {
      return parseValue(ni)
    }
    // It's a field ref
    return parseFieldRef(ni)
  }

  pushError(ni, 'Expected value or field reference')
  return undefined
}

function parseValue(ni: NodeIterator): SemanticQueryValueNode | undefined {
  if (!ni.$) {
    pushError(ni, 'Expected value')
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

  pushError(ni, `Unexpected token "${token.text}" where value expected`)
  return undefined
}

function parseValueList(ni: NodeIterator): SemanticQueryValueListNode | undefined {
  // Expect a block token '(' containing comma-separated values — fork before
  // moving on so the "(" block is the sub-iterator's parent (see parseUnaryExpr)
  if (ni.$?.type === 'block' && ni.$.text === '(') {
    const subNi = ni.fork(ni.$.children || [])
    ni.move() // consume the block token
    if (!subNi.$) {
      pushError(subNi, 'Empty value list in "in" expression')
      return undefined
    }

    const values: SemanticQueryValueNode[] = []
    const first = parseValue(subNi)
    if (first) {
      values.push(first)
    }

    while (subNi.$?.type === 'punctuation' && subNi.$.text === ',') {
      subNi.move() // consume ','
      const v = parseValue(subNi)
      if (v) {
        values.push(v)
      }
    }

    if (subNi.$) {
      pushError(subNi, `Unexpected token in value list: "${subNi.$.text}"`)
    }

    const node = new SemanticQueryValueListNode()
    node.values = values
    return node
  }

  pushError(ni, 'Expected parenthesized value list after "in"')
  return undefined
}

/**
 * Range to blame for a diagnostic: the current token, else the enclosing
 * query token / "(...)" block the iterator was forked from.
 */
function rangeOf(ni: NodeIterator): TVsCodeRange {
  return ni.$?.getRange?.() ?? ni.parent?.getRange?.() ?? ZERO_RANGE
}

function pushError(ni: NodeIterator, message: string): void {
  ni.messages.push({ severity: 1, message, range: rangeOf(ni) })
}

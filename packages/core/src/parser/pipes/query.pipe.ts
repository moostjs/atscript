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

const COMPARISON_OPS = new Set<string>([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'like',
  'regex',
])

const UNARY_OPS = new Set<string>(['isNull', 'isNotNull', 'exists', 'notExists'])

const VALUE_KEYWORDS = new Set<string>(['true', 'false', 'null', 'undefined'])

function isOperator(text: string): boolean {
  return COMPARISON_OPS.has(text) || UNARY_OPS.has(text) || text === 'in'
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

  const ni = new NodeIterator(children, messages)
  ni.move() // position at first token

  const expr = parseOrExpr(ni, messages)
  if (!expr) {
    return undefined
  }

  // Check for unconsumed tokens
  if (ni.$) {
    messages.push({
      severity: 1,
      message: `Unexpected token in query expression: "${ni.$.text}"`,
      range: ni.$.getRange?.() ?? { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
    })
  }

  const node = new SemanticQueryNode()
  node.expression = expr
  node.sourceToken = sourceToken
  return node
}

function parseOrExpr(ni: NodeIterator, messages: TMessages): SemanticQueryExprNode | undefined {
  const left = parseAndExpr(ni, messages)
  if (!left) {
    return undefined
  }

  const operands: SemanticQueryExprNode[] = [left]
  while (ni.$?.type === 'identifier' && ni.$.text === 'or') {
    ni.move() // consume 'or'
    const right = parseAndExpr(ni, messages)
    if (!right) {
      pushError(ni, messages, 'Expected expression after "or"')
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

function parseAndExpr(ni: NodeIterator, messages: TMessages): SemanticQueryExprNode | undefined {
  const left = parseUnaryExpr(ni, messages)
  if (!left) {
    return undefined
  }

  const operands: SemanticQueryExprNode[] = [left]
  while (ni.$?.type === 'identifier' && ni.$.text === 'and') {
    ni.move() // consume 'and'
    const right = parseUnaryExpr(ni, messages)
    if (!right) {
      pushError(ni, messages, 'Expected expression after "and"')
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

function parseUnaryExpr(ni: NodeIterator, messages: TMessages): SemanticQueryExprNode | undefined {
  // NOT
  if (ni.$?.type === 'identifier' && ni.$.text === 'not') {
    ni.move() // consume 'not'
    const operand = parseUnaryExpr(ni, messages)
    if (!operand) {
      pushError(ni, messages, 'Expected expression after "not"')
      return undefined
    }
    const node = new SemanticQueryLogicalNode()
    node.operator = 'not'
    node.operands = [operand]
    return node
  }

  // Parenthesized subexpression
  if (ni.$?.type === 'block' && ni.$.text === '(') {
    const blockChildren = ni.$.children || []
    ni.move() // consume the block token
    if (blockChildren.length === 0) {
      pushError(ni, messages, 'Empty parenthesized expression')
      return undefined
    }
    const subNi = new NodeIterator(blockChildren, messages)
    subNi.move()
    const expr = parseOrExpr(subNi, messages)
    if (subNi.$) {
      pushError(subNi, messages, `Unexpected token in parenthesized expression: "${subNi.$.text}"`)
    }
    return expr
  }

  return parseComparison(ni, messages)
}

function parseComparison(
  ni: NodeIterator,
  messages: TMessages
): SemanticQueryExprNode | undefined {
  const left = parseFieldRef(ni, messages)
  if (!left) {
    return undefined
  }

  // Expect an operator
  if (ni.$?.type !== 'identifier') {
    pushError(ni, messages, 'Expected operator after field reference')
    return undefined
  }

  const opText = ni.$.text

  // Unary operators
  if (UNARY_OPS.has(opText)) {
    ni.move() // consume operator
    const node = new SemanticQueryComparisonNode()
    node.left = left
    node.operator = opText as TQueryOperator
    return node
  }

  // 'in' operator with value list
  if (opText === 'in') {
    ni.move() // consume 'in'
    const right = parseValueList(ni, messages)
    if (!right) {
      return undefined
    }
    const node = new SemanticQueryComparisonNode()
    node.left = left
    node.operator = 'in'
    node.right = right
    return node
  }

  // Binary comparison operators
  if (COMPARISON_OPS.has(opText)) {
    ni.move() // consume operator
    const right = parseValueOrFieldRef(ni, messages)
    if (!right) {
      pushError(ni, messages, `Expected value or field reference after "${opText}"`)
      return undefined
    }
    const node = new SemanticQueryComparisonNode()
    node.left = left
    node.operator = opText as TQueryOperator
    node.right = right
    return node
  }

  pushError(ni, messages, `Unknown operator "${opText}"`)
  return undefined
}

function parseFieldRef(
  ni: NodeIterator,
  messages: TMessages
): SemanticQueryFieldRefNode | undefined {
  if (ni.$?.type !== 'identifier') {
    pushError(ni, messages, 'Expected field reference')
    return undefined
  }

  const firstToken = new Token(ni.$)
  ni.move()

  // Check for qualified ref: identifier . identifier
  if (ni.$?.type === 'punctuation' && ni.$.text === '.') {
    const dotToken = ni.$
    ni.move() // consume '.'
    if (ni.$?.type === 'identifier') {
      const secondToken = new Token(ni.$)
      ni.move()

      // Check for multi-hop chain: Type.field1.field2
      let fieldText = secondToken.text
      while (ni.$?.type === 'punctuation' && ni.$.text === '.') {
        ni.move() // consume '.'
        if (ni.$?.type === 'identifier') {
          fieldText += '.' + ni.$.text
          ni.move()
        } else {
          pushError(ni, messages, 'Expected identifier after "."')
          break
        }
      }

      const node = new SemanticQueryFieldRefNode()
      node.typeRef = firstToken
      // Create a fieldRef token with potentially joined text for multi-hop
      if (fieldText !== secondToken.text) {
        node.fieldRef = secondToken.clone({ text: fieldText })
      } else {
        node.fieldRef = secondToken
      }
      return node
    }

    // Dot without following identifier — unexpected
    pushError(ni, messages, 'Expected identifier after "."')
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
  messages: TMessages
): SemanticQueryFieldRefNode | SemanticQueryValueNode | undefined {
  if (!ni.$) {
    return undefined
  }

  // Literal values: text, number, regexp
  if (ni.$.type === 'text' || ni.$.type === 'number' || ni.$.type === 'regexp') {
    return parseValue(ni, messages)
  }

  // Identifier: could be keyword value (true/false/null) or field ref
  if (ni.$.type === 'identifier') {
    if (VALUE_KEYWORDS.has(ni.$.text)) {
      return parseValue(ni, messages)
    }
    // It's a field ref
    return parseFieldRef(ni, messages)
  }

  pushError(ni, messages, 'Expected value or field reference')
  return undefined
}

function parseValue(ni: NodeIterator, messages: TMessages): SemanticQueryValueNode | undefined {
  if (!ni.$) {
    pushError(ni, messages, 'Expected value')
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

  pushError(ni, messages, `Unexpected token "${token.text}" where value expected`)
  return undefined
}

function parseValueList(
  ni: NodeIterator,
  messages: TMessages
): SemanticQueryValueListNode | undefined {
  // Expect a block token '(' containing comma-separated values
  if (ni.$?.type === 'block' && ni.$.text === '(') {
    const blockChildren = ni.$.children || []
    ni.move() // consume the block token

    const values: SemanticQueryValueNode[] = []
    if (blockChildren.length === 0) {
      pushError(ni, messages, 'Empty value list in "in" expression')
      return undefined
    }

    const subNi = new NodeIterator(blockChildren, messages)
    subNi.move()

    const first = parseValue(subNi, messages)
    if (first) {
      values.push(first)
    }

    while (subNi.$?.type === 'punctuation' && subNi.$.text === ',') {
      subNi.move() // consume ','
      const v = parseValue(subNi, messages)
      if (v) {
        values.push(v)
      }
    }

    if (subNi.$) {
      pushError(subNi, messages, `Unexpected token in value list: "${subNi.$.text}"`)
    }

    const node = new SemanticQueryValueListNode()
    node.values = values
    return node
  }

  pushError(ni, messages, 'Expected parenthesized value list after "in"')
  return undefined
}

function pushError(ni: NodeIterator, messages: TMessages, message: string): void {
  const range = ni.$?.getRange?.() ?? { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
  messages.push({
    severity: 1,
    message,
    range,
  })
}

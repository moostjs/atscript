import type { AtscriptDoc } from '../../document'
import type { Token } from '../token'
import { SemanticNode } from './semantic-node'

export type TQueryOperator =
  | '='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'in'
  | 'not in'
  | 'matches'
  | 'exists'
  | 'not exists'

export type TQueryLogicalOperator = 'and' | 'or' | 'not'

export type SemanticQueryExprNode = SemanticQueryLogicalNode | SemanticQueryComparisonNode

export class SemanticQueryNode extends SemanticNode {
  expression!: SemanticQueryExprNode
  sourceToken!: Token

  constructor() {
    super('query')
  }

  override registerAtDocument(doc: AtscriptDoc): void {
    for (const ref of this.fieldRefs()) {
      ref.queryArgToken = this.sourceToken
    }
    this.expression.registerAtDocument(doc)
  }

  /** Every field ref of the predicate (both sides of comparisons), in source order. */
  fieldRefs(): SemanticQueryFieldRefNode[] {
    const refs: SemanticQueryFieldRefNode[] = []
    const walk = (expr: SemanticQueryExprNode) => {
      if ('left' in expr) {
        refs.push((expr as SemanticQueryComparisonNode).left)
        const right = (expr as SemanticQueryComparisonNode).right
        if (right && 'fieldRef' in right) {
          refs.push(right as SemanticQueryFieldRefNode)
        }
      } else if ('operands' in expr) {
        for (const operand of (expr as SemanticQueryLogicalNode).operands) {
          walk(operand)
        }
      }
    }
    walk(this.expression)
    return refs
  }
}

export class SemanticQueryLogicalNode extends SemanticNode {
  operator!: TQueryLogicalOperator
  operands!: SemanticQueryExprNode[]

  constructor() {
    super('query-logical' as 'query')
  }

  override registerAtDocument(doc: AtscriptDoc): void {
    for (const operand of this.operands) {
      operand.registerAtDocument(doc)
    }
  }
}

export class SemanticQueryComparisonNode extends SemanticNode {
  left!: SemanticQueryFieldRefNode
  operator!: TQueryOperator
  right?: SemanticQueryFieldRefNode | SemanticQueryValueNode | SemanticQueryValueListNode

  constructor() {
    super('query-comparison' as 'query')
  }

  override registerAtDocument(doc: AtscriptDoc): void {
    this.left.registerAtDocument(doc)
    this.right?.registerAtDocument(doc)
  }
}

export class SemanticQueryFieldRefNode extends SemanticNode {
  typeRef?: Token
  fieldRef!: Token
  queryArgToken?: Token

  constructor() {
    super('query-field-ref' as 'query')
  }

  override registerAtDocument(doc: AtscriptDoc): void {
    if (this.typeRef) {
      this.typeRef.isReference = true
      this.typeRef.parentNode = this
      doc.referred.push(this.typeRef)
      doc.tokensIndex.add(this.typeRef)
    }
    this.fieldRef.parentNode = this
    doc.tokensIndex.add(this.fieldRef)
    doc.queryFieldRefs.push(this)
  }
}

export class SemanticQueryValueNode extends SemanticNode {
  valueToken!: Token

  constructor() {
    super('query-value' as 'query')
  }

  override registerAtDocument(doc: AtscriptDoc): void {
    doc.tokensIndex.add(this.valueToken)
  }
}

export class SemanticQueryValueListNode extends SemanticNode {
  values!: SemanticQueryValueNode[]

  constructor() {
    super('query-value-list' as 'query')
  }

  override registerAtDocument(doc: AtscriptDoc): void {
    for (const v of this.values) {
      v.registerAtDocument(doc)
    }
  }
}

// ── Arithmetic expressions (`expr` arguments) and orderings (`order` arguments) ──

export type TExprBinaryOperator = '+' | '-' | '*' | '/'

export type SemanticExprItemNode =
  | SemanticExprBinaryNode
  | SemanticExprUnaryNode
  | SemanticExprCallNode
  | SemanticExprNumberNode
  | SemanticQueryFieldRefNode

/** Set `queryArgToken` on every field-ref leaf and register the leaves at the document. */
function registerFieldRefs(
  refs: SemanticQueryFieldRefNode[],
  sourceToken: Token,
  doc: AtscriptDoc
): void {
  for (const ref of refs) {
    ref.queryArgToken = sourceToken
    ref.registerAtDocument(doc)
  }
}

/** Root of a parsed `expr` argument (closed arithmetic over field refs). */
export class SemanticExprNode extends SemanticNode {
  expression!: SemanticExprItemNode
  sourceToken!: Token

  constructor() {
    super('query-expr' as 'query')
  }

  /** Every field-ref leaf of the expression, in source order. */
  fieldRefs(): SemanticQueryFieldRefNode[] {
    const refs: SemanticQueryFieldRefNode[] = []
    collectExprFieldRefs(this.expression, refs)
    return refs
  }

  override registerAtDocument(doc: AtscriptDoc): void {
    registerFieldRefs(this.fieldRefs(), this.sourceToken, doc)
  }
}

function collectExprFieldRefs(node: SemanticExprItemNode, out: SemanticQueryFieldRefNode[]): void {
  switch (node.entity as string) {
    case 'query-field-ref': {
      out.push(node as SemanticQueryFieldRefNode)
      break
    }
    case 'query-expr-binary': {
      collectExprFieldRefs((node as SemanticExprBinaryNode).left, out)
      collectExprFieldRefs((node as SemanticExprBinaryNode).right, out)
      break
    }
    case 'query-expr-unary': {
      collectExprFieldRefs((node as SemanticExprUnaryNode).operand, out)
      break
    }
    case 'query-expr-call': {
      for (const arg of (node as SemanticExprCallNode).args) {
        collectExprFieldRefs(arg, out)
      }
      break
    }
    default:
  }
}

export class SemanticExprBinaryNode extends SemanticNode {
  op!: TExprBinaryOperator
  left!: SemanticExprItemNode
  right!: SemanticExprItemNode

  constructor() {
    super('query-expr-binary' as 'query')
  }
}

export class SemanticExprUnaryNode extends SemanticNode {
  op = 'neg' as const
  operand!: SemanticExprItemNode

  constructor() {
    super('query-expr-unary' as 'query')
  }
}

export class SemanticExprCallNode extends SemanticNode {
  fn = 'coalesce' as const
  args!: SemanticExprItemNode[]

  constructor() {
    super('query-expr-call' as 'query')
  }
}

export class SemanticExprNumberNode extends SemanticNode {
  valueToken!: Token
  /** Numeric value (sign already applied when split from a signed number token). */
  value!: number

  constructor() {
    super('query-expr-number' as 'query')
  }
}

export interface TOrderItem {
  ref: SemanticQueryFieldRefNode
  desc: boolean
  /** The `asc` / `desc` keyword token, when written. */
  dirToken?: Token
}

/** Root of a parsed `order` argument: `key (asc|desc)?, …`. */
export class SemanticOrderNode extends SemanticNode {
  items!: TOrderItem[]
  sourceToken!: Token

  constructor() {
    super('query-order' as 'query')
  }

  /** Every order key, in source order. */
  fieldRefs(): SemanticQueryFieldRefNode[] {
    return this.items.map(i => i.ref)
  }

  override registerAtDocument(doc: AtscriptDoc): void {
    registerFieldRefs(this.fieldRefs(), this.sourceToken, doc)
  }
}

import type { AtscriptDoc } from '../../document'
import type { Token } from '../token'
import { SemanticNode } from './semantic-node'

export type TQueryOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'like'
  | 'regex'
  | 'in'
  | 'isNull'
  | 'isNotNull'
  | 'exists'
  | 'notExists'

export type TQueryLogicalOperator = 'and' | 'or' | 'not'

export type SemanticQueryExprNode = SemanticQueryLogicalNode | SemanticQueryComparisonNode

export class SemanticQueryNode extends SemanticNode {
  expression!: SemanticQueryExprNode
  sourceToken!: Token

  constructor() {
    super('query')
  }

  override registerAtDocument(doc: AtscriptDoc): void {
    this.expression.registerAtDocument(doc)
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

  constructor() {
    super('query-field-ref' as 'query')
  }

  override registerAtDocument(doc: AtscriptDoc): void {
    if (this.typeRef) {
      this.typeRef.isReference = true
      doc.referred.push(this.typeRef)
      doc.tokensIndex.add(this.typeRef)
    }
    doc.tokensIndex.add(this.fieldRef)
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

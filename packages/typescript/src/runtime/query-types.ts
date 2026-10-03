import type { TAtscriptAnnotatedType } from './annotated-type'

/** Runtime shape of a ref annotation argument (lazy type reference with optional chain). */
export type AtscriptRef =
  | {
      type: () => TAtscriptAnnotatedType
      field: string
    }
  | (() => TAtscriptAnnotatedType)

/** Field reference within a query expression. */
export interface AtscriptQueryFieldRef {
  type?: () => TAtscriptAnnotatedType
  field: string
}

/** Single comparison in a query expression. */
export interface AtscriptQueryComparison {
  left: AtscriptQueryFieldRef
  op: string
  right?: AtscriptQueryFieldRef | unknown[] | unknown
}

/** Query expression tree (recursive). */
export type AtscriptQueryNode =
  | AtscriptQueryComparison
  | { $and: AtscriptQueryNode[] }
  | { $or: AtscriptQueryNode[] }
  | { $not: AtscriptQueryNode }

/**
 * Arithmetic expression tree (runtime shape of an `expr` annotation argument).
 * Leaves are numeric literals or field references.
 */
export type AtscriptExprNode =
  | number
  | AtscriptQueryFieldRef
  | { op: '+' | '-' | '*' | '/'; args: [AtscriptExprNode, AtscriptExprNode] }
  | { op: 'neg'; args: [AtscriptExprNode] }
  | { op: 'coalesce'; args: AtscriptExprNode[] }

/** One key of an ordering (runtime shape of an `order` annotation argument is an array of these). */
export interface AtscriptOrderItem {
  ref: AtscriptQueryFieldRef
  desc?: true
}

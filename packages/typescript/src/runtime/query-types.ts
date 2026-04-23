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

export interface TAnscriptTypeComplex {
  kind: 'union' | 'intersection' | 'tuple'
  items: TAnscriptTypeDef[]
}

export interface TAnscriptTypeArray {
  kind: 'array'
  of: TAnscriptTypeDef
}

export interface TAnscriptTypeObject {
  kind: 'object'

  /**
   * type constructor
   */
  type: Function | undefined
  props: Map<string, TAnscriptAnnotatedType<TAnscriptTypeDef>>
}

export interface TAnscriptTypeFinal {
  kind: 'final'

  /**
   * design type
   */
  designType: 'string' | 'number' | 'boolean' | 'undefined' | 'null' | 'object' | 'any'

  /**
   * type constructor
   */
  type: Function | undefined

  /**
   * value for literals
   */
  value?: string | number | boolean
}

export type TAnscriptTypeDef =
  | TAnscriptTypeComplex
  | TAnscriptTypeFinal
  | TAnscriptTypeArray
  | TAnscriptTypeObject

export interface TAnscriptAnnotatedType<T extends TAnscriptTypeDef = TAnscriptTypeDef> {
  __is_anscript_annotated_type: true
  type: T
  metadata: Record<string, unknown>
}

/**
 * Type Guard to check if a type is anscript-annotated
 */
export function isAnnotatedType(type: any): type is TAnscriptAnnotatedType<TAnscriptTypeDef> {
  return type && type.__is_anscript_annotated_type
}

export function defineAnnotatedType<T extends TAnscriptTypeDef>(
  opts: Omit<TAnscriptAnnotatedType<T>, '__is_anscript_annotated_type'>
): TAnscriptAnnotatedType<T> {
  Object.assign(opts, { __is_anscript_annotated_type: true })
  return opts as TAnscriptAnnotatedType<T>
}

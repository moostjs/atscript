@mulAppend 'type-1'
@mulAppend 'type-2'
export type Shared = string

export interface Holder {
  @mulAppend 'own-1'
  @mulAppend 'own-2'
  field: Shared
}

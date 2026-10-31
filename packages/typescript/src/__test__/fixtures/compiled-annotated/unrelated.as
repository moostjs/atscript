import { Address } from './ext'

@emit.compiledValidator
export interface Small {
  @expect.min 1
  n: number
}

export type AddressAlias = Address

export type Street = AddressAlias.street

@emit.compiledValidator
annotate Address {
  @expect.minLength 1
  street
}

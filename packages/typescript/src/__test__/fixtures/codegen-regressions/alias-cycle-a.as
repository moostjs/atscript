import { AcAddr } from './alias-cycle-b'

// Aliases of a type of the module importing this one (evaluated after it).
export type AcAlias1 = AcAddr
export type AcAlias2 = AcAlias1

export interface AcOrder {
  address: AcAddr
}

annotate AcOrder {
  @expect.maxLength 3
  address.street
}

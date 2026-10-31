import { AcOrder } from './alias-cycle-a'

export interface AcAddr {
  street: string
}

export interface AcOwner {
  orders?: AcOrder[]
}

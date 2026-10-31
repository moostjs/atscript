import { Address } from './ext'

export interface Line {
  @expect.min 1
  qty: number
  @expect.pattern "^[A-Z]+$"
  sku: string
}

@emit.compiledValidator
type Status = 'open' | 'closed'

@emit.compiledValidator
export interface Order {
  @expect.minLength 1
  lines: Line[]
  status: Status
  address: Address
  billing?: Address
}

export interface Plain {
  name: string
}

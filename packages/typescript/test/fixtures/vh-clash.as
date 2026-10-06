import { VhTicket } from './vh-table'

export interface VhDict {
  other: string
}

export interface VhClash {
  color: VhTicket.color
  local: VhDict
}

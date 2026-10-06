import { VhTicket } from './vh-table'

export interface VhView {
  color: VhTicket.color
  size: VhTicket.size
}

export interface VhExt extends VhTicket {
  extra: string
}

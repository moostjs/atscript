import { CycleB } from './cycle-b'

export interface CycleA {
  b: CycleB
  x: string
}

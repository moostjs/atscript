import { U1, U2, D } from './a'
export interface K { k?: U1 & U2; d?: D }
export type K2 = D & { w?: string }

@meta.label 'DA'
export type TA = { x?: string; next?: TA }
export type TB = { x?: string; next?: TB }
export type TS = { x?: string }
export interface IA { x?: string; next?: IA }
export interface IB { x?: string; next?: IB }
export type M = TA & TB
export type S = TA & TS
export type MI = IA & IB
export interface H { s?: TA & TS; m?: TA & TB; mi?: IA & IB }

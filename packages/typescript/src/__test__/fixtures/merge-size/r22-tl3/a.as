@meta.label 'IA'
export interface IA { x?: string; next?: IA }
export interface IB { x?: string; next?: IB }
@meta.label 'TA'
export type TA = { x?: string; next?: TA }
export type TB = { x?: string; next?: TB }
export type MI = IA & IB
export type MT = TA & TB

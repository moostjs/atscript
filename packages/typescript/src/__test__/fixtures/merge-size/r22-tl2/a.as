@meta.label 'IA'
export interface IA { x?: string }
export interface IB { x?: string }
@meta.label 'TA'
export type TA = { x?: string }
export type TB = { x?: string }
export type MI = IA & IB
export type MT = TA & TB
export interface H { mi?: IA & IB; mt?: TA & TB }

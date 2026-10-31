@meta.readonly
export type A = { next?: A; x?: string }
export type B = { next?: B; x?: string }
export type M = A & B
@meta.readonly
export type SA = { x?: string; q?: SA }
export type SB = { x?: string }
export type S = SA & SB
export interface H { s?: SA & SB; m?: A & B; a?: A }

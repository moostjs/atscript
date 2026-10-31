@meta.label 'A'
@meta.description 'Ad'
export interface A { next?: A; x?: string }
@meta.label 'B'
export interface B { next?: B; x?: string }
export type M = A & B

@meta.label 'SA'
@meta.description 'SAd'
export interface SA { x?: string; q?: SA2 }
@meta.label 'SB'
export interface SB { x?: string; q?: SB2 }
@meta.label 'SA2'
@meta.description 'SA2d'
export interface SA2 { y?: string }
@meta.label 'SB2'
export interface SB2 { y?: string }
export type S = SA & SB
export interface H { s?: SA & SB; m?: A & B }

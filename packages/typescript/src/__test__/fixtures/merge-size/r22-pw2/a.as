@meta.readonly
export type TA = { x?: string; next?: TA }
export type TB = { x?: string; next?: TB }
export type TS = { x?: string }
export type M = TA & TB
export type S = TA & TS
export type R = TA
export interface H { s?: TA & TS; m?: TA & TB; a?: TA; u?: TA | null; arr?: TA[] }

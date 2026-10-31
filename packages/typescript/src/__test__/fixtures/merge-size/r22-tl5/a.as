export interface X { a?: string }
export interface Y { b?: string }
@expect.minLength 2
export type L1 = X[]
export type L2 = Y[]
export type LL = L1 & L2
export interface H { ll?: L1 & L2; l1?: L1 }
export interface P { l?: L1 }
export interface Q { l?: L2 }
export type PQ = P & Q

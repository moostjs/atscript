export interface X { a?: string }
export interface Y { b?: string }
export interface Z { c?: string }
export interface U1 { u?: X | Y }
export interface U2 { u?: X | Z }
export type D = U1 & U2
export interface H { d?: D; e?: D; f?: U1 & U2; g?: (U1 & U2)[] }

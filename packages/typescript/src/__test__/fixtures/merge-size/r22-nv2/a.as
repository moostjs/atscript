export interface X { a?: string }
export interface Y { b?: string }
export interface Z { c?: string }
export type DU = { k?: string; u?: X | Y } & { u?: X | Z }
export type DT = { k?: string; t?: [X] } & { t?: [Z] }
export type DA = { k?: string; aa?: X[][] } & { aa?: Z[][] }
export type DUA = { k?: string; ua?: (X | Y)[] } & { ua?: Z[] }
export type DS = { k?: string; s?: X } & { s?: string }
export type DN = { k?: string; n?: string } & { n?: number }

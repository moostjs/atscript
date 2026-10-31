@expect.minLength 3
export type S3 = string
export type SS = S3 & string
export type SS2 = string & S3
export interface H { s?: S3 & string }
export interface X { a?: string }
@expect.minLength 2
export type L1 = X[]
export type LX = L1 & X[]

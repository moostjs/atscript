@expect.int
@expect.min 0
export type KafkaOffset = number

export type Flag = boolean

export type Level = 1 | 2 | 'max'

export type MaybeNumber = string | number

export interface SearchQuery {
    @expect.min 0
    offset: number

    @expect.min 1
    @expect.max 100
    limit?: number

    active: boolean

    term: string

    price: decimal

    ids: number[]

    nested?: {
        depth: number
    }
}

export interface CNodeA {
    a: number
    children: CTree[]
    kind?: 'a'
}

export interface CNodeB {
    b: boolean
    children: CTree[]
    kind?: 'b'
}

export type CTree = CNodeA | CNodeB

export interface ByFlag {
    kind: 'flag'
    from: boolean
}

export interface ByRange {
    kind: 'range'
    from: number
    to: number
}

export type RangeFilter = ByFlag | ByRange

export interface V1 {
    version: 1
    n: boolean
}

export interface V2 {
    version: 2
    n: number
}

export type Versioned = V1 | V2

export interface Inner1 {
    t: 'i1'
    v: number
}

export interface Inner2 {
    t: 'i2'
    v: boolean
}

export interface Outer5 {
    t: 'o5'
    v: boolean
}

export type InnerU = Inner1 | Inner2

export type NestedU = InnerU | Outer5

export interface OptA {
    kind?: 'a'
    x: boolean
}

export interface OptB {
    kind: 'b'
    x: number
}

export type Opt = OptA | OptB

export interface N1 {
    v: 1
    n: number
}

export interface S1 {
    v: '1'
    n: boolean
}

export type Mixed = N1 | S1

export interface PA {
    child?: PU
    kind?: 'a'
}

export interface PB {
    child?: PU
    kind?: 'b'
}

export type PU = PA | PB

export interface DA {
    kind: 'a'
    child?: DU
}

export interface DB {
    kind: 'b'
    child?: DU
}

export type DU = DA | DB

export interface Q {
    @normalize.lowercase
    mode: 'asc'
    limit: number
}

export interface FlagN {
    @normalize.trim
    kind: 'flag'
    from: boolean
}

export interface RangeN {
    @normalize.trim
    kind: 'range'
    from: number
}

export type RN = FlagN | RangeN

export interface LitNullA {
    kind: 'a' | null
    n: number
}

export interface LitNullB {
    kind: 'b'
    n: boolean
}

export type LitNull = LitNullA | LitNullB

export type TupU = ['a', number] | ['b', boolean]

@normalize.lowercase
export type KindAX = 'a' | 'x'

export interface AnA {
    kind: KindAX | null
    n: number
}

export interface AnB {
    kind: 'b' | null
    n: boolean
}

export type AnU = AnA | AnB

export interface AzA {
    kind: KindAX | 'z'
    n: number
}

export interface AzB {
    kind: 'b'
    n: boolean
}

export type AzU = AzA | AzB

export interface RA {
    kind: 'a'
    x: number
}

export interface RB {
    y: boolean
}

export type RU = RA | RB

export interface IBase {
    id: number
}

export interface IKa {
    kind: 'a'
    v: number
}

export interface IKb {
    kind: 'b'
    v: boolean
}

export type IKU = IKa | IKb

export interface IOther {
    other: boolean
}

export type IN2 = (IBase & IKU) | IOther

export interface SLeft {
    @normalize.trim
    a: string
}

export interface SRight {
    @normalize.trim
    a: string
    b?: number
}

export type SameObjects = SLeft | SRight

export type ArrU = number[] | boolean[]

export interface PxA {
    v: '1'
    n: boolean
    req: string
}

export interface PxB {
    v: 1
    n: number
}

export type Px = PxA | PxB

export interface WbA {
    a: boolean
}

export interface WbB {
    a: number
    b: string
}

export type Wb = WbA | WbB

export interface WzA {
    a: boolean
    z?: number
}

export interface WzB {
    a: number
}

export type Wz = WzA | WzB

export interface PetCat {
    kind: 'cat'
    lives: number
    indoor?: boolean
}

export interface PetDog {
    kind: 'dog'
    good: boolean
}

export type Pet = PetCat | PetDog

export interface X1 {
    v: 3
    n: string
}

export type MixNested = (N1 | X1) | S1

export type MixFlat = N1 | X1 | S1

export type MixLast = S1 | (N1 | X1)

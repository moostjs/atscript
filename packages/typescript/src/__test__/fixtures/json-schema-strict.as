@meta.label 'Shipping address'
@meta.description 'Where an order goes'
export interface Address {
    city: string

    zip?: string
}

export interface Cat {
    kind: 'cat'
}

export interface Dog {
    kind: 'dog'
    bark: boolean
}

@meta.description 'Creates a ticket'
export interface Ticket {
    @meta.required 'Name it'
    @expect.minLength 2
    @expect.maxLength 40
    @expect.pattern '^[a-z]'
    name: string

    @meta.description 'What to call it'
    nickname?: string

    @meta.required
    title?: string

    @expect.min 0
    @expect.max 10
    @expect.int
    score: number

    @expect.minLength 1
    @expect.maxLength 5
    @expect.array.uniqueItems
    tags: string[]

    @expect.minLength 2
    pair: string[]

    @expect.minKeys 1
    meta?: {
        a?: string
        b: number
    }

    @meta.required 'Agree to continue'
    ok?: boolean

    @meta.required
    either?: string | boolean

    choice: string | number

    @expect.pattern '(?<!x)y'
    lookbehind?: string

    @expect.pattern '^(?<first>[a-z])[\b]\d{1,500}$'
    named?: string

    pet: Cat | Dog

    @meta.label 'Ship to'
    @meta.description 'Delivery address'
    shipTo: Address

    billTo?: Address
}

export interface Tree {
    value: string
    children: Tree[]
}

export interface Chain {
    value: string

    @meta.description 'The next link'
    @expect.minKeys 1
    next: Chain
}

export interface WithRecord {
    rec: {
        [*]: string
    }
}

export interface WithTuple {
    pair: [string, number]
}

export interface WithUnknown {
    data: unknown
}

export type Choice = string | number

export interface UnionA {
    a?: string
    k: string
}

export interface UnionB {
    a: string | null
    m: string
}

export interface OptionalA {
    a?: string
    k: string
}

export interface OptionalB {
    a?: string
    m: string
}

export type NullNeeded = UnionA | UnionB

export type AllOptional = OptionalA | OptionalB

export interface Patch {
    clear?: string | null
    keep?: string
    other: string | null
}

export interface Bag {
    needed: NullNeeded[]
    optional: AllOptional[]
    patch: Patch
}

export interface PartPlain {
    x?: string
}

export interface PartNullable {
    x?: string | null
}

export interface PartRequiredNullable {
    x: string | null
}

@normalize.trim
@normalize.lowercase
export type Email = string

@normalize.uppercase
export type Code = string

export type Slug = string.trimmed

export interface Address {
    @normalize.trim
    city: string

    zip: string
}

export interface User {
    email: Email

    @normalize.trim
    name: string

    @normalize.trim
    nickname?: string | null

    @normalize.lowercase
    status: 'active' | 'blocked'

    aliases: Email[]

    pair: [Email, string]

    address: Address

    labels: { [*]: Email }

    slug: Slug

    plain: string

    count: number

    ownerEmail: User.email
}

export interface Cat {
    kind: 'cat'
    @normalize.trim
    name: string
}

export interface Dog {
    kind: 'dog'
    @normalize.uppercase
    name: string
}

export type Pet = Cat | Dog

export type EmailOrCode = Email | Code

export type EmailOrNone = 'none' | Email

export interface Left {
    @normalize.trim
    a: string
}

export interface Right {
    @normalize.trim
    a: string
    b?: number
}

export type SameObjects = Left | Right

export interface Untrimmed {
    a: string
}

export type DifferentObjects = Left | Untrimmed

export interface Plain {
    a: string
}

export annotate Plain as TrimmedPlain {
    @normalize.trim
    a
}

export interface NodeA {
    a: string
    children: Tree[]
}

export interface NodeB {
    b: string
    children: Tree[]
}

export type Tree = NodeA | NodeB

export interface TrimA {
    @normalize.trim
    a: string
    children: TrimTree[]
}

export interface TrimB {
    @normalize.trim
    b: string
    children: TrimTree[]
}

export type TrimTree = TrimA | TrimB

@expect.pattern '^[0-9]+$'
export type Digits = string

export interface ContactForm {
    contact: Email | Digits
}

export interface Holder {
    @normalize.trim
    s: string
    when?: unknown
}

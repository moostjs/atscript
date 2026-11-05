@normalize.trim
@normalize.lowercase
export type Email = string.email

export interface SignUp {
    email: Email

    @normalize.trim
    @expect.minLength 2
    name: string

    @normalize.uppercase
    country?: 'US' | 'NL' | null

    tags: Email[]

    password: string

    role?: string
}

export interface ByName {
    @normalize.lowercase
    handle: string
    name: string
}

export interface ByCode {
    @normalize.uppercase
    @expect.maxLength 2
    handle: string
}

export type Lookup = ByName | ByCode

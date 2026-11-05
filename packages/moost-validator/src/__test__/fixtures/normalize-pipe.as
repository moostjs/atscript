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

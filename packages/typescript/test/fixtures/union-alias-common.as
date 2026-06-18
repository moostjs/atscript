// A string-literal union and an interface, imported across files by union-alias.as.

export type EntityStatus = 'ACTIVE' | 'INACTIVE'

export interface Profile {
    @meta.label 'Full Name'
    name: string

    age: number
}

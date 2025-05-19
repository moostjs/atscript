@mongo.collection 'simple'
export interface SimpleCollection {
    name: string
    active: boolean
    occupation?: string
    tags?: string[]
    age: number

    @mongo.patch.strategy 'replace'
    address: {
        line1: string
        line2?: string
        city: string
        state: string
        zip: string
    }

    @mongo.patch.strategy 'merge'
    contacts: {
        email: string
        phone: string
    }
}
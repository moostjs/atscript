type TContactType = 'phone' | 'email'

export interface Address {
    line1: string
    line2: string
    city: string
    state: string
    zip: string
}

interface Contact {
    type: TContactType
    value: string
    label?: string
}

export interface User {
    firstName: string
    lastName: string
    address: Address
    contacts: Contact[]
}

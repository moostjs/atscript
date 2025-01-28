@label "Address"
interface Address {
    @label "Address Line 1"
    line1: string
    
    @label "Address Line 2"
    line2?: string
    
    @label "City"
    city: string

    @label "State"
    state: string

    @label "Zip"
    zip: string
}

@label "Contact"
interface Contact {
    name: string
    type: 'phone' | 'email'
    value: string
}

export interface Entity {
    @label "Legal ID"
    id: string

    @label "Name"
    name: string

    address: Address

    @label "Contacts"
    contacts: Contact[]
}
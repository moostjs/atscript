interface Contact {
    @label 'Phone'
    phone: string

    @label 'Email'
    email: string.email
}

interface Address {
    @label 'Street'
    street: string

    contact: Contact
}

export interface Deep {
    @label 'Name'
    name: string

    address: Address
}

// BUG 1 test: mutating annotate through refs
@meta.description 'Mutated Deep'
annotate Deep {
    @label 'Mobile Phone'
    address.contact.phone
}

// BUG 2 test: non-mutating annotate through refs
@meta.description 'Aliased Deep'
export annotate Deep as AliasedDeep {
    @label 'Work Phone'
    address.contact.phone
}

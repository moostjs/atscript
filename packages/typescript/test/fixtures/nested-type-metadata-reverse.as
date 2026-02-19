export interface ExplorationForm {
    @label "Name"
    name: string

    @label "Addresses"
    addresses: TAddress[]
}

@label "Address"
interface TAddress {
    @label "Street"
    street: string

    @label "City"
    city: string
}

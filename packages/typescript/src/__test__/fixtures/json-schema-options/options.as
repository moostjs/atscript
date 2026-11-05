@meta.label 'Shipping address'
@meta.description 'Where an order goes'
export interface Address {
    @meta.label 'City'
    city: string

    zip?: string
}

export type Status = 'active' | 'blocked'

export interface Cat {
    kind: 'cat'
}

export interface Dog {
    kind: 'dog'
    bark: boolean
}

@meta.description 'An order'
export interface Order {
    @meta.description 'Order state'
    status: Status

    @meta.label 'Priority'
    priority?: 1 | 2 | 3

    maybe: 'x' | 'y' | null

    @meta.description 'Delivery address'
    shipTo: Address

    billTo?: Address

    @meta.label 'Alternative'
    @meta.description 'Second address'
    altAddress?: Address

    tags: string[]

    @meta.description 'Nickname'
    nickname?: string

    note?: {
        text: string
    }

    pet: Cat | Dog
}

@emit.jsonSchema
export interface Emitted {
    @meta.label 'Code'
    code: 'a' | 'b'

    address: Address
}

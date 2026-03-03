interface Address {
    street: string
    city: string
    zip?: string
}

@db.table 'my_table'
export interface MyEntity {
    id: string
    name: string
    address: {
        street: string
        city: string
        zip?: string
    }
    tags: string[]
    contacts: {
        name: string
        email: string
    }[]
    home: Address
    optional?: number
    @db.json
    metadata: {
        key: string
        value: string
    }
    @db.json
    items: {
        label: string
    }[]
}

export interface NonDbInterface {
    field: string
    nested: {
        inner: number
    }
}

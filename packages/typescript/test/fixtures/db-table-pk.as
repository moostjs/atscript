@db.table 'single_pk'
export interface SinglePk {
    @meta.id
    id: string
    name: string
}

@db.table 'compound_pk'
export interface CompoundPk {
    @meta.id
    userId: string
    @meta.id
    orderId: number
    amount: number
}

@db.table 'no_pk'
export interface NoPk {
    name: string
    value: number
}

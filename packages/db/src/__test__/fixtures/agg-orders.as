@db.table "orders"
export interface AggOrders {
    @meta.id
    id: number

    @db.column.dimension
    status: string

    @db.column.dimension
    @db.column "region_code"
    region: string

    @db.column.measure
    amount: number

    @db.column.measure
    quantity: number

    name: string
}

@db.table "plain_events"
export interface PlainEvents {
    @meta.id
    id: number

    category: string
    value: number
    label: string
}

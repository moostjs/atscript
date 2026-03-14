@db.table "orders"
export interface Order {
  @meta.id
  id: number
  @db.column.dimension
  status: string
  @db.column.dimension
  currency: string
  @db.column.measure
  amount: number
  name: string
}

@db.table "products"
export interface Product {
  @meta.id
  id: number
  name: string
  price: number
}

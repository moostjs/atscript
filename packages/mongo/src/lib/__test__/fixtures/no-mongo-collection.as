@db.table 'users'
export interface UserNoMongo {
    @meta.id
    @db.default.fn 'increment'
    id: number

    @db.index.unique 'email_idx'
    email: string

    name: string
}

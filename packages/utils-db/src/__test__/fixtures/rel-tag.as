@db.table 'tags'
export interface Tag {
    @meta.id
    @db.default.fn 'increment'
    id: number

    name: string
}

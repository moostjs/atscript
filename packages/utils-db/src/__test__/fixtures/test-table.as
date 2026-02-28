@db.table 'users'
@db.schema 'auth'
export interface UsersTable {
    @meta.id
    id: number

    @db.index.unique 'email_idx'
    @db.column 'email_address'
    email: string

    @db.index.plain 'name_idx'
    name: string

    @db.index.plain 'name_idx'
    @db.index.plain 'created_idx', 'desc'
    @db.default.fn 'now'
    createdAt: number

    @db.ignore
    displayName?: string

    @db.default.value 'active'
    status: string

    @db.index.fulltext 'search_idx'
    bio?: string
}

export interface NoTableAnnotation {
    name: string
}

import { Post } from './test-relations'

@db.table 'authors'
export interface Author {
    @meta.id
    @db.default.fn 'increment'
    id: number

    name: string

    @db.default.fn 'now'
    createdAt?: number.timestamp.created

    // ── Relations ────────────────────────────────────────────────
    @db.rel.from
    posts?: Post[]
}

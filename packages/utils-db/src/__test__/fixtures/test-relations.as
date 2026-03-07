import { Author } from './rel-author'
import { Comment } from './rel-comment'

@db.table 'posts'
export interface Post {
    @meta.id
    @db.default.fn 'increment'
    id: number

    title: string

    @db.default 'draft'
    status: string

    @db.default.fn 'now'
    createdAt?: number.timestamp.created

    // ── Foreign Key ──────────────────────────────────────────────
    @db.rel.FK
    @db.rel.onDelete 'cascade'
    authorId: Author.id

    // ── Relations ────────────────────────────────────────────────
    @db.rel.to
    author?: Author

    @db.rel.from
    comments?: Comment[]
}

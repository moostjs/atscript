import { Post } from './test-relations'

@db.table 'comments'
export interface Comment {
    @meta.id
    @db.default.fn 'increment'
    id: number

    body: string

    @db.default.fn 'now'
    createdAt?: number.timestamp.created

    // ── Foreign Key ──────────────────────────────────────────────
    @db.rel.FK
    @db.rel.onDelete 'cascade'
    postId: Post.id

    // ── Relations ────────────────────────────────────────────────
    @db.rel.to
    post?: Post
}

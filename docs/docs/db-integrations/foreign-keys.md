---
outline: deep
---

# Foreign Keys

Foreign keys link tables together. In Atscript, you define them using `@db.rel.FK` with a **chain reference** that points to the target field.

## Defining a Foreign Key

```atscript
import { User } from './user'

@db.table 'projects'
export interface Project {
    @meta.id
    @db.default.fn 'increment'
    id: number

    title: string

    @db.rel.FK
    ownerId: User.id
}
```

The chain reference `User.id` tells Atscript:
- This field references the `id` field of the `User` interface
- The target field must be a primary key (`@meta.id`) or have a unique index (`@db.index.unique`)
- The column type is inferred from the target field

## Referential Actions

Control what happens when a referenced record is deleted or updated:

```atscript
@db.rel.FK
@db.rel.onDelete 'cascade'
@db.rel.onUpdate 'cascade'
ownerId: User.id
```

Available actions:

| Action | On Delete | On Update |
|--------|-----------|-----------|
| `'cascade'` | Delete this row too | Update this FK too |
| `'restrict'` | Block the delete | Block the update |
| `'noAction'` | Database default | Database default |
| `'setNull'` | Set FK to null | Set FK to null |
| `'setDefault'` | Set FK to default | Set FK to default |

::: warning
`'setNull'` requires the FK field to be optional (`?`). Atscript validates this at compile time.
:::

## Optional Foreign Keys

Make a FK nullable to allow records without a relationship:

```atscript
@db.rel.FK
@db.rel.onDelete 'setNull'
assigneeId?: User.id
```

## Multiple FKs to the Same Table

When a table has multiple foreign keys pointing to the same target, use **aliases** to distinguish them:

```atscript
@db.table 'transfers'
export interface Transfer {
    @meta.id
    id: number

    @db.rel.FK 'sender'
    senderId: User.id

    @db.rel.FK 'receiver'
    receiverId: User.id

    amount: number
}
```

Without aliases, Atscript would not know which FK a navigation property should follow.

## Composite Foreign Keys

When the target has a composite primary key, you need multiple FK fields with the same alias:

```atscript
@db.table 'order_items'
export interface OrderItem {
    @meta.id
    id: number

    @db.rel.FK 'product'
    productCategory: Product.category

    @db.rel.FK 'product'
    productSku: Product.sku
}
```

## Junction Tables

For many-to-many relationships, create a junction table with FKs to both sides:

```atscript
import { Task } from './task'
import { Tag } from './tag'

@db.table 'task_tags'
export interface TaskTag {
    @meta.id
    @db.rel.FK
    @db.rel.onDelete 'cascade'
    taskId: Task.id

    @meta.id
    @db.rel.FK
    @db.rel.onDelete 'cascade'
    tagId: Tag.id

    assignedAt?: number.timestamp.created
}
```

Note that both FK fields are also marked `@meta.id` — they form a composite primary key.

## Next Steps

- [Navigation Properties](./navigation) — Load related data using `@db.rel.to`, `@db.rel.from`, and `@db.rel.via`
- [Deep Operations](./deep-operations) — Insert and update across relations in one call

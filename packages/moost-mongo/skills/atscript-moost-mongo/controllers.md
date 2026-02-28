# Controllers & Hooks — @atscript/moost-mongo

> Creating REST controllers and customizing behavior via hooks.

## Basic Controller

The simplest controller is an empty subclass:

```typescript
import { AsMongoController, CollectionController } from '@atscript/moost-mongo'
import { AsMongo } from '@atscript/mongo'
import { Provide } from 'moost'
import { User } from './user.as'

@Provide(AsMongo, () => new AsMongo(process.env.MONGO_URI!))
@CollectionController(User)
export class UsersController extends AsMongoController<typeof User> {}
```

This gives you all 7 REST endpoints automatically.

## Overridable Hooks

### `init()`

Called during controller initialization. Use for one-time setup like syncing indexes:

```typescript
@CollectionController(User)
export class UsersController extends AsMongoController<typeof User> {
  async init() {
    await this.collection.syncIndexes()
  }
}
```

### `onWrite(action, data, opts)`

Intercepts write operations. `action` is `'insert'`, `'replace'`, or `'update'`.

```typescript
async onWrite(action: string, data: any, opts: any) {
  if (action === 'insert') {
    data.createdAt = new Date().toISOString()
  }
  data.updatedAt = new Date().toISOString()
  return super.onWrite(action, data, opts)
}
```

### `onRemove(id, opts)`

Intercepts delete operations. Return the result or throw to prevent deletion.

```typescript
async onRemove(id: string, opts: any) {
  // Soft delete instead
  await this.collection.update({ _id: id, deletedAt: new Date().toISOString() })
  return { deletedCount: 1 }
}
```

### `transformFilter(filter)`

Modify the MongoDB filter before any query. Use for multi-tenancy, soft deletes, etc.

```typescript
transformFilter(filter: Filter<any>) {
  return { ...filter, tenantId: this.currentTenantId }
}
```

### `transformProjection(projection)`

Modify field projection before queries.

### `prepareSearch(query, index?)`

Override to customize how text/vector search queries are built.

### `prepareTextSearch(query, index?)`

Override for text search customization.

### `prepareVectorSearch(query, index?)`

Override for vector search customization.

## Query Controls

The GET endpoints accept URLQL query parameters:

### `/query` endpoint

Uses `QueryControlsDto`:
- `$skip` — Number of documents to skip
- `$limit` — Maximum documents to return
- `$count` — If true, return count instead of documents
- `$sort` — Sort specification (e.g. `$sort[name]=1`)
- `$select` — Field projection (e.g. `$select[name]=1`)
- `$search` — Text search query
- `$index` — Search index name

### `/pages` endpoint

Uses `PagesControlsDto`:
- `$page` — Page number (1-based)
- `$size` — Page size
- `$sort`, `$select`, `$search`, `$index` — Same as query

### `/one/:id` endpoint

Uses `GetOneControlsDto`:
- `$select` — Field projection
- `:id` — Tries `_id` first, then falls back to `@db.index.unique` fields

## Custom Route Prefix

```typescript
@CollectionController(User, 'api/v2/users')
export class UsersV2Controller extends AsMongoController<typeof User> {}
```

If not specified, defaults to the `@db.table` name.

## Accessing the Collection

Inside controller methods, use `this.collection` to access the underlying `AsCollection`:

```typescript
@CollectionController(User)
export class UsersController extends AsMongoController<typeof User> {
  async customMethod() {
    const users = await this.collection.collection.find({ isActive: true }).toArray()
    return users
  }
}
```

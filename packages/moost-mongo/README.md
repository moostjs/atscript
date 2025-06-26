# @atscript/moost-mongo

Simple generator‑free CRUD for **MongoDB** collections defined with
**atscript** and served by
[Moost](https://moost.org/).

- ✅ **Zero boilerplate** – one decorator turns your `.as` model into a fully‑featured controller.
- 🔌 **Pluggable** – override protected hooks to adjust validation, projections, or write logic.
- ⚙️ **URLQL** powered filtering / paging / projections on **GET /query** & **GET /pages**.
- 🧱 **Type‑safe** – everything is inferred from your annotated interface.

---

## Installation

```bash
pnpm add @atscript/moost-mongo        # this package
pnpm add @atscript/mongo mongodb      # runtime peer deps
pnpm add moost @moostjs/event-http    # your HTTP adapter
```

---

## Quick start

### 1  Describe your collection

```ts
// src/collections/user.collection.as
@mongo.collection 'users'
export interface User {
  @mongo.index.unique
  email: string
  name: string
  age: number
}
```

### 2  Subclass the controller

```ts
import { AsMongoController, CollectionController } from '@atscript/moost-mongo'
import type { User } from '../collections/user.collection.as'

/* Provide AsMongo connection for the controller */
@Provide(AsMongo, () => new AsMongo(process.env.MONGO_URI!))
@CollectionController(User) // optional prefix param available
export class UsersController extends AsMongoController<typeof User> {}
```

### 3  Bootstrap Moost

```ts
import { Moost } from 'moost'
import { MoostHttp } from '@moostjs/event-http'
import { UsersController } from './controllers/users.controller'

const app = new Moost()

void app.adapter(new MoostHttp()).listen(3000)
void app.registerControllers(UsersController).init()
```

Hit the endpoints:

```
GET  /users/query   ?$filter=age>18&$select=name,email
GET  /users/pages   ?$page=2&$size=20&$sort=age:-1
GET  /users/one/{id}
POST /users         (JSON body)                        – insert 1‒n documents
PUT  /users         (JSON body with _id)               – replace
PATCH/DELETE        analogously
```

---

## API

### `class AsMongoController<T>`

Base class you extend. **T** is the atscript constructor exported from the
`.as` file.

| Hook / Method               | When to override                     | Typical use‑case                        |
| --------------------------- | ------------------------------------ | --------------------------------------- |
| `protected init()`          | Once at controller creation          | Create indexes, seed data               |
| `transformProjection()`     | Before running `find()`              | Force whitelist / blacklist projections |
| `validate*Controls()`       | Per endpoint                         | Custom URLQL control validation         |
| `onRemove(id, opts)`        | Before `deleteOne`                   | Soft‑delete or veto                     |
| `onWrite(action,data,opts)` | Before any insert / update / replace | Auto‑populate fields, audit, veto       |

All CRUD endpoints are already wired – just subclass and go.

### `CollectionController(type, prefix?)`

Decorator that glues your subclass to Moost:

1. Registers the collection constructor under DI token `__atscript_mongo_collection_def`.
2. Marks the class as a `@Controller(prefix)` (defaults to the collection name).
3. Ensures route metadata from the parent is inherited (`@Inherit`).

```ts
@CollectionController(User, 'users')
export class UsersController extends AsMongoController<typeof User> {}
```

### Injecting the collection in services

When you need raw collection access outside the generated controller,
use `@InjectCollection`:

```ts
@Injectable()
export class AuditService {
  constructor(
    @InjectCollection(User)
    private users: AsCollection<typeof User>
  ) {}

  async purgeSoftDeleted() {
    await this.users.collection.deleteMany({ deleted: true })
  }
}
```

AsMongo is resolved automatically from DI, so make sure it is provided
globally (see Quick start).

---

## Route reference

| Route                    | Description                                                 | Query controls                                             |
| ------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------- |
| `GET  /<prefix>/query`   | List documents / count mode                                 | `$filter`, `$select`, `$sort`, `$limit`, `$skip`, `$count` |
| `GET  /<prefix>/pages`   | Paged list with meta                                        | same + `$page`, `$size`                                    |
| `GET  /<prefix>/one/:id` | Single document by `_id` or any `@mongo.index.unique` field | `$select` only                                             |
| `POST /<prefix>`         | Insert one or many                                          | –                                                          |
| `PUT  /<prefix>`         | Replace by `_id`                                            | –                                                          |
| `PATCH /<prefix>`        | Update by `_id`                                             | –                                                          |
| `DELETE /<prefix>/:id`   | Remove by `_id`                                             | –                                                          |

---

## Extending example

```ts
@CollectionController(User)
export class UsersController extends AsMongoController<typeof User> {
  /** Add `createdAt` on every insert. */
  protected async onWrite(action, data) {
    if (action === 'insert' && data) {
      ;(data as any).createdAt = new Date()
    }
    return data
  }

  /** Soft delete instead of hard delete. */
  protected async onRemove(id, opts) {
    await this.asCollection.collection.updateOne(
      { _id: this.asCollection.prepareId(id) },
      { $set: { deleted: true, deletedAt: new Date() } }
    )
    // prevent actual deleteOne
    return undefined
  }
}
```

---

## License

MIT © 2025 Artem Maltsev

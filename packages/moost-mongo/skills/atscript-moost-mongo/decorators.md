# Decorators & DI — @atscript/moost-mongo

> Using CollectionController, InjectCollection, and understanding DI wiring.

## `CollectionController(type, prefix?)`

Class decorator that combines three Moost decorators:

1. **`@Provide(COLLECTION_DEF, () => type)`** — Registers the Atscript annotated type in DI
2. **`@Controller(prefix)`** — Registers the class as a Moost HTTP controller
3. **`@Inherit()`** — Copies metadata (routes, guards) from the parent class

```typescript
import { CollectionController } from '@atscript/moost-mongo'
import { User } from './user.as'

@CollectionController(User)           // prefix defaults to @db.table name ("users")
@CollectionController(User, 'people') // explicit prefix
```

### Parameters

- **`type`** — Atscript annotated constructor from a `.as` import
- **`prefix?`** — Optional route prefix. Defaults to `type.metadata.get('db.table')` or `type.name`

## `InjectCollection(type)`

Parameter decorator that injects a lazily-resolved `AsCollection` instance. Use in any DI-managed class, not just controllers.

```typescript
import { InjectCollection } from '@atscript/moost-mongo'
import { AsCollection } from '@atscript/mongo'
import { Injectable } from 'moost'
import { User } from './user.as'

@Injectable()
export class UserService {
  constructor(
    @InjectCollection(User)
    private users: AsCollection<typeof User>
  ) {}

  async findActiveUsers() {
    return this.users.collection.find({ isActive: true }).toArray()
  }
}
```

### Requirements

`AsMongo` must be provided in the current DI scope:

```typescript
@Provide(AsMongo, () => new AsMongo(connectionString))
```

## DI Wiring Pattern

The typical setup:

```typescript
import { AsMongo } from '@atscript/mongo'
import { AsMongoController, CollectionController } from '@atscript/moost-mongo'
import { Provide } from 'moost'
import { User } from './user.as'
import { Product } from './product.as'

// Provide AsMongo at the module/app level
@Provide(AsMongo, () => new AsMongo(process.env.MONGO_URI!))
class AppModule {}

// Each controller gets its own collection automatically
@CollectionController(User)
export class UsersController extends AsMongoController<typeof User> {}

@CollectionController(Product)
export class ProductsController extends AsMongoController<typeof Product> {}
```

## COLLECTION_DEF Token

The DI token under which the Atscript annotated type is registered:

```typescript
import { COLLECTION_DEF } from '@atscript/moost-mongo'
```

This is used internally by `AsMongoController` to resolve the collection type. You typically don't need to use it directly.

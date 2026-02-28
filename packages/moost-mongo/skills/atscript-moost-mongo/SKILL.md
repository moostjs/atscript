---
name: atscript-moost-mongo
description: Use this skill when working with @atscript/moost-mongo — to create REST controllers for MongoDB collections with AsMongoController, use CollectionController decorator, inject collections with InjectCollection, configure query/pagination/sorting with URLQL DTOs, override controller hooks (onWrite/onRemove/transformFilter/prepareSearch), or integrate @atscript/mongo collections into a Moost application.
---

# @atscript/moost-mongo

Moost framework integration for Atscript MongoDB. Provides automated REST controllers for MongoDB collections defined via `.as` types, with full validation, pagination, and search support.

## How to use this skill

Read the domain file that matches the task. Do not load all files — only what you need.

| Domain | File | Load when... |
|--------|------|-------------|
| Core setup & architecture | [core.md](core.md) | Installing, configuring, understanding controller architecture |
| Controllers & hooks | [controllers.md](controllers.md) | Creating controllers, overriding hooks, customizing CRUD behavior |
| Decorators & DI | [decorators.md](decorators.md) | Using CollectionController, InjectCollection, understanding DI wiring |

## Quick reference

```typescript
import { AsMongoController, CollectionController } from '@atscript/moost-mongo'
import { AsMongo } from '@atscript/mongo'
import { Provide } from 'moost'
import { User } from './user.as'

@Provide(AsMongo, () => new AsMongo('mongodb://localhost:27017/mydb'))
@CollectionController(User)
export class UsersController extends AsMongoController<typeof User> {}
// That's it — GET/POST/PUT/PATCH/DELETE endpoints are all automatic
```

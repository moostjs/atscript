import {
  Controller,
  Provide,
  ApplyDecorators,
  Inherit,
  Inject,
  useControllerContext,
  Resolve,
} from 'moost'
import { type TAtscriptAnnotatedTypeConstructor } from '@atscript/typescript'
import { AsMongo } from '@atscript/mongo'

/**
 * DI token under which the AtScript-annotated collection definition
 * is exposed to the controller’s constructor via `@Inject`.
 */
export const COLLECTION_DEF = '__atscript_mongo_collection_def'

/**
 * Combines the boilerplate needed to turn an {@link AsMongoController}
 * subclass into a fully wired HTTP controller for a given
 * **@mongo.collection** model.
 *
 * Internally applies three decorators:
 * 1. **Provide** – registers the collection constructor under {@link COLLECTION_DEF}.
 * 2. **Controller** – registers the class as a Moost HTTP controller
 *    with an optional route prefix. If the prefix is not set, the collection name used by default
 * 3. **Inherit** – copies metadata (routes, guards, etc.) from the
 *    parent class so they stay active in the derived controller.
 *
 * @param type   AtScript-annotated constructor produced by `@mongo.collection`.
 * @param prefix Optional route prefix. Defaults to
 *               `type.metadata.get("mongo.collection")` or the class name.
 *
 * @example
 * ```ts
 * ‎@CollectionController(UserModel)
 * export class UsersController extends AsMongoController<typeof UserModel> {}
 * ```
 */
export const CollectionController = (type: TAtscriptAnnotatedTypeConstructor, prefix?: string) => {
  return ApplyDecorators(
    Provide(COLLECTION_DEF, () => type),
    Controller(prefix || type.metadata.get('mongo.collection') || type.name),
    Inherit()
  )
}

/**
 * Parameter decorator that injects the lazily-resolved {@link AsCollection}
 * instance for a given AtScript model.
 *
 * > `AsMongo` **must** be provided in the current DI scope
 * > (e.g. `@Provide(AsMongo, () => new AsMongo(url))`).
 *
 * @param type AtScript-annotated constructor produced by
 *             `@mongo.collection`.
 *
 * @example
 * ```ts
 * ‎@Injectable()
 * export class SomeProvider {
 *   constructor(
 *     ‎@InjectCollection(User)
 *     private users: AsCollection<typeof User>
 *   ) {}
 * }
 * ```
 */
export const InjectCollection = (type: TAtscriptAnnotatedTypeConstructor) =>
  Resolve(async ({ instantiate }) => {
    const asMongo = await instantiate(AsMongo)
    return asMongo.getCollection(type)
  })

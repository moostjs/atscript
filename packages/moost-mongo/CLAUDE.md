# @atscript/moost-mongo

Moost framework extension for Atscript MongoDB. Provides automated REST controllers for MongoDB collections defined via `.as` types, with full validation support.

## Key Source Files

- `src/index.ts` -- Package entry point; re-exports controller and decorators.
- `src/as-mongo.controller.ts` -- `AsMongoController<T>` base class implementing all REST endpoints with overridable hooks.
- `src/decorators.ts` -- `CollectionController` and `InjectCollection` decorators.
- `src/dto/controls.dto.as` -- Atscript interface definitions for URLQL query controls.
- `src/dto/controls.dto.as.d.ts` / `.as.js` -- Generated TypeScript declarations and runtime code.
- `atscript.config.mts` -- Atscript config enabling `ts()` and `MongoPlugin()` plugins.

## Public API

- **`AsMongoController<T>`** -- Generic base class. Subclass per collection; all CRUD routes are inherited.
- **`CollectionController(type, prefix?)`** -- Class decorator combining `@Provide`, `@Controller`, and `@Inherit`.
- **`InjectCollection(type)`** -- Parameter decorator that injects `AsCollection<T>` via DI.

## REST Endpoints (automatic)

| Route               | Method | Description                         |
| ------------------- | ------ | ----------------------------------- |
| `/<prefix>/query`   | GET    | List with URLQL filtering/sorting   |
| `/<prefix>/pages`   | GET    | Paginated list                      |
| `/<prefix>/one/:id` | GET    | Single doc by `_id` or unique field |
| `/<prefix>`         | POST   | Insert one or many                  |
| `/<prefix>`         | PUT    | Replace by `_id`                    |
| `/<prefix>`         | PATCH  | Partial update by `_id`             |
| `/<prefix>/:id`     | DELETE | Remove by `_id`                     |

## Overridable Hooks

- `init()`, `onWrite(action, data, opts)`, `onRemove(id, opts)`, `transformFilter(filter)`, `transformProjection(projection)`, `prepareSearch/prepareTextSearch/prepareVectorSearch`

## Key commands

```bash
pnpm build                                  # Runs before-build hooks first
pnpm --filter @atscript/moost-mongo test    # Run tests
```

Note: `before-build` script runs `node ../typescript/cli.cjs -f js` to generate `.as.d.ts` + `.as.js`.

### Regenerating `atscript.d.ts`

To regenerate the `src/atscript.d.ts` type declarations after annotation changes:

```bash
cd packages/moost-mongo && node ../typescript/dist/cli.cjs -f dts
```

This scans all `.as` files in the package and rebuilds the `AtscriptMetadata` interface with the correct annotation keys.

## Important patterns

- **Subclass-and-go**: Empty subclass with `@CollectionController` is a complete controller.
- **URLQL query language**: All GET endpoints use `urlql` to parse query strings.
- **`_id` or unique field lookup**: `GET /one/:id` tries `_id` first, then `@db.index.unique` fields.
- **Peer dependencies**: `moost`, `@moostjs/event-http`, `@atscript/mongo`, `@atscript/typescript`, `mongodb`.

# Core Setup — @atscript/moost-mongo

> Installation, configuration, and architecture overview.

## Installation

```bash
npm install @atscript/moost-mongo
# peer dependencies:
npm install @atscript/mongo @atscript/typescript moost @moostjs/event-http mongodb
```

## Configuration

Add both `ts()` and `MongoPlugin()` to your `atscript.config.ts`:

```typescript
import { defineConfig } from '@atscript/core'
import { ts } from '@atscript/typescript'
import { MongoPlugin } from '@atscript/mongo'

export default defineConfig({
  rootDir: 'src',
  plugins: [ts(), MongoPlugin()],
})
```

## Architecture

The package provides three main exports:

- **`AsMongoController<T>`** — Generic base class with all CRUD endpoints
- **`CollectionController(type, prefix?)`** — Class decorator combining `@Provide`, `@Controller`, `@Inherit`
- **`InjectCollection(type)`** — Parameter decorator for DI injection of `AsCollection<T>`

### REST Endpoints (automatic)

| Route | Method | Description |
|-------|--------|-------------|
| `/<prefix>/query` | GET | List with URLQL filtering/sorting |
| `/<prefix>/pages` | GET | Paginated list |
| `/<prefix>/one/:id` | GET | Single doc by `_id` or unique field |
| `/<prefix>` | POST | Insert one or many |
| `/<prefix>` | PUT | Replace by `_id` |
| `/<prefix>` | PATCH | Partial update by `_id` |
| `/<prefix>/:id` | DELETE | Remove by `_id` |

The route prefix defaults to the `@db.table` name but can be overridden in `CollectionController`.

## Regenerating atscript.d.ts

After annotation changes:

```bash
cd packages/moost-mongo && node ../typescript/dist/cli.cjs -f dts
```

## Best Practices

- Use `@CollectionController(Type)` on an empty subclass for zero-config CRUD
- Override hooks (`onWrite`, `onRemove`, `transformFilter`) for custom business logic
- Provide `AsMongo` at the controller level via `@Provide(AsMongo, () => new AsMongo(url))`

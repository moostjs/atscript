# CRUD over HTTP

::: warning Experimental
`@atscript/moost-db` is experimental. APIs may change at any moment.
:::

## Overview

`@atscript/moost-db` provides a generic REST controller that works with any `AtscriptDbTable` + `BaseDbAdapter`. Define your schema in `.as`, wire up a table, and get a full CRUD API with zero endpoint code.

The same controller class works identically whether the underlying adapter is MongoDB, SQLite, or any custom adapter you build. You write the schema once, pick an adapter, and the controller handles all HTTP routing, query parsing, validation, and error handling.

## Installation

::: code-group

```bash [pnpm]
pnpm add @atscript/moost-db moost @moostjs/event-http
```

```bash [npm]
npm install @atscript/moost-db moost @moostjs/event-http
```

```bash [yarn]
yarn add @atscript/moost-db moost @moostjs/event-http
```

:::

You also need a database adapter. Pick one (or both):

::: code-group

```bash [MongoDB]
pnpm add @atscript/mongo mongodb
```

```bash [SQLite]
pnpm add @atscript/db-sqlite better-sqlite3
```

:::

## Quick Start

### 1. Define Your Schema

Create a `.as` file with `@db.*` annotations:

```atscript
// schema/todo.as
@db.table 'todos'
@db.mongo.collection
export interface Todo {
    @meta.id
    @db.default.fn 'increment'
    id: number

    title: string

    description?: string

    @db.default 'false'
    completed: boolean

    @db.default 'medium'
    priority: string

    @db.default.fn 'now'
    createdAt?: number.timestamp.created
}
```

### 2. Initialize the Table

Connect to your database and create the table instance:

```typescript
// init-mongo.ts
import { AsMongo } from '@atscript/mongo'
import { Todo } from './schema/todo.as'

const mongo = new AsMongo('mongodb://localhost:27017/myapp')
export const todosTable = mongo.getTable(Todo)

await todosTable.ensureTable()
await todosTable.syncIndexes()
```

### 3. Create the Controller

Extend `AsDbController` and apply the `@TableController` decorator:

```typescript
// controllers/todo.controller.ts
import { AsDbController, TableController } from '@atscript/moost-db'
import { Todo } from '../schema/todo.as'
import { todosTable } from '../init-mongo'

@TableController(todosTable)
export class TodoController extends AsDbController<typeof Todo> {}
```

That single line gives you a complete CRUD API -- no endpoint methods to write.

### 4. Wire Up the App

Register the controller with Moost and start listening:

```typescript
// main.ts
import { Moost } from 'moost'
import { MoostHttp } from '@moostjs/event-http'
import { TodoController } from './controllers/todo.controller'

const app = new Moost()
app.adapter(new MoostHttp()).listen(3000)
app.registerControllers(
  ['todos', TodoController],
)
await app.init()
```

The first argument to `registerControllers` is the route prefix. All endpoints below are relative to `/todos/`.

## REST Endpoints

The `AsDbController` exposes the following endpoints. All paths are relative to the controller prefix (e.g., `/todos/`).

### `GET /query` -- List Records

Query string is parsed via [`@uniqu/url`](https://github.com/moostjs/uniqu) for filtering, sorting, pagination, and projection.

```
GET /todos/query?status=active&$sort=-createdAt&$limit=10&$select=id,title
```

Returns `DataType[]` by default. If `$count` is set, returns a `number` instead.

When `$search` is provided and the table has fulltext/search indexes, the controller falls back to text search automatically.

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `$skip` | `number` | Number of records to skip |
| `$limit` | `number` | Maximum records to return (default: 1000) |
| `$sort` | `string` | Sort expression (e.g., `-createdAt` for descending) |
| `$select` | `string` | Comma-separated field names for projection |
| `$count` | `boolean` | Return count instead of records |
| `$search` | `string` | Fulltext search term |
| `$index` | `string` | Name of the search index to use |
| `$with` | `string` | Load relations (e.g., `$with=author,comments`) |
| *(other)* | *any* | Filter fields (e.g., `status=active`, `priority=high`) |

**Relation loading:**

```
GET /posts/query?$with=author,comments
GET /posts/query?$with=author,comments($limit=5&$sort=-createdAt)
GET /users/query?$with=posts(status=published&$with=comments(body~=Great))
```

See [URL Query Syntax — `$with`](./crud-http-query-syntax#with-relation-loading) for the full syntax and [Relations](./relations) for schema setup.

### `GET /pages` -- Paginated Results

```
GET /todos/pages?$page=2&$size=10&$sort=-createdAt
```

Returns a paginated response object:

```json
{
  "data": [...],
  "page": 2,
  "itemsPerPage": 10,
  "pages": 5,
  "count": 47
}
```

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `$page` | `number` | `1` | Page number (1-based) |
| `$size` | `number` | `10` | Items per page |
| `$sort` | `string` | — | Sort expression |
| `$select` | `string` | — | Field projection |
| `$search` | `string` | — | Fulltext search term |
| `$index` | `string` | — | Search index name |
| `$with` | `string` | — | Load relations |
| *(other)* | *any* | — | Filter fields |

### `GET /one/:id` -- Single Record

```
GET /todos/one/42
GET /todos/one/69a8c048...
```

Looks up the record by primary key. Returns `404` if not found. Supports `$select` for field projection and `$with` for relation loading in the query string.

Filtering is not allowed on this endpoint -- any filter parameters will return a `400` error.

### `POST /` -- Insert

```
POST /todos/
Content-Type: application/json

{"title": "Buy milk"}
```

Accepts a single object or an array. A single object calls `insertOne`; an array calls `insertMany`. Default values from `@db.default` and `@db.default.fn` are applied automatically.

### `PUT /` -- Replace

```
PUT /todos/
Content-Type: application/json

{"id": 1, "title": "Buy milk", "completed": true, "priority": "high"}
```

Full replacement by primary key. The body must include the primary key field(s) and all required fields.

### `PATCH /` -- Update

```
PATCH /todos/
Content-Type: application/json

{"id": 1, "completed": true}
```

Partial update by primary key. Only the provided fields are changed. Supports [array patch operators](./patch-operations) for fine-grained array manipulation.

### `DELETE /:id` -- Delete

```
DELETE /todos/42
```

Removes the record by primary key. Returns `404` if the record is not found.

### `GET /meta` -- Table Metadata

Returns metadata about the table for use by UI tooling or client libraries:

```json
{
  "searchable": true,
  "searchIndexes": [
    {"name": "DEFAULT", "description": "dynamic_text index"}
  ],
  "type": { ... }
}
```

The `type` field contains the full serialized Atscript type definition, including field names, types, annotations, and metadata.

## Works with Any Adapter

The same controller class works with any database adapter. Only the table initialization changes:

::: code-group

```typescript [MongoDB]
import { AsMongo } from '@atscript/mongo'
import { Todo } from './schema/todo.as'

const mongo = new AsMongo('mongodb://localhost:27017/myapp')
export const todosTable = mongo.getTable(Todo)

await todosTable.ensureTable()
await todosTable.syncIndexes()
```

```typescript [SQLite]
import { AtscriptDbTable } from '@atscript/utils-db'
import { BetterSqlite3Driver, SqliteAdapter } from '@atscript/db-sqlite'
import Database from 'better-sqlite3'
import { Todo } from './schema/todo.as'

const driver = new BetterSqlite3Driver(new Database('./todos.db'))
export const todosTable = new AtscriptDbTable(Todo, new SqliteAdapter(driver))

await todosTable.ensureTable()
await todosTable.syncIndexes()
```

:::

The controller stays identical regardless of the adapter:

```typescript
import { AsDbController, TableController } from '@atscript/moost-db'
import { Todo } from './schema/todo.as'
import { todosTable } from './init-tables'

@TableController(todosTable)
export class TodoController extends AsDbController<typeof Todo> {}
```

## Customizing the Route Prefix

By default, `@TableController` uses the `@db.table` name as the route prefix. You can override it by passing a second argument:

```typescript
@TableController(todosTable, 'api/v2/todos')
export class TodoController extends AsDbController<typeof Todo> {}
```

Or set the prefix when registering the controller:

```typescript
app.registerControllers(
  ['api/v1/todos', TodoController],
)
```

## Overriding Hooks

`AsDbController` provides hooks you can override in subclasses for access control, data transformation, or tenant filtering:

```typescript
@TableController(todosTable)
export class TodoController extends AsDbController<typeof Todo> {
  // Add tenant filtering to all queries
  protected transformFilter(filter: FilterExpr): FilterExpr {
    return { ...filter, tenantId: this.getCurrentTenantId() }
  }

  // Intercept writes for validation or enrichment
  protected onWrite(
    action: 'insert' | 'insertMany' | 'replace' | 'update',
    data: unknown
  ) {
    // Return undefined to abort the operation
    // Return modified data to proceed
    return data
  }

  // Intercept deletes
  protected onRemove(id: unknown) {
    // Return undefined to abort
    return id
  }
}
```

Available hooks:

| Hook | Purpose |
|------|---------|
| `transformFilter(filter)` | Modify the filter before every query |
| `transformProjection(projection)` | Modify field projection before queries |
| `onWrite(action, data)` | Intercept insert/replace/update. Return `undefined` to abort |
| `onRemove(id)` | Intercept delete. Return `undefined` to abort |
| `init()` | One-time initialization hook (called in constructor) |

## See Also

- [Core Annotations](./annotations) -- `@db.*` annotation reference
- [Relations & Foreign Keys](./relations) -- `@db.rel.*` and `$with` loading
- [DB Tables](./tables) -- `AtscriptDbTable` reference
- [Queries & Filters](./queries) -- Filter expression syntax
- [URL Query Syntax](./crud-http-query-syntax) -- Full URL filter and `$with` syntax
- [Patch Operations](./patch-operations) -- Array-level patch operators

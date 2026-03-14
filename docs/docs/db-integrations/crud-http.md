---
outline: deep
---

# HTTP Controllers

<!--@include: ./_experimental-warning.md-->

`@atscript/moost-db` provides zero-boilerplate REST controllers that expose your tables and views as HTTP endpoints via the [Moost](https://moost.org) framework. Define your schema once in a `.as` file, wire up a table, and get a full CRUD API with no endpoint code to write.

## Installation

```bash
pnpm add @atscript/moost-db @moostjs/event-http moost
```

You also need a database adapter:

```bash
# Pick one (or both)
pnpm add @atscript/db-sqlite better-sqlite3   # SQLite
pnpm add @atscript/db-mongo mongodb              # MongoDB
```

## Quick Start

### 1. Define Your Schema

Create a `.as` file with `@db.*` annotations:

```atscript
// schema/todo.as
@db.table 'todos'
export interface Todo {
    @meta.id
    @db.default.increment
    id: number

    title: string

    description?: string

    @db.default 'false'
    completed: boolean

    @db.default 'medium'
    priority: string

    createdAt?: number.timestamp.created
}
```

### 2. Create DbSpace and Table

```typescript
import { AtscriptDbTable } from '@atscript/db-utils'
import { BetterSqlite3Driver, SqliteAdapter } from '@atscript/db-sqlite'
import { Todo } from './schema/todo.as'

const driver = new BetterSqlite3Driver('./todos.db')
export const todosTable = new AtscriptDbTable(Todo, new SqliteAdapter(driver))
```

### 3. Create the Controller

Extend `AsDbController` and apply the `@TableController` decorator:

```typescript
import { AsDbController, TableController } from '@atscript/moost-db'
import { Todo } from './schema/todo.as'
import { todosTable } from './db'

@TableController(todosTable)
export class TodoController extends AsDbController<typeof Todo> {}
```

That single line gives you a complete CRUD API -- no endpoint methods to write.

### 4. Register in Moost App

```typescript
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

All endpoints below are relative to the controller prefix (`/todos/`).

## Generated Endpoints

`AsDbController` exposes the following endpoints, all relative to the controller prefix:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/query` | List records with filtering, sorting, pagination |
| `GET` | `/pages` | Paginated results with metadata |
| `GET` | `/one/:id` | Single record by primary key |
| `POST` | `/` | Insert one or many records |
| `PUT` | `/` | Replace one or many records |
| `PATCH` | `/` | Update one or many records |
| `DELETE` | `/:id` | Delete by primary key |
| `GET` | `/meta` | Table metadata for UI tooling |

## GET /query

Returns an array of records. Supports filtering, sorting, pagination, projection, relation loading, and fulltext search.

```
GET /todos/query?completed=false&$sort=-createdAt&$limit=10&$select=id,title
```

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `$sort` | `string` | Sort expression (e.g., `-createdAt` for descending) |
| `$limit` | `number` | Maximum records to return (default: 1000) |
| `$skip` | `number` | Number of records to skip |
| `$select` | `string` | Comma-separated field names for projection |
| `$count` | `boolean` | Return count instead of records |
| `$search` | `string` | Fulltext search term |
| `$index` | `string` | Name of the search index to use |
| `$with` | `string` | Load relations (e.g., `$with=author,comments`) |
| *(other)* | *any* | Filter fields (e.g., `status=active`, `priority=high`) |

When `$count` is set, the endpoint returns a `number` instead of an array. When `$search` is provided and the table has fulltext/search indexes, the controller uses text search automatically.

**Relation loading:**

```
GET /todos/query?$with=author,comments
GET /todos/query?$with=author,comments($limit=5&$sort=-createdAt)
```

See [URL Query Syntax](./crud-http-query-syntax) for the full filter and `$with` syntax.

## GET /pages

Returns paginated results with metadata.

```
GET /todos/pages?$page=2&$size=10&status=active
```

**Additional parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `$page` | `number` | `1` | Page number (1-based) |
| `$size` | `number` | `10` | Items per page |

All other query parameters from `GET /query` (filters, `$sort`, `$select`, `$search`, `$with`) are also supported.

**Response:**

```json
{
  "data": [
    { "id": 11, "title": "Task 11", "status": "active" }
  ],
  "page": 2,
  "itemsPerPage": 10,
  "pages": 5,
  "count": 47
}
```

## GET /one/:id

Retrieves a single record by primary key. Returns `404` if not found.

```
GET /todos/one/42
```

Supports `$select` and `$with` in the query string. Filter parameters (like `status=todo`) are not allowed on this endpoint and return a `400` error.

**Composite keys** -- use query parameters instead of a path parameter:

```
GET /task-tags/one?taskId=1&tagId=2
```

The controller matches query parameters against composite primary keys first, then compound unique indexes.

## POST /

Insert one or many records.

**Single insert:**

```
POST /todos/
Content-Type: application/json

{"title": "Buy milk", "priority": "high"}
```

Response:

```json
{ "insertedId": 1 }
```

**Batch insert:**

```
POST /todos/
Content-Type: application/json

[
  {"title": "Buy milk"},
  {"title": "Write docs"}
]
```

Response:

```json
{ "insertedCount": 2, "insertedIds": [1, 2] }
```

Default values from `@db.default` and generated defaults (`@db.default.increment`, `@db.default.uuid`, `@db.default.now`) are applied automatically. Supports nested relation data for deep insert operations.

::: details Batch edge cases
- **Empty array** `[]` — behavior is adapter-dependent (may return 200, 201, 400, or 500)
- **Single-item array** `[{...}]` — treated as a batch insert, returns `insertedCount` / `insertedIds`
- **Large batches** (100+ items) — supported; the entire batch runs in a single transaction
- **Partial failure** — if any item fails validation or violates a constraint, the entire batch is rolled back
:::

## PUT /

Replace records. The body must include all required fields and the primary key field(s).

**Single replace:**

```
PUT /todos/
Content-Type: application/json

{"id": 1, "title": "Buy oat milk", "completed": true, "priority": "high"}
```

Response:

```json
{ "matchedCount": 1, "modifiedCount": 1 }
```

**Bulk replace** -- send an array of objects. Each object is replaced independently:

```
PUT /todos/
Content-Type: application/json

[
  {"id": 1, "title": "Buy oat milk", "completed": true, "priority": "high"},
  {"id": 2, "title": "Write tests", "completed": false, "priority": "medium"}
]
```

Response:

```json
{ "matchedCount": 2, "modifiedCount": 2 }
```

Nested relation data is supported per item — each record goes through the [deep replace](./deep-operations) process.

## PATCH /

Partial update by primary key. Only the provided fields are changed.

**Single update:**

```
PATCH /todos/
Content-Type: application/json

{"id": 1, "completed": true}
```

Response:

```json
{ "matchedCount": 1, "modifiedCount": 1 }
```

**Bulk update** -- send an array of objects:

```
PATCH /todos/
Content-Type: application/json

[
  {"id": 1, "completed": true},
  {"id": 2, "priority": "high"}
]
```

Response:

```json
{ "matchedCount": 2, "modifiedCount": 2 }
```

Supports [array patch operators](./patch-operations) for fine-grained array manipulation within update payloads.

## DELETE /:id

Removes a single record by primary key. Returns `404` if the record is not found.

```
DELETE /todos/42
```

Response:

```json
{ "deletedCount": 1 }
```

**Composite keys** -- use query parameters:

```
DELETE /task-tags/?taskId=1&tagId=2
```

Response:

```json
{ "deletedCount": 1 }
```

## GET /meta

Returns table metadata for use by UI tooling or client libraries:

```json
{
  "searchable": true,
  "searchIndexes": [
    { "name": "DEFAULT", "description": "dynamic_text index" }
  ],
  "type": { ... }
}
```

The `type` field contains the full serialized Atscript type definition, including field names, types, annotations, and metadata.

## Read-Only Controllers

For views or restricted access, use `AsDbReadableController` with `@ReadableController`. This creates only GET endpoints -- no write operations.

```typescript
import { AsDbReadableController, ReadableController } from '@atscript/moost-db'
import { ActiveTask } from './schema/active-tasks.as'
import { activeTasksView } from './db'

@ReadableController(activeTasksView)
export class ActiveTasksController extends AsDbReadableController<typeof ActiveTask> {}
```

Available endpoints:

- `GET /query` -- List records with filtering, sorting, and pagination
- `GET /pages` -- Paginated results
- `GET /one/:id` -- Single record by ID
- `GET /meta` -- Table metadata

`POST`, `PUT`, `PATCH`, and `DELETE` return 404.

## View Controllers

`@ViewController` is an alias for `@ReadableController` -- they are interchangeable:

```typescript
import { AsDbReadableController, ViewController } from '@atscript/moost-db'
import { TaskStats } from './schema/task-stats.as'
import { taskStatsView } from './db'

@ViewController(taskStatsView)
export class TaskStatsController extends AsDbReadableController<typeof TaskStats> {}
```

## Custom Route Prefix

By default, `@TableController` uses the `@db.table` name as the route prefix. Override it with a second argument:

```typescript
@TableController(todosTable, 'api/v1/todos')
export class TodoController extends AsDbController<typeof Todo> {}
```

Or set the prefix when registering the controller:

```typescript
app.registerControllers(
  ['api/v1/todos', TodoController],
)
```

Both `@ReadableController` and `@ViewController` accept the same optional prefix argument.

## Adapter Agnostic

The same controller code works identically regardless of which database adapter backs the table. Swap the adapter in your table setup and the HTTP API stays unchanged.

```typescript
// Switch from SQLite to MongoDB — no controller changes needed
import { MongoAdapter } from '@atscript/db-mongo'

const todosTable = new AtscriptDbTable(Todo, new MongoAdapter(db, client))
```

## Error Handling

The controller automatically transforms errors into appropriate HTTP responses:

| Error | HTTP Status | Response |
|-------|-------------|----------|
| `ValidatorError` | 400 | `{ message, statusCode, errors: [{ path, message }] }` |
| `DbError` (CONFLICT) | 409 | `{ message, statusCode, errors }` |
| `DbError` (other) | 400 | `{ message, statusCode, errors }` |
| Not found | 404 | Standard 404 |

Validation errors include detailed field-level information with dot-notation paths for nested data:

```json
{
  "message": "Validation failed",
  "statusCode": 400,
  "errors": [
    { "path": "title", "message": "Required field" },
    { "path": "project.title", "message": "Expected string, got number" },
    { "path": "tasks.0.status", "message": "Required field" }
  ]
}
```

## Query Validation

Invalid query parameters return `400` errors with descriptive messages:

| Invalid query | Error reason |
|--------------|--------------|
| `$with=nonexistent` | Navigation property does not exist |
| `$with=projectId` | FK field, not a navigation property |
| `$with=tasks($with=nonexistent)` | Nested relation does not exist |
| `$select=fakefield` | Field does not exist on the type |
| `$sort=nonexistent` | Cannot sort by unknown field |
| `GET /one/1?status=todo` | Filters not allowed on getOne endpoint |

These validations apply to all endpoints that accept query controls — `/query`, `/pages`, and `/one/:id`.

## Next Steps

- [URL Query Syntax](./crud-http-query-syntax) -- Full filter, sort, and `$with` syntax for query strings
- [Customization & Hooks](./crud-http-customization) -- Override hooks for access control, tenant filtering, and data transformation
- [CRUD Operations](./crud) -- `AtscriptDbTable` API reference for programmatic usage

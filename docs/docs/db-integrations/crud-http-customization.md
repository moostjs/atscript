---
outline: deep
---

# Customization & Hooks

<!--@include: ./_experimental-warning.md-->

`AsDbController` and `AsDbReadableController` expose a set of protected hooks that let you extend the default controller behavior without reimplementing endpoints. Override the hooks you need to add access control, data transformation, and business logic.

## Available Hooks

All hooks are protected methods with sensible defaults (pass-through or no-op). Override only the ones you need.

| Hook | Called When | Purpose |
|------|-----------|---------|
| `transformFilter(filter)` | Before every read | Modify filters (add tenant, soft-delete) |
| `transformProjection(projection)` | Before every read | Restrict visible fields |
| `onWrite(action, data)` | Before insert/replace/update | Transform or reject write data |
| `onRemove(id)` | Before delete | Allow or prevent deletion |
| `validateInsights(insights)` | After query parsing | Field-level access control |
| `init()` | On controller construction | One-time setup |

## Multi-Tenant Filtering

`transformFilter()` receives the parsed filter expression and returns a modified one. Every query passes through this hook, making it ideal for cross-cutting read concerns like multi-tenancy:

```typescript
@TableController(todosTable)
export class TodoController extends AsDbController<typeof Todo> {
  protected transformFilter(filter: FilterExpr): FilterExpr {
    const tenantId = this.getCurrentTenantId()
    return { $and: [filter, { tenantId }] }
  }
}
```

The returned filter replaces the original for all read endpoints (`query`, `pages`, `getOne`).

## Soft Deletes

Combine `transformFilter` to exclude deleted records with `onRemove` to set a flag instead of actually removing rows:

```typescript
@TableController(todosTable)
export class TodoController extends AsDbController<typeof Todo> {
  protected transformFilter(filter: FilterExpr): FilterExpr {
    return { $and: [filter, { deletedAt: { $exists: false } }] }
  }

  protected async onRemove(id: unknown) {
    await this.table.updateOne({ id, deletedAt: Date.now() } as any)
    return undefined  // prevent actual deletion
  }
}
```

When `onRemove` returns `undefined`, the controller aborts the DELETE operation and returns an HTTP 500 response. The record stays in the database with a `deletedAt` timestamp, and subsequent reads skip it automatically.

## Hiding Sensitive Fields

`transformProjection()` intercepts the projection before every read. If the client sends a `$select` parameter, `projection` contains it; otherwise it is `undefined`. Use this to enforce field-level exclusions regardless of what the client requests:

```typescript
protected transformProjection(projection?: UniqueryControls['$select']) {
  return projection ?? { password: 0, apiKey: 0, secret: 0 }
}
```

When `projection` is `undefined` (no `$select` from the client), the hook supplies a default exclusion list. When the client does send `$select`, you can merge or override it as needed.

## Write Hooks

`onWrite(action, data)` intercepts all write operations before they reach the database. Return the (possibly modified) data to proceed, or `undefined` to abort. When aborted, the controller returns an HTTP 500 error.

The `action` parameter is one of: `'insert'`, `'insertMany'`, `'replace'`, `'replaceMany'`, `'update'`, or `'updateMany'`.

```typescript
protected onWrite(
  action: 'insert' | 'insertMany' | 'replace' | 'replaceMany' | 'update' | 'updateMany',
  data: unknown
) {
  const record = data as Record<string, unknown>
  if (action === 'insert') {
    return { ...record, createdBy: this.getCurrentUserId() }
  }
  if (action === 'update') {
    return { ...record, updatedBy: this.getCurrentUserId() }
  }
  return data
}
```

You can also use `onWrite` for authorization. Return `undefined` to reject the operation:

```typescript
protected onWrite(action: string, data: unknown) {
  if (!this.getCurrentUser()?.canWrite) {
    return undefined  // abort — returns HTTP 500
  }
  return data
}
```

## Delete Guards

`onRemove(id)` intercepts DELETE requests. It receives the record ID (a string for single-key tables, or an object for composite keys). Return the ID to proceed with deletion, or `undefined` to abort:

```typescript
protected async onRemove(id: unknown) {
  const record = await this.table.findById(id as string)
  if (record?.protected) {
    return undefined  // abort — returns HTTP 500
  }
  return id
}
```

## Field-Level Access Control

`validateInsights(insights)` runs after the URL query string is parsed. The `insights` map reflects every field referenced in the query — whether it appears in a filter, projection, or sort order. The default implementation rejects unknown fields. Return a string message to reject the query with an HTTP 400 error, or `undefined` to allow it.

```typescript
const RESTRICTED_FIELDS = new Set(['salary', 'ssn', 'internalNotes'])

protected validateInsights(insights: Map<string, unknown>): string | undefined {
  // Run the default validation first (rejects unknown fields)
  const base = super.validateInsights(insights)
  if (base) return base

  const user = this.getCurrentUser()
  if (!user?.isAdmin) {
    for (const field of insights.keys()) {
      if (RESTRICTED_FIELDS.has(field)) {
        return `Access denied: cannot query field "${field}"`
      }
    }
  }
  return undefined
}
```

This catches every reference to a restricted field — whether in a filter (`salary>=100000`), a projection (`$select=ssn`), or a sort order (`$order=salary`).

## Initialization Hook

`init()` runs once during controller construction. Use it for schema setup, seeding, or registering watchers. It can return a `Promise` — errors are caught and logged automatically.

```typescript
protected async init() {
  await this.table.ensureTable()
  await this.table.syncIndexes()
}
```

## Accessing the Table

Inside any hook or custom method, you have access to the underlying table instance:

```typescript
this.table     // AtscriptDbTable — full read/write access (AsDbController only)
this.readable  // AtscriptDbReadable — read-only access (both controllers)
```

Both `AsDbController` and `AsDbReadableController` expose `this.readable`. The writable `this.table` property is only available on `AsDbController`.

```typescript
// In any hook or custom method
const count = await this.readable.count({ filter: {}, controls: {} })
this.logger.info(`Primary keys: ${this.table.primaryKeys}`)
this.logger.info(`Indexes: ${this.table.indexes.size}`)
```

## Custom Route Prefixes

By default, the controller route is derived from the table name. Pass a second argument to the decorator to override it:

```typescript
@TableController(todosTable, 'api/v1/todos')
export class TodoController extends AsDbController<typeof Todo> {
  // endpoints are now at /api/v1/todos/query, /api/v1/todos/pages, etc.
}
```

## Combining Hooks

Here is a complete controller combining multi-tenancy, audit fields, soft deletes, and field-level restrictions:

```typescript
const RESTRICTED = new Set(['internalNotes', 'costPrice'])

@TableController(productsTable, 'api/products')
export class ProductController extends AsDbController<typeof Product> {
  protected async init() {
    await this.table.ensureTable()
  }

  protected transformFilter(filter: FilterExpr): FilterExpr {
    return {
      $and: [filter, {
        tenantId: this.getTenantId(),
        deletedAt: { $exists: false },
      }],
    }
  }

  protected transformProjection(projection?: UniqueryControls['$select']) {
    return projection ?? { costPrice: 0 }
  }

  protected onWrite(action: string, data: unknown) {
    const record = data as Record<string, unknown>
    if (action === 'insert') {
      return {
        ...record,
        tenantId: this.getTenantId(),
        createdBy: this.getUserId(),
      }
    }
    return {
      ...record,
      tenantId: this.getTenantId(),
      updatedBy: this.getUserId(),
    }
  }

  protected async onRemove(id: unknown) {
    await this.table.updateOne({ id, deletedAt: Date.now() } as any)
    return undefined  // soft delete — abort actual removal
  }

  protected validateInsights(insights: Map<string, unknown>): string | undefined {
    const base = super.validateInsights(insights)
    if (base) return base

    for (const field of insights.keys()) {
      if (RESTRICTED.has(field) && !this.isAdmin()) {
        return `Access denied: cannot query field "${field}"`
      }
    }
    return undefined
  }
}
```

## Next Steps

- [CRUD over HTTP](./crud-http) -- REST endpoint reference and setup
- [URL Query Syntax](./crud-http-query-syntax) -- Query string format for filtering, sorting, and pagination
- [CRUD Operations](./crud) -- Direct `AtscriptDbTable` API reference

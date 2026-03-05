# Customization

::: warning Experimental
The CRUD controller is experimental. APIs may change at any moment.
:::

## Overview

`AsDbController` provides hooks to customize request handling without reimplementing endpoints. Override these protected methods in your controller subclass.

## Hooks

### `transformFilter(filter)`

Called before every read operation. Use it to add tenant filtering, soft-delete exclusion, or access control.

```typescript
@TableController(todosTable)
export class TodoController extends AsDbController<typeof Todo> {
  // Multi-tenancy: always filter by current tenant
  protected override transformFilter(filter: FilterExpr): FilterExpr {
    const tenantId = getCurrentTenantId()
    return { $and: [filter, { tenantId }] }
  }
}
```

### `transformProjection(projection)`

Called before every read operation. Use it to always exclude sensitive fields.

```typescript
protected override transformProjection(projection?: UniqueryControls['$select']) {
  // Always exclude sensitive fields
  return projection ?? { password: 0, secret: 0 }
}
```

### `onWrite(action, data)`

Intercepts write operations (insert, insertMany, replace, update). Return modified data, or `undefined` to abort the operation.

```typescript
protected override async onWrite(
  action: 'insert' | 'insertMany' | 'replace' | 'update',
  data: unknown
) {
  // Add audit fields
  if (action === 'insert') {
    return { ...(data as Record<string, unknown>), createdBy: getCurrentUserId() }
  }
  return data
}
```

### `onRemove(id)`

Intercepts delete operations. Return the ID to proceed, or `undefined` to abort.

```typescript
protected override async onRemove(id: unknown) {
  // Prevent deletion of protected records
  const record = await this.table.findById(id as string)
  if (record?.protected) {
    return undefined // abort — controller returns 500
  }
  return id
}
```

### `init()`

One-time initialization hook, called in the constructor. Use for seeding data, registering watchers, etc.

```typescript
protected override async init() {
  await this.table.ensureTable()
  await this.table.syncIndexes()
  this.logger.info('Table initialized')
}
```

## Patterns

### Soft Deletes

Instead of deleting records, mark them as deleted and filter them out:

```typescript
@TableController(todosTable, 'todos')
export class TodoController extends AsDbController<typeof Todo> {
  protected override transformFilter(filter: FilterExpr): FilterExpr {
    return { $and: [filter, { deletedAt: { $exists: false } }] }
  }

  protected override async onRemove(id: unknown) {
    // Soft delete: set deletedAt instead of actually deleting
    await this.table.updateOne({
      id: Number(id),
      deletedAt: Date.now(),
    } as any)
    return undefined // abort the real delete
  }
}
```

### Access Control

```typescript
@TableController(todosTable)
export class TodoController extends AsDbController<typeof Todo> {
  protected override async onWrite(action: string, data: unknown) {
    const user = getCurrentUser()
    if (!user?.canWrite) {
      return undefined // abort
    }
    return data
  }

  protected override transformFilter(filter: FilterExpr): FilterExpr {
    const user = getCurrentUser()
    if (!user?.isAdmin) {
      // Non-admins can only see their own records
      return { $and: [filter, { ownerId: user.id }] }
    }
    return filter
  }
}
```

### Field-Level Access Control

Override `validateInsights` to restrict which fields certain roles can filter, sort, or select. The controller calls this hook automatically for every query, passing a [Uniquery insights](./queries#insights) map of all fields mentioned in the request:

```typescript
const RESTRICTED_FIELDS = new Set(['salary', 'ssn', 'internalNotes'])

@TableController(employeesTable)
export class EmployeeController extends AsDbController<typeof Employee> {
  protected override validateInsights(
    insights: Map<string, unknown>
  ): string | undefined {
    // Run the default validation first (rejects unknown fields)
    const base = super.validateInsights(insights)
    if (base) return base

    const user = getCurrentUser()
    if (!user?.isAdmin) {
      for (const field of insights.keys()) {
        if (RESTRICTED_FIELDS.has(field)) {
          return `Access denied: cannot query field "${field}"`
        }
      }
    }
    return undefined
  }
}
```

This checks every field mentioned in the query — whether in filters (`salary>=100000`), projections (`$select=ssn`), or sorting (`$order=salary`) — and returns a 400 error if a restricted field is referenced by a non-admin.

### Custom Route Prefix

The `@TableController` decorator accepts an optional prefix:

```typescript
@TableController(todosTable, 'api/v1/todos')
export class TodoController extends AsDbController<typeof Todo> {}
```

If omitted, the prefix defaults to `table.tableName` (e.g., `'todos'`).

## Validation Errors

The controller uses `@UseValidationErrorTransform()` to convert Atscript validation errors into HTTP 400 responses. This is applied automatically — validation failures on insert/update return structured error messages.

## Accessing the Table

The `this.table` property gives direct access to the underlying `AtscriptDbTable`:

```typescript
protected override async init() {
  // Access table metadata
  this.logger.info(`Primary keys: ${this.table.primaryKeys}`)
  this.logger.info(`Indexes: ${this.table.indexes.size}`)

  // Use table API directly for custom operations
  const count = await this.table.count({ filter: {}, controls: {} })
  this.logger.info(`Records: ${count}`)
}
```

## See Also

- [CRUD over HTTP](./crud-http) — REST endpoint reference
- [URL Query Syntax](./crud-http-query-syntax) — Query string format
- [Tables API](./tables) — AtscriptDbTable reference

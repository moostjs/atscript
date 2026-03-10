---
outline: deep
---

# Schema Sync & Migrations

<!--@include: ./_experimental-warning.md-->

Schema sync compares your `.as` definitions against the live database and applies changes automatically. There are no manual migration files to write, review, or track -- your `.as` files _are_ the schema, and `asc db sync` brings the database in line with them.

## Quick Start

Run the sync command from your project root:

```bash
npx asc db sync
```

This will:

1. Compile your `.as` files
2. Compare them against the current database schema
3. Show you a detailed plan of what will change
4. Ask for confirmation before applying

If nothing has changed since the last sync, it exits immediately (zero cost).

## CLI Options

| Flag | Description |
|------|-------------|
| `--dry-run` | Show the plan without applying changes |
| `--yes` | Skip the confirmation prompt |
| `--force` | Re-sync even if the schema hash matches |
| `--safe` | Refuse destructive changes (column drops, type changes) |
| `-c, --config` | Path to atscript config file |

### Examples

Preview what would change without touching the database:

```bash
npx asc db sync --dry-run
```

Auto-approve for CI/CD pipelines:

```bash
npx asc db sync --yes
```

Safe mode -- only allow additive changes (new tables, new columns):

```bash
npx asc db sync --safe
```

Force a full re-sync, ignoring the stored hash:

```bash
npx asc db sync --force
```

## Configuration

Add a `db` section to your `atscript.config.mts`:

```typescript
import { defineConfig } from '@atscript/core'
import ts from '@atscript/typescript'

export default defineConfig({
  rootDir: 'src',
  plugins: [ts()],
  format: 'dts',
  db: {
    adapter: '@atscript/db-sqlite',
    connection: './myapp.db',
  },
})
```

| Option | Description |
|--------|-------------|
| `adapter` | Package name of the DB adapter (e.g., `'@atscript/db-sqlite'`) |
| `connection` | Connection string or file path passed to the adapter |

## What Gets Synced

Schema sync handles the full lifecycle of your database objects:

- **Tables** -- create new tables, rename existing ones (via `@db.table.renamed`)
- **Columns** -- add new columns, rename them (via `@db.column.renamed`), detect type changes
- **Indexes** -- create or drop indexes to match `@db.index.*` annotations
- **Foreign keys** -- created alongside tables (SQLite) or as standalone constraints
- **Views** -- create and drop managed views; external views are validated but not modified
- **Removed objects** -- tables and views no longer in your schema are dropped (unless `--safe` is active)

## Rename Tracking

Renames are tricky -- without explicit tracking, a renamed field looks like a drop + add, which loses data. Three annotations solve this:

### Column Renames

```atscript
@db.column.renamed 'email_address'
email: string
```

This tells sync to `ALTER TABLE RENAME COLUMN email_address TO email` instead of dropping `email_address` and creating `email`.

### Table Renames

```atscript
@db.table 'app_users'
@db.table.renamed 'old_users'
export interface User {
  // ...
}
```

Sync will rename the table from `old_users` to `app_users`.

### View Renames

```atscript
@db.view 'premium_users'
@db.view.renamed 'vip_users'
export interface PremiumUser {
  // ...
}
```

::: tip
Keep `@db.*.renamed` annotations in your `.as` files until the rename has been deployed to all environments. After that, you can safely remove them.
:::

## Structural Changes

Some changes cannot be applied with a simple `ALTER TABLE` -- for example, changing a column's type in SQLite. The `@db.sync.method` annotation controls how sync handles these cases:

### Drop and Recreate (data lost)

```atscript
@db.table 'sessions'
@db.sync.method 'drop'
export interface Session {
  // ...
}
```

The table is dropped and recreated from scratch. Use this for ephemeral data like sessions or caches.

### Copy and Swap (data preserved)

```atscript
@db.table 'users'
@db.sync.method 'recreate'
export interface User {
  // ...
}
```

Sync creates a temporary table with the new schema, copies all compatible data from the old table, drops the old table, and renames the temporary one. Data is preserved wherever types are compatible.

| Method | Data | Best For |
|--------|------|----------|
| `'drop'` | Lost | Caches, sessions, temporary data |
| `'recreate'` | Preserved | Important data with type or constraint changes |

The default behavior depends on the adapter. When structural changes are detected and no `@db.sync.method` is specified, the plan will flag the entry as needing attention.

## Drift Detection

Schema sync uses a deterministic FNV-1a hash computed from the full table structure -- fields, types, indexes, foreign keys, and view definitions. The hash is stored in the `__atscript_control` table.

On each sync:

1. A hash is computed from all your current `.as` definitions
2. It is compared against the stored hash from the last sync
3. If they match, sync exits immediately -- no database introspection needed

This makes it safe and cheap to call `asc db sync` on every deployment or application startup, even when nothing has changed. Use `--force` to bypass the hash check and introspect the database regardless.

## Distributed Locking

When multiple instances of your application start simultaneously (e.g., Kubernetes pods or serverless functions), schema sync uses a distributed lock to prevent concurrent migrations:

- A lock is acquired in the `__atscript_control` table before syncing
- Other instances poll and wait (up to 60 seconds by default) for the lock to release
- If another instance already synced (hash matches), the waiting instance skips sync entirely
- Locks auto-expire after 30 seconds to prevent deadlocks from crashed processes

The lock parameters are configurable via the programmatic API (`lockTtlMs`, `waitTimeoutMs`, `pollIntervalMs`).

## Sync Plan Output

The sync plan shows a per-table/view summary with clear status indicators:

| Status | Meaning |
|--------|---------|
| `create` | New table or view will be created |
| `alter` | Existing table will be modified (columns added, renamed, etc.) |
| `drop` | Table or view no longer in schema and will be removed |
| `in-sync` | No changes needed |

For entries with `alter` status, the plan details:

- **Columns to add** -- new fields with their types and constraints
- **Columns to rename** -- old name to new name mappings
- **Type changes** -- column type mismatches (e.g., `TEXT` to `INTEGER`)
- **Nullable changes** -- fields changing between required and optional
- **Default changes** -- updated default values
- **Columns to drop** -- fields no longer in the schema

Entries involving destructive operations (drops, type changes, table recreations) are flagged with a destructive warning so you can review them carefully before confirming.

## Programmatic Usage

You can run sync from your own code using the `SchemaSync` class or the `syncSchema` convenience function:

```typescript
import { DbSpace } from '@atscript/utils-db'
import { SchemaSync, syncSchema } from '@atscript/utils-db/sync'

const db = new DbSpace(adapterFactory)

// Option 1: Plan first, then decide
const sync = new SchemaSync(db)
const plan = await sync.plan(types)
console.log(plan.status)  // 'up-to-date' | 'changes-needed'
for (const entry of plan.entries) {
  console.log(entry.name, entry.status, entry.destructive)
}

// Option 2: Run directly
const result = await sync.run(types, { force: false, safe: true })
console.log(result.status)  // 'up-to-date' | 'synced' | 'synced-by-peer'

// Option 3: One-liner with syncSchema
const result2 = await syncSchema(db, types, { safe: true })
```

The `TSyncOptions` object supports:

| Option | Default | Description |
|--------|---------|-------------|
| `force` | `false` | Ignore hash check, always introspect |
| `safe` | `false` | Skip destructive operations |
| `podId` | random UUID | Identifier for distributed locking |
| `lockTtlMs` | `30000` | Lock time-to-live in milliseconds |
| `waitTimeoutMs` | `60000` | Max wait time for another pod's lock |
| `pollIntervalMs` | `500` | Poll interval when waiting for lock |

## Best Practices

- **Always use `--dry-run` first in production.** Review the plan before applying changes to a live database.
- **Use `--safe` in CI/CD** to prevent accidental destructive changes from reaching production without explicit review.
- **Keep `@db.*.renamed` annotations** until the rename has been deployed to all environments (dev, staging, production). Remove them afterward to keep your schema clean.
- **Use `@db.sync.method 'recreate'`** for type changes on important tables to preserve data during the migration.
- **Run sync on startup** for development databases -- the hash check makes it effectively free when nothing has changed.
- **Use distributed locking defaults** unless you have a specific reason to change them -- the 30s TTL and 60s wait timeout work well for most deployments.

## Next Steps

- [Transactions](./transactions) -- transaction support across adapters
- [Tables & Fields](./tables) -- defining tables, columns, types, and constraints
- [Creating Custom Adapters](./creating-adapters) -- building your own database adapter

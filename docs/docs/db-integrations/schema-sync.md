---
outline: deep
---

# Schema Sync

Schema sync automatically keeps your database in sync with your `.as` definitions. It detects changes, plans migrations, and applies them — no manual migration files needed.

## CLI Usage

```bash
npx asc db sync
```

This command:
1. Compiles your `.as` files
2. Compares them against the current database schema
3. Shows you what will change
4. Asks for confirmation before applying

### Options

| Flag | Description |
|------|-------------|
| `--dry-run` | Show the plan without applying changes |
| `--yes` | Skip confirmation prompt (for CI/CD) |
| `--force` | Re-sync even if schema hash matches |
| `--safe` | Skip destructive operations (column/table drops) |
| `-c, --config` | Path to atscript config file |

### Examples

Preview changes without applying:

```bash
npx asc db sync --dry-run
```

Auto-approve for CI pipelines:

```bash
npx asc db sync --yes
```

Safe mode — only additive changes:

```bash
npx asc db sync --safe
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
| `adapter` | Package name of the adapter (e.g., `'@atscript/db-sqlite'`) |
| `connection` | Connection string or path passed to the adapter |

## What Gets Synced

Schema sync handles:

- **New tables** — `CREATE TABLE` with all columns, types, and constraints
- **New columns** — `ALTER TABLE ADD COLUMN` with smart defaults for NOT NULL fields
- **Column renames** — `ALTER TABLE RENAME COLUMN` (when tracked with `@db.column.renamed`)
- **Table renames** — `ALTER TABLE RENAME TO` (when tracked with `@db.table.renamed`)
- **Index sync** — Creates, updates, or drops managed indexes
- **Foreign keys** — Creates FK constraints
- **Views** — Creates managed views, validates external views exist
- **Removed tables/views** — Drops tables no longer in your schema (unless `--safe`)

## Tracking Renames

### Column Renames

When you rename a field, use `@db.column.renamed` to preserve data:

```atscript
@db.column.renamed 'email_address'
email: string
// Renames column from 'email_address' to 'email' instead of dropping + adding
```

### Table Renames

Track table name changes with `@db.table.renamed`:

```atscript
@db.table 'app_users'
@db.table.renamed 'old_users'
export interface User { ... }
// Renames table from 'old_users' to 'app_users'
```

Similarly for views:

```atscript
@db.view 'premium_users'
@db.view.renamed 'vip_users'
```

::: tip
Remove the `renamed` annotations after the migration has been applied to all environments.
:::

## Handling Structural Changes

When a column's type changes or columns need to be dropped, sync needs a strategy. Use `@db.sync.method`:

```atscript
@db.table 'sessions'
@db.sync.method 'drop'
export interface Session { ... }
// Drops and recreates the table (data lost — for ephemeral data)
```

```atscript
@db.table 'users'
@db.sync.method 'recreate'
export interface User { ... }
// Creates temp table → copies data → drops old → renames (data preserved)
```

| Method | Data | Use Case |
|--------|------|----------|
| `'drop'` | Lost | Caches, sessions, temporary data |
| `'recreate'` | Preserved | Important data with type changes |

## Drift Detection

Schema sync uses **deterministic hashing** to detect whether anything has changed. On each sync:

1. A hash is computed from all table/view snapshots (fields, types, indexes, FKs)
2. The hash is compared against the stored hash in the control table
3. If they match, sync exits immediately — zero cost

This means running `asc db sync` in CI/CD is cheap when nothing has changed.

## Distributed Locking

When multiple instances of your application start simultaneously (e.g., Kubernetes pods), schema sync uses a distributed lock to prevent concurrent migrations:

- A lock is acquired in the `__atscript_control` table before syncing
- Other instances wait (up to 60 seconds by default) for the lock to release
- If another instance already synced (hash matches), the waiting instance skips sync
- Locks auto-expire after 30 seconds to prevent deadlocks

This makes `asc db sync` safe to run as part of your application startup.

## Control Table

Schema sync creates a `__atscript_control` table automatically. It stores:

- **Schema hash** — for drift detection
- **Synced tables** — list of tracked tables/views
- **Sync lock** — distributed locking state

You don't need to manage this table — it's created and updated automatically.

## Programmatic Usage

You can also run sync from code:

```typescript
import { DbSpace } from '@atscript/utils-db'
import { SchemaSync } from '@atscript/utils-db/sync'

const db = new DbSpace(adapterFactory)
const sync = new SchemaSync(db)

// Plan (dry-run)
const plan = await sync.plan(types)
console.log(plan.status) // 'up-to-date' or 'changes-needed'

// Execute
const result = await sync.run(types, { force: false, safe: false })
console.log(result.status) // 'synced', 'synced-by-peer', or 'up-to-date'
```

## Next Steps

- [SQLite Adapter](./sqlite) — SQLite-specific setup and features
- [MongoDB Adapter](./mongodb) — MongoDB-specific setup and features
- [Annotations Reference](./annotations) — All sync-related annotations

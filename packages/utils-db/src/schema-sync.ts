import type { TAtscriptAnnotatedType } from '@atscript/typescript/utils'

import { AtscriptDbTable } from './db-table'
import { AtscriptDbView } from './db-view'
import type { AtscriptDbReadable } from './db-readable'
import type { DbSpace } from './db-space'
import type { TGenericLogger } from './logger'
import { NoopLogger } from './logger'
import type { TDbFieldMeta } from './types'
import { computeTableSnapshot, computeSchemaHash } from './schema-hash'
import { computeColumnDiff } from './column-diff'

// ── Public types ──────────────────────────────────────────────────────────

export interface TSyncPlanTable {
  tableName: string
  isNew: boolean
  columnsToAdd: TDbFieldMeta[]
  columnsToRename: Array<{ from: string; to: string }>
  typeChanges: Array<{ column: string; fromType: string; toType: string }>
  columnsToDrop: string[]
  syncMethod?: 'drop' | 'recreate'
  /** If set, this entry is a view. 'V' = virtual view, 'M' = materialized view. */
  viewType?: 'V' | 'M'
}

export interface TSyncPlan {
  status: 'up-to-date' | 'changes-needed'
  schemaHash: string
  tables: TSyncPlanTable[]
  removedTables: string[]
  removedViews: string[]
}

export interface TSyncOptions {
  /** Pod/instance identifier for distributed locking. Default: random UUID. */
  podId?: string
  /** Lock TTL in milliseconds. Default: 30000 (30s). */
  lockTtlMs?: number
  /** How long to wait for another pod's lock before giving up. Default: 60000 (60s). */
  waitTimeoutMs?: number
  /** Poll interval when waiting for lock. Default: 500ms. */
  pollIntervalMs?: number
  /** Force sync even if hash matches. Default: false. */
  force?: boolean
  /** Safe mode — skip destructive operations (column drops, table drops). Default: false. */
  safe?: boolean
}

export interface TSyncTableResult {
  tableName: string
  created: boolean
  columnsAdded: string[]
  columnsRenamed: string[]
  columnsDropped: string[]
  recreated: boolean
  errors: string[]
  /** If set, this entry is a view. 'V' = virtual view, 'M' = materialized view. */
  viewType?: 'V' | 'M'
}

export interface TSyncResult {
  status: 'up-to-date' | 'synced' | 'synced-by-peer'
  schemaHash: string
  tables?: TSyncTableResult[]
  removedTables?: string[]
  removedViews?: string[]
}

// ── SchemaSync ────────────────────────────────────────────────────────────

export class SchemaSync {
  private controlTable: AtscriptDbTable | undefined
  private readonly logger: TGenericLogger

  constructor(
    private readonly space: DbSpace,
    logger?: TGenericLogger
  ) {
    this.logger = logger || NoopLogger
  }

  /**
   * Resolves types into categorized readables and computes the schema hash.
   * Both tables and views (virtual + materialized) are tracked and hashed.
   */
  private async resolveAndHash(types: TAtscriptAnnotatedType[]): Promise<{
    tables: AtscriptDbReadable[]
    views: AtscriptDbReadable[]
    hash: string
  }> {
    const tables: AtscriptDbReadable[] = []
    const views: AtscriptDbReadable[] = []
    for (const type of types) {
      const readable = this.space.get(type)
      if (readable.isView) {
        views.push(readable)
      } else {
        tables.push(readable)
      }
    }
    const allReadables = [...tables, ...views]

    const snapshots = allReadables.map(r => computeTableSnapshot(r))
    const hash = computeSchemaHash(snapshots)

    return { tables, views, hash }
  }

  /**
   * Detects tables/views present in the previous sync but absent from the current schema.
   */
  private async detectRemoved(currentReadables: AtscriptDbReadable[]): Promise<{ removedTables: string[]; removedViews: string[] }> {
    const previous = await this.readTrackedList()
    const currentSet = new Set(currentReadables.map(t => t.tableName))
    const removedTables: string[] = []
    const removedViews: string[] = []
    for (const entry of previous) {
      if (!currentSet.has(entry.name)) {
        if (entry.isView) {
          removedViews.push(entry.name)
        } else {
          removedTables.push(entry.name)
        }
      }
    }
    return { removedTables, removedViews }
  }

  /**
   * Runs schema synchronization with distributed locking.
   */
  async run(types: TAtscriptAnnotatedType[], opts?: TSyncOptions): Promise<TSyncResult> {
    const podId = opts?.podId ?? crypto.randomUUID()
    const lockTtlMs = opts?.lockTtlMs ?? 30_000
    const waitTimeoutMs = opts?.waitTimeoutMs ?? 60_000
    const pollIntervalMs = opts?.pollIntervalMs ?? 500
    const force = opts?.force ?? false
    const safe = opts?.safe ?? false

    const { tables, views, hash } = await this.resolveAndHash(types)

    await this.ensureControlTable()

    // Quick check — skip if hash matches
    if (!force) {
      const storedHash = await this.readHash()
      if (storedHash === hash) {
        return { status: 'up-to-date', schemaHash: hash }
      }
    }

    // 4. Acquire lock
    const acquired = await this.tryAcquireLock(podId, lockTtlMs)
    if (!acquired) {
      // Another pod is syncing — wait for it
      await this.waitForLock(waitTimeoutMs, pollIntervalMs)

      // Re-check hash after lock released
      const storedHash = await this.readHash()
      if (storedHash === hash) {
        return { status: 'synced-by-peer', schemaHash: hash }
      }

      // Retry once
      const retryAcquired = await this.tryAcquireLock(podId, lockTtlMs)
      if (!retryAcquired) {
        throw new Error('Failed to acquire schema sync lock after waiting')
      }
    }

    try {
      // 5. Double-check hash (another pod may have finished between our check and lock)
      if (!force) {
        const storedHash = await this.readHash()
        if (storedHash === hash) {
          return { status: 'synced-by-peer', schemaHash: hash }
        }
      }

      // 6. Sync tables
      const tableResults: TSyncTableResult[] = []
      for (const readable of tables) {
        const result = await this.syncTable(readable, safe)
        tableResults.push(result)
      }

      // 7. Sync views
      const allReadables = [...tables, ...views]
      const { removedTables, removedViews } = await this.detectRemoved(allReadables)
      const previouslyTracked = await this.readTrackedList()
      const trackedNames = new Set(previouslyTracked.map(e => e.name))

      const viewResults: TSyncTableResult[] = []
      for (const readable of views) {
        await readable.dbAdapter.ensureTable()
        viewResults.push({
          tableName: readable.tableName,
          created: !trackedNames.has(readable.tableName),
          columnsAdded: [],
          columnsRenamed: [],
          columnsDropped: [],
          recreated: false,
          errors: [],
          viewType: (readable as AtscriptDbView).viewPlan.materialized ? 'M' : 'V',
        })
      }

      // 8. Track tables — detect and drop removed tables/views
      if (!safe) {
        for (const name of [...removedTables, ...removedViews]) {
          await this.space.dropTableByName(name)
        }
      }
      await this.writeTrackedList(allReadables)

      // 9. Write new hash
      await this.writeHash(hash)

      return {
        status: 'synced',
        schemaHash: hash,
        tables: [...tableResults, ...viewResults],
        removedTables: removedTables.length > 0 ? removedTables : undefined,
        removedViews: removedViews.length > 0 ? removedViews : undefined,
      }
    } finally {
      // 9. Always release lock
      await this.releaseLock(podId)
    }
  }

  /**
   * Computes a dry-run plan showing what `run()` would do, without executing any DDL.
   * Creates the internal control table if needed (harmless), but does not modify user tables.
   */
  async plan(types: TAtscriptAnnotatedType[], opts?: Pick<TSyncOptions, 'force' | 'safe'>): Promise<TSyncPlan> {
    const force = opts?.force ?? false
    const safe = opts?.safe ?? false
    const { tables, views, hash } = await this.resolveAndHash(types)
    const allReadables = [...tables, ...views]

    await this.ensureControlTable()

    // Always introspect tables so the plan includes all table statuses
    let planTables = await Promise.all(tables.map(r => this.planTable(r)))

    // Add views to plan (views don't have column introspection)
    const previouslyTracked = await this.readTrackedList()
    const trackedNames = new Set(previouslyTracked.map(e => e.name))
    const viewPlans: TSyncPlanTable[] = views.map(v => ({
      tableName: v.tableName,
      isNew: !trackedNames.has(v.tableName),
      columnsToAdd: [],
      columnsToRename: [],
      typeChanges: [],
      columnsToDrop: [],
      viewType: (v as AtscriptDbView).viewPlan.materialized ? 'M' : 'V',
    }))

    // Quick check — skip if hash matches
    if (!force) {
      const storedHash = await this.readHash()
      if (storedHash === hash) {
        return { status: 'up-to-date', schemaHash: hash, tables: [...planTables, ...viewPlans], removedTables: [], removedViews: [] }
      }
    }
    let removed = await this.detectRemoved(allReadables)

    if (safe) {
      // Hide destructive operations in safe mode
      planTables = planTables.map(t => ({ ...t, columnsToDrop: [] }))
      removed = { removedTables: [], removedViews: [] }
    }

    return {
      status: 'changes-needed',
      schemaHash: hash,
      tables: [...planTables, ...viewPlans],
      removedTables: removed.removedTables,
      removedViews: removed.removedViews,
    }
  }

  private async planTable(readable: AtscriptDbReadable): Promise<TSyncPlanTable> {
    const adapter = readable.dbAdapter
    const tableName = readable.tableName
    const plan: TSyncPlanTable = {
      tableName,
      isNew: false,
      columnsToAdd: [],
      columnsToRename: [],
      typeChanges: [],
      columnsToDrop: [],
      syncMethod: readable.syncMethod,
    }

    // Introspect existing columns (read-only — no ensureTable)
    if (adapter.getExistingColumns) {
      const existing = await adapter.getExistingColumns()
      if (existing.length === 0) {
        // Table doesn't exist yet
        plan.isNew = true
        plan.columnsToAdd = readable.fieldDescriptors.filter(f => !f.ignored)
      } else {
        const diff = computeColumnDiff(readable.fieldDescriptors, existing)
        plan.columnsToAdd = diff.added
        plan.columnsToRename = diff.renamed.map(r => ({ from: r.oldName, to: r.field.physicalName }))
        plan.typeChanges = diff.typeChanged.map(tc => ({
          column: tc.field.physicalName,
          fromType: tc.existingType,
          toType: tc.field.designType,
        }))
        plan.columnsToDrop = diff.removed.map(c => c.name)
      }
    } else {
      // Adapter doesn't support introspection (e.g., MongoDB) — assume table is new if never synced
      plan.isNew = true
    }

    return plan
  }

  // ── Table sync ────────────────────────────────────────────────────────

  private async syncTable(readable: AtscriptDbReadable, safe: boolean): Promise<TSyncTableResult> {
    const adapter = readable.dbAdapter
    const tableName = readable.tableName
    const result: TSyncTableResult = {
      tableName,
      created: false,
      columnsAdded: [],
      columnsRenamed: [],
      columnsDropped: [],
      recreated: false,
      errors: [],
    }

    // Column diff (if adapter supports introspection)
    if (adapter.getExistingColumns && adapter.syncColumns) {
      const existing = await adapter.getExistingColumns()
      if (existing.length === 0) {
        // Table doesn't exist yet — create it
        await adapter.ensureTable()
        result.created = true
      } else {
        const diff = computeColumnDiff(readable.fieldDescriptors, existing)

        // Handle type changes — may require recreation
        if (diff.typeChanged.length > 0) {
          const syncMethod = readable.syncMethod
          if (syncMethod === 'drop' && adapter.dropTable) {
            await adapter.dropTable()
            await adapter.ensureTable()
            result.recreated = true
          } else if (syncMethod === 'recreate' && adapter.recreateTable) {
            await adapter.recreateTable()
            result.recreated = true
          } else {
            for (const change of diff.typeChanged) {
              const msg = `Type change on ${tableName}.${change.field.physicalName} ` +
                `(${change.existingType} → ${change.field.designType}). ` +
                `Add @db.sync.method "recreate" or "drop", or migrate manually.`
              this.logger.error?.(
                `[schema-sync] ${msg}`
              )
              result.errors.push(msg)
            }
          }
        }

        // Handle renames and adds (skip if table was recreated — columns are already correct)
        if (!result.recreated && (diff.added.length > 0 || diff.renamed.length > 0)) {
          const syncResult = await adapter.syncColumns(diff)
          result.columnsAdded = syncResult.added
          result.columnsRenamed = syncResult.renamed
        }

        // Drop stale columns (unless safe mode or table was recreated)
        if (!safe && !result.recreated && diff.removed.length > 0 && adapter.dropColumns) {
          const colNames = diff.removed.map(c => c.name)
          await adapter.dropColumns(colNames)
          result.columnsDropped = colNames
        }
      }
    } else {
      // No introspection — just ensure table exists
      await adapter.ensureTable()
    }

    // Sync indexes
    await adapter.syncIndexes()

    // Sync foreign keys (if adapter supports it)
    if (adapter.syncForeignKeys) {
      await adapter.syncForeignKeys()
    }

    return result
  }

  // ── Control table ─────────────────────────────────────────────────────

  private async ensureControlTable(): Promise<void> {
    if (!this.controlTable) {
      // Import the compiled .as type
      const { AtscriptControl } = await import('./control.as.js')
      this.controlTable = this.space.getTable(AtscriptControl)
    }
    await this.controlTable.ensureTable()
  }

  private async readControlValue(key: string): Promise<string | null> {
    const row = await this.controlTable!.findOne({
      filter: { key: { $eq: key } },
      controls: {},
    })
    return (row as Record<string, unknown> | null)?.value as string | null ?? null
  }

  private async writeControlValue(key: string, value: string): Promise<void> {
    const existing = await this.readControlValue(key)
    if (existing !== null) {
      await this.controlTable!.replaceOne({ key, value } as any)
    } else {
      await this.controlTable!.insertOne({ key, value } as any)
    }
  }

  private async readHash(): Promise<string | null> {
    return this.readControlValue('schema_version')
  }

  private async writeHash(hash: string): Promise<void> {
    await this.writeControlValue('schema_version', hash)
  }

  // ── Table tracking ──────────────────────────────────────────────────

  private async readTrackedList(): Promise<Array<{ name: string; isView: boolean }>> {
    const value = await this.readControlValue('synced_tables')
    if (!value) { return [] }
    const parsed = JSON.parse(value)
    // Backwards-compatible: old format was string[], new format is { name, isView }[]
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
      return (parsed as string[]).map(name => ({ name, isView: false }))
    }
    return parsed
  }

  private async writeTrackedList(readables: AtscriptDbReadable[]): Promise<void> {
    const entries = readables.map(r => ({ name: r.tableName, isView: r.isView }))
    entries.sort((a, b) => a.name.localeCompare(b.name))
    await this.writeControlValue('synced_tables', JSON.stringify(entries))
  }

  // ── Distributed lock ──────────────────────────────────────────────────

  private async tryAcquireLock(podId: string, ttlMs: number): Promise<boolean> {
    const now = Date.now()

    // Check for expired lock and clean it up
    const existing = await this.controlTable!.findOne({
      filter: { key: { $eq: 'sync_lock' } },
      controls: {},
    }) as Record<string, unknown> | null

    if (existing) {
      const expiresAt = existing.expiresAt as number
      if (expiresAt && expiresAt < now) {
        // Stale lock — clean up
        await this.controlTable!.deleteOne('sync_lock' as any)
      } else {
        // Lock is held and not expired
        return false
      }
    }

    // Try to insert lock row
    try {
      await this.controlTable!.insertOne({
        key: 'sync_lock',
        lockedBy: podId,
        lockedAt: now,
        expiresAt: now + ttlMs,
      } as any)
      return true
    } catch {
      // Duplicate key — another pod grabbed the lock between our check and insert
      return false
    }
  }

  private async releaseLock(podId: string): Promise<void> {
    try {
      const existing = await this.controlTable!.findOne({
        filter: { key: { $eq: 'sync_lock' } },
        controls: {},
      }) as Record<string, unknown> | null

      // Only release if we own the lock
      if (existing && existing.lockedBy === podId) {
        await this.controlTable!.deleteOne('sync_lock' as any)
      }
    } catch {
      // Best effort — lock will expire anyway
    }
  }

  private async waitForLock(timeoutMs: number, pollIntervalMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      const lock = await this.controlTable!.findOne({
        filter: { key: { $eq: 'sync_lock' } },
        controls: {},
      }) as Record<string, unknown> | null

      if (!lock) { return } // Lock released

      const expiresAt = lock.expiresAt as number
      if (expiresAt && expiresAt < Date.now()) {
        // Expired — clean up and return
        await this.controlTable!.deleteOne('sync_lock' as any)
        return
      }

      await new Promise<void>(resolve => { setTimeout(resolve, pollIntervalMs) })
    }

    throw new Error(`Schema sync lock wait timed out after ${timeoutMs}ms`)
  }
}

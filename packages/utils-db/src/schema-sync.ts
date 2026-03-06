import type { TAtscriptAnnotatedType } from '@atscript/typescript/utils'

import { AtscriptDbTable } from './db-table'
import { AtscriptDbView } from './db-view'
import type { AtscriptDbReadable } from './db-readable'
import type { DbSpace } from './db-space'
import type { TGenericLogger } from './logger'
import { NoopLogger } from './logger'
import { computeTableSnapshot, computeSchemaHash } from './schema-hash'
import { computeColumnDiff } from './column-diff'

// ── Public types ──────────────────────────────────────────────────────────

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
}

export interface TSyncTableResult {
  tableName: string
  created: boolean
  columnsAdded: string[]
  columnsRenamed: string[]
  recreated: boolean
  errors: string[]
}

export interface TSyncResult {
  status: 'up-to-date' | 'synced' | 'synced-by-peer'
  schemaHash: string
  tables?: TSyncTableResult[]
  removedTables?: string[]
}

// ── SchemaSync ────────────────────────────────────────────────────────────

export class SchemaSync {
  private controlTable: AtscriptDbTable | undefined
  private readonly logger: TGenericLogger

  constructor(
    private readonly space: DbSpace,
    private readonly _logger?: TGenericLogger
  ) {
    this.logger = _logger || NoopLogger
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

    // Resolve all readables via the space (tables first, views after)
    const tables: AtscriptDbReadable[] = []
    const views: AtscriptDbReadable[] = []
    for (const type of types) {
      const readable = this.space.get(type)
      if (readable instanceof AtscriptDbView) {
        views.push(readable)
      } else {
        tables.push(readable)
      }
    }
    const allReadables = [...tables, ...views]

    // 1. Bootstrap the control table (CREATE TABLE IF NOT EXISTS — safe to race)
    await this.ensureControlTable()

    // 2. Compute schema hash from all types
    const snapshots = allReadables.map(r => computeTableSnapshot(r))
    const hash = computeSchemaHash(snapshots)

    // 3. Quick check — skip if hash matches
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
        const result = await this.syncTable(readable)
        tableResults.push(result)
      }

      // 7. Sync views
      for (const readable of views) {
        await readable.dbAdapter.ensureTable()
      }

      // 8. Track tables — detect removed tables
      const previousTables = await this.readTableList()
      const currentTableNames = tables.map(t => t.tableName)
      const currentTableSet = new Set(currentTableNames)
      const removedTables = previousTables.filter(t => !currentTableSet.has(t))
      await this.writeTableList(currentTableNames)

      // 9. Write new hash
      await this.writeHash(hash)

      return {
        status: 'synced',
        schemaHash: hash,
        tables: tableResults,
        removedTables: removedTables.length > 0 ? removedTables : undefined,
      }
    } finally {
      // 9. Always release lock
      await this.releaseLock(podId)
    }
  }

  // ── Table sync ────────────────────────────────────────────────────────

  private async syncTable(readable: AtscriptDbReadable): Promise<TSyncTableResult> {
    const adapter = readable.dbAdapter
    const tableName = readable.tableName
    const result: TSyncTableResult = {
      tableName,
      created: false,
      columnsAdded: [],
      columnsRenamed: [],
      recreated: false,
      errors: [],
    }

    // Ensure table exists
    await adapter.ensureTable()

    // Column diff (if adapter supports introspection)
    if (adapter.getExistingColumns && adapter.syncColumns) {
      const existing = await adapter.getExistingColumns()
      if (existing.length === 0) {
        // Table was just created — no diff needed
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

        if (diff.removed.length > 0) {
          for (const col of diff.removed) {
            this.logger.warn?.(
              `[schema-sync] Stale column detected: ${tableName}.${col.name}. ` +
              `Column exists in DB but not in schema.`
            )
          }
        }
      }
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

  private async readTableList(): Promise<string[]> {
    const value = await this.readControlValue('synced_tables')
    return value ? JSON.parse(value) : []
  }

  private async writeTableList(names: string[]): Promise<void> {
    await this.writeControlValue('synced_tables', JSON.stringify(names.sort()))
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

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
    }

    throw new Error(`Schema sync lock wait timed out after ${timeoutMs}ms`)
  }
}

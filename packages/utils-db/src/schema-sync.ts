// oxlint-disable max-classes-per-file
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

// ── Colors ───────────────────────────────────────────────────────────────

export interface TSyncColors {
  green(s: string): string
  red(s: string): string
  cyan(s: string): string
  yellow(s: string): string
  bold(s: string): string
  dim(s: string): string
  underline(s: string): string
}

const noColor: TSyncColors = {
  green: s => s, red: s => s, cyan: s => s, yellow: s => s,
  bold: s => s, dim: s => s, underline: s => s,
}

// ── SyncEntry ────────────────────────────────────────────────────────────

export type TSyncEntryStatus = 'create' | 'alter' | 'drop' | 'in-sync' | 'error'

export interface TSyncEntryInit {
  name: string
  /** 'V' = virtual view, 'M' = materialized view, 'E' = external view, undefined = table */
  viewType?: 'V' | 'M' | 'E'
  status: TSyncEntryStatus
  syncMethod?: 'drop' | 'recreate'
  columnsToAdd?: TDbFieldMeta[]
  columnsToRename?: Array<{ from: string; to: string }>
  typeChanges?: Array<{ column: string; fromType: string; toType: string }>
  columnsToDrop?: string[]
  columnsAdded?: string[]
  columnsRenamed?: string[]
  columnsDropped?: string[]
  recreated?: boolean
  errors?: string[]
  renamedFrom?: string
}

export class SyncEntry {
  readonly name: string
  /** 'V' = virtual view, 'M' = materialized view, 'E' = external view, undefined = table */
  readonly viewType?: 'V' | 'M' | 'E'
  readonly status: TSyncEntryStatus
  readonly syncMethod?: 'drop' | 'recreate'

  // Plan fields
  readonly columnsToAdd: TDbFieldMeta[]
  readonly columnsToRename: Array<{ from: string; to: string }>
  readonly typeChanges: Array<{ column: string; fromType: string; toType: string }>
  readonly columnsToDrop: string[]

  // Result fields
  readonly columnsAdded: string[]
  readonly columnsRenamed: string[]
  readonly columnsDropped: string[]
  readonly recreated: boolean
  readonly errors: string[]
  readonly renamedFrom?: string

  constructor(init: TSyncEntryInit) {
    this.name = init.name
    this.viewType = init.viewType
    this.status = init.status
    this.syncMethod = init.syncMethod
    this.columnsToAdd = init.columnsToAdd ?? []
    this.columnsToRename = init.columnsToRename ?? []
    this.typeChanges = init.typeChanges ?? []
    this.columnsToDrop = init.columnsToDrop ?? []
    this.columnsAdded = init.columnsAdded ?? []
    this.columnsRenamed = init.columnsRenamed ?? []
    this.columnsDropped = init.columnsDropped ?? []
    this.recreated = init.recreated ?? false
    this.errors = init.errors ?? []
    this.renamedFrom = init.renamedFrom
  }

  /** Whether this entry involves destructive operations */
  get destructive(): boolean {
    if (this.status === 'drop') {
      // Dropping virtual/external views is not destructive
      return this.viewType !== 'V' && this.viewType !== 'E'
    }
    return this.columnsToDrop.length > 0 || this.typeChanges.length > 0
  }

  /** Whether this entry represents any change (not in-sync) */
  get hasChanges(): boolean {
    return this.status !== 'in-sync' && this.status !== 'error'
  }

  /** Whether this entry has errors */
  get hasErrors(): boolean {
    return this.status === 'error' || this.errors.length > 0
  }

  /** Render this entry for display */
  print(mode: 'plan' | 'result', colors?: TSyncColors): string[] {
    const c = colors ?? noColor
    return mode === 'plan' ? this.printPlan(c) : this.printResult(c)
  }

  // ── Shared helpers ──────────────────────────────────────────────────

  private labelAndPrefix(c: TSyncColors) {
    return {
      label: c.bold(c.underline(this.name)),
      vp: this.viewType ? `${c.dim(`[${this.viewType}]`)} ` : '',
    }
  }

  private printError(c: TSyncColors, label: string, vp: string): string[] {
    return [
      `  ${c.red(`✗ ${vp}${label} — error`)}`,
      ...this.errors.map(err => `      ${c.red(err)}`),
    ]
  }

  // ── Plan printing ───────────────────────────────────────────────────

  private printPlan(c: TSyncColors): string[] {
    const { label, vp } = this.labelAndPrefix(c)

    if (this.status === 'error') {
      return this.printError(c, label, vp)
    }

    if (this.status === 'drop') {
      const kind = this.viewType ? 'drop view' : 'drop table'
      return [`  ${c.red(`- ${vp}${label} — ${kind}`)}`]
    }

    if (this.status === 'create') {
      return [
        `  ${c.green(`+ ${vp}${label} — create`)}`,
        ...this.columnsToAdd.map(col =>
          `      ${c.green(`+ ${col.physicalName} (${col.designType})${col.isPrimaryKey ? ' PK' : ''}${col.optional ? ' nullable' : ''} — add`)}`
        ),
        '',
      ]
    }

    if (this.status === 'alter') {
      const renameInfo = this.renamedFrom ? ` ${c.yellow(`(renamed from ${this.renamedFrom})`)}` : ''
      return [
        `  ${c.cyan(`~ ${vp}${label} — alter${renameInfo}`)}`,
        ...this.columnsToAdd.map(col =>
          `      ${c.green(`+ ${col.physicalName} (${col.designType}) — add`)}`
        ),
        ...this.columnsToRename.map(r =>
          `      ${c.yellow(`~ ${r.from} → ${r.to} — rename`)}`
        ),
        ...this.typeChanges.map(tc => {
          const action = this.syncMethod ? ` — ${this.syncMethod}` : ' — requires migration'
          return `      ${c.red(`! ${tc.column}: ${tc.fromType} → ${tc.toType}${action}`)}`
        }),
        ...this.columnsToDrop.map(col =>
          `      ${c.red(`- ${col} — drop`)}`
        ),
        '',
      ]
    }

    return [this.printInSync(c)]
  }

  // ── Result printing ─────────────────────────────────────────────────

  private printResult(c: TSyncColors): string[] {
    const { label, vp } = this.labelAndPrefix(c)

    if (this.status === 'error') {
      return this.printError(c, label, vp)
    }

    if (this.status === 'drop') {
      const kind = this.viewType ? 'dropped view' : 'dropped table'
      return [`  ${c.red(`- ${vp}${label} — ${kind}`)}`]
    }

    if (this.status === 'create') {
      return [
        `  ${c.green(`+ ${vp}${label} — created`)}`,
        ...this.columnsAdded.map(col => `      ${c.green(`+ ${col} — added`)}`),
        '',
      ]
    }

    const hasColumnChanges = this.columnsAdded.length > 0 ||
      this.columnsRenamed.length > 0 || this.columnsDropped.length > 0

    if (hasColumnChanges || this.recreated || this.renamedFrom) {
      const rlabel = this.recreated ? 'recreated' : 'altered'
      const renameInfo = this.renamedFrom ? ` ${c.yellow(`(renamed from ${this.renamedFrom})`)}` : ''
      const color = this.recreated ? c.yellow : c.cyan
      return [
        `  ${color(`~ ${vp}${label} — ${rlabel}${renameInfo}`)}`,
        ...this.columnsAdded.map(col => `      ${c.green(`+ ${col} — added`)}`),
        ...this.columnsRenamed.map(col => `      ${c.yellow(`~ ${col} — renamed`)}`),
        ...this.columnsDropped.map(col => `      ${c.red(`- ${col} — dropped`)}`),
        '',
      ]
    }

    const lines = [this.printInSync(c)]
    if (this.errors.length > 0) {
      lines.push(...this.errors.map(err => `    ${c.red(`Error: ${err}`)}`))
    }
    return lines
  }

  // ── Shared ──────────────────────────────────────────────────────────

  private printInSync(c: TSyncColors): string {
    const prefix = this.viewType ? `${c.dim(`[${this.viewType}]`)} ` : ''
    return `  ${c.green('✓')} ${prefix}${c.bold(this.name)} ${c.dim('— in sync')}`
  }
}

// ── Public types ──────────────────────────────────────────────────────────

export interface TSyncPlan {
  status: 'up-to-date' | 'changes-needed'
  schemaHash: string
  entries: SyncEntry[]
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

export interface TSyncResult {
  status: 'up-to-date' | 'synced' | 'synced-by-peer'
  schemaHash: string
  entries: SyncEntry[]
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
   */
  private async resolveAndHash(types: TAtscriptAnnotatedType[]): Promise<{
    tables: AtscriptDbReadable[]
    views: AtscriptDbReadable[]
    externalViews: AtscriptDbView[]
    hash: string
  }> {
    const tables: AtscriptDbReadable[] = []
    const views: AtscriptDbReadable[] = []
    const externalViews: AtscriptDbView[] = []
    for (const type of types) {
      const readable = this.space.get(type)
      if (readable.isView) {
        const view = readable as AtscriptDbView
        if (view.isExternal) {
          externalViews.push(view)
        } else {
          views.push(readable)
        }
      } else {
        tables.push(readable)
      }
    }
    const allReadables = [...tables, ...views, ...externalViews]

    const snapshots = allReadables.map(r => computeTableSnapshot(r))
    const hash = computeSchemaHash(snapshots)

    return { tables, views, externalViews, hash }
  }

  /**
   * Checks an external view: verifies it exists in the DB and columns match.
   * Returns a SyncEntry with status 'in-sync' or 'error'.
   */
  private async checkExternalView(view: AtscriptDbView): Promise<SyncEntry> {
    const adapter = view.dbAdapter
    const name = view.tableName
    if (adapter.getExistingColumns) {
      const existing = await adapter.getExistingColumns()
      if (existing.length === 0) {
        return new SyncEntry({
          name,
          viewType: 'E',
          status: 'error',
          errors: [`External view "${name}" not found in the database`],
        })
      }
      // Check that declared fields exist in the view
      const existingNames = new Set(existing.map(c => c.name))
      const missing = view.fieldDescriptors
        .filter(f => !f.ignored && !existingNames.has(f.physicalName))
        .map(f => f.physicalName)
      if (missing.length > 0) {
        return new SyncEntry({
          name,
          viewType: 'E',
          status: 'error',
          errors: [`External view "${name}" is missing columns: ${missing.join(', ')}`],
        })
      }
    }
    return new SyncEntry({ name, viewType: 'E', status: 'in-sync' })
  }

  /**
   * Detects tables/views present in the previous sync but absent from the current schema.
   * Returns SyncEntry instances with status 'drop'.
   */
  private async detectRemoved(currentReadables: AtscriptDbReadable[], previous?: Array<{ name: string; isView: boolean; viewType?: 'V' | 'M' | 'E' }>): Promise<SyncEntry[]> {
    previous ??= await this.readTrackedList()
    const currentSet = new Set(currentReadables.map(t => t.tableName))
    // Build set of old names that are being renamed (not dropped)
    const renameFromSet = new Set(
      currentReadables.map(r => r.renamedFrom).filter(Boolean)
    )
    const removed: SyncEntry[] = []
    for (const entry of previous) {
      if (!currentSet.has(entry.name) && !renameFromSet.has(entry.name)) {
        removed.push(new SyncEntry({
          name: entry.name,
          viewType: entry.viewType,
          status: 'drop',
        }))
      }
    }
    return removed
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

    const { tables, views, externalViews, hash } = await this.resolveAndHash(types)

    await this.ensureControlTable()

    // Quick check — skip if hash matches
    if (!force) {
      const storedHash = await this.readHash()
      if (storedHash === hash) {
        return { status: 'up-to-date', schemaHash: hash, entries: [] }
      }
    }

    // Acquire lock
    const acquired = await this.tryAcquireLock(podId, lockTtlMs)
    if (!acquired) {
      await this.waitForLock(waitTimeoutMs, pollIntervalMs)

      const storedHash = await this.readHash()
      if (storedHash === hash) {
        return { status: 'synced-by-peer', schemaHash: hash, entries: [] }
      }

      const retryAcquired = await this.tryAcquireLock(podId, lockTtlMs)
      if (!retryAcquired) {
        throw new Error('Failed to acquire schema sync lock after waiting')
      }
    }

    try {
      // Double-check hash
      if (!force) {
        const storedHash = await this.readHash()
        if (storedHash === hash) {
          return { status: 'synced-by-peer', schemaHash: hash, entries: [] }
        }
      }

      // Sync tables
      const allReadables = [...tables, ...views, ...externalViews]
      const previouslyTracked = await this.readTrackedList()
      const trackedNames = new Set(previouslyTracked.map(e => e.name))

      const entries: SyncEntry[] = []
      for (const readable of tables) {
        entries.push(await this.syncTable(readable, safe, trackedNames))
      }

      // Sync managed views
      const removed = await this.detectRemoved(allReadables, previouslyTracked)

      for (const readable of views) {
        const view = readable as AtscriptDbView
        const renamedFrom = view.renamedFrom
        const isRenamed = renamedFrom && trackedNames.has(renamedFrom)
        // Drop old view if renamed (views don't support ALTER VIEW)
        if (isRenamed) {
          await this.space.dropViewByName(renamedFrom)
        }
        await readable.dbAdapter.ensureTable()
        entries.push(this.buildViewEntry(view, trackedNames))
      }

      // Check external views
      const externalEntries = await Promise.all(externalViews.map(v => this.checkExternalView(v)))
      entries.push(...externalEntries)

      // Drop removed tables/views (unless safe mode) — never drop external views
      if (!safe) {
        for (const entry of removed) {
          if (entry.viewType === 'E') { continue }
          if (entry.viewType) {
            await this.space.dropViewByName(entry.name)
          } else {
            await this.space.dropTableByName(entry.name)
          }
        }
        entries.push(...removed.filter(e => e.viewType !== 'E'))
      }

      await this.writeTrackedList(allReadables)
      await this.writeHash(hash)

      return { status: 'synced', schemaHash: hash, entries }
    } finally {
      await this.releaseLock(podId)
    }
  }

  /**
   * Computes a dry-run plan showing what `run()` would do, without executing any DDL.
   */
  async plan(types: TAtscriptAnnotatedType[], opts?: Pick<TSyncOptions, 'force' | 'safe'>): Promise<TSyncPlan> {
    const force = opts?.force ?? false
    const safe = opts?.safe ?? false
    const { tables, views, externalViews, hash } = await this.resolveAndHash(types)
    const allReadables = [...tables, ...views, ...externalViews]

    await this.ensureControlTable()

    // Introspect tables
    const previouslyTracked = await this.readTrackedList()
    const trackedNames = new Set(previouslyTracked.map(e => e.name))
    let planEntries = await Promise.all(tables.map(r => this.planTable(r, trackedNames)))

    // Add managed views to plan
    const viewEntries: SyncEntry[] = views.map(v =>
      this.buildViewEntry(v as AtscriptDbView, trackedNames)
    )

    // Check external views
    const externalEntries = await Promise.all(externalViews.map(v => this.checkExternalView(v)))

    // Quick check — skip if hash matches
    if (!force) {
      const storedHash = await this.readHash()
      if (storedHash === hash) {
        return { status: 'up-to-date', schemaHash: hash, entries: [...planEntries, ...viewEntries, ...externalEntries] }
      }
    }

    let removed = await this.detectRemoved(allReadables, previouslyTracked)

    if (safe) {
      // Hide destructive operations in safe mode
      planEntries = planEntries.map(e => new SyncEntry({ ...e, columnsToDrop: [] }))
      removed = []
    }

    // Never include external view drops
    removed = removed.filter(e => e.viewType !== 'E')

    return {
      status: 'changes-needed',
      schemaHash: hash,
      entries: [...planEntries, ...viewEntries, ...externalEntries, ...removed],
    }
  }

  private async planTable(readable: AtscriptDbReadable, trackedNames: Set<string>): Promise<SyncEntry> {
    const adapter = readable.dbAdapter
    const name = readable.tableName
    const init: TSyncEntryInit = {
      name,
      status: 'in-sync',
      syncMethod: readable.syncMethod,
    }

    // Detect pending rename
    const renamedFrom = readable.renamedFrom
    const pendingRename = renamedFrom && trackedNames.has(renamedFrom)
    if (pendingRename) {
      init.renamedFrom = renamedFrom
      init.status = 'alter'
    }

    if (adapter.getExistingColumns) {
      // If rename is pending, introspect the old-named table (DB still has old name)
      const existing = pendingRename && adapter.getExistingColumnsForTable
        ? await adapter.getExistingColumnsForTable(renamedFrom)
        : await adapter.getExistingColumns()
      if (existing.length === 0 && !pendingRename) {
        init.status = 'create'
        init.columnsToAdd = readable.fieldDescriptors.filter(f => !f.ignored)
      } else if (existing.length > 0) {
        const diff = computeColumnDiff(readable.fieldDescriptors, existing)
        init.columnsToAdd = diff.added
        init.columnsToRename = diff.renamed.map(r => ({ from: r.oldName, to: r.field.physicalName }))
        init.typeChanges = diff.typeChanged.map(tc => ({
          column: tc.field.physicalName,
          fromType: tc.existingType,
          toType: tc.field.designType,
        }))
        init.columnsToDrop = diff.removed.map(c => c.name)
        const hasChanges = diff.added.length > 0 ||
          diff.renamed.length > 0 ||
          diff.typeChanged.length > 0 ||
          diff.removed.length > 0
        if (hasChanges) { init.status = 'alter' }
      }
    } else {
      init.status = 'create'
    }

    return new SyncEntry(init)
  }

  // ── View entry builder ──────────────────────────────────────────────

  private buildViewEntry(view: AtscriptDbView, trackedNames: Set<string>): SyncEntry {
    const viewType = view.viewPlan.materialized ? 'M' as const : 'V' as const
    const renamedFrom = view.renamedFrom
    const isRenamed = renamedFrom && trackedNames.has(renamedFrom)
    let status: TSyncEntryStatus
    if (isRenamed) {
      status = 'alter'
    } else if (trackedNames.has(view.tableName)) {
      status = 'in-sync'
    } else {
      status = 'create'
    }
    return new SyncEntry({
      name: view.tableName,
      status,
      viewType,
      renamedFrom: isRenamed ? renamedFrom : undefined,
    })
  }

  // ── Table sync ────────────────────────────────────────────────────────

  private async syncTable(readable: AtscriptDbReadable, safe: boolean, trackedNames: Set<string>): Promise<SyncEntry> {
    const adapter = readable.dbAdapter
    const name = readable.tableName
    const init: TSyncEntryInit = {
      name,
      status: 'in-sync',
      syncMethod: readable.syncMethod,
    }

    // Handle table rename first
    if (readable.renamedFrom && trackedNames.has(readable.renamedFrom) && adapter.renameTable) {
      await adapter.renameTable(readable.renamedFrom)
      init.renamedFrom = readable.renamedFrom
      init.status = 'alter'
    }

    if (adapter.getExistingColumns && adapter.syncColumns) {
      const existing = await adapter.getExistingColumns()
      if (existing.length === 0 && !init.renamedFrom) {
        await adapter.ensureTable()
        init.status = 'create'
      } else if (existing.length > 0) {
        const diff = computeColumnDiff(readable.fieldDescriptors, existing)

        // Handle type changes
        if (diff.typeChanged.length > 0) {
          const syncMethod = readable.syncMethod
          if (syncMethod === 'drop' && adapter.dropTable) {
            await adapter.dropTable()
            await adapter.ensureTable()
            init.recreated = true
            init.status = 'alter'
          } else if (syncMethod === 'recreate' && adapter.recreateTable) {
            await adapter.recreateTable()
            init.recreated = true
            init.status = 'alter'
          } else {
            const errors: string[] = []
            for (const change of diff.typeChanged) {
              const msg = `Type change on ${name}.${change.field.physicalName} ` +
                `(${change.existingType} → ${change.field.designType}). ` +
                `Add @db.sync.method "recreate" or "drop", or migrate manually.`
              this.logger.error?.(
                `[schema-sync] ${msg}`
              )
              errors.push(msg)
            }
            init.errors = errors
          }
        }

        // Handle renames and adds (skip if table was recreated)
        if (!init.recreated && (diff.added.length > 0 || diff.renamed.length > 0)) {
          const syncResult = await adapter.syncColumns(diff)
          init.columnsAdded = syncResult.added
          init.columnsRenamed = syncResult.renamed
          if (syncResult.added.length > 0 || (syncResult.renamed?.length ?? 0) > 0) {
            init.status = 'alter'
          }
        }

        // Drop stale columns (unless safe mode or table was recreated)
        if (!safe && !init.recreated && diff.removed.length > 0 && adapter.dropColumns) {
          const colNames = diff.removed.map(c => c.name)
          await adapter.dropColumns(colNames)
          init.columnsDropped = colNames
          init.status = 'alter'
        }
      }
    } else {
      await adapter.ensureTable()
    }

    // Sync indexes
    await adapter.syncIndexes()

    // Sync foreign keys
    if (adapter.syncForeignKeys) {
      await adapter.syncForeignKeys()
    }

    return new SyncEntry(init)
  }

  // ── Control table ─────────────────────────────────────────────────────

  private async ensureControlTable(): Promise<void> {
    if (!this.controlTable) {
      const { AtscriptControl } = await import('./control.as.js')
      this.controlTable = this.space.getTable(AtscriptControl)
    }
    await this.controlTable.ensureTable()
  }

  private async readControlValue(_id: string): Promise<string | null> {
    const row = await this.controlTable!.findOne({
      filter: { _id: { $eq: _id } },
      controls: {},
    })
    return (row as Record<string, unknown> | null)?.value as string | null ?? null
  }

  private async writeControlValue(_id: string, value: string): Promise<void> {
    const existing = await this.readControlValue(_id)
    if (existing !== null) {
      await this.controlTable!.replaceOne({ _id, value } as any)
    } else {
      await this.controlTable!.insertOne({ _id, value } as any)
    }
  }

  private async readHash(): Promise<string | null> {
    return this.readControlValue('schema_version')
  }

  private async writeHash(hash: string): Promise<void> {
    await this.writeControlValue('schema_version', hash)
  }

  // ── Table tracking ──────────────────────────────────────────────────

  private async readTrackedList(): Promise<Array<{ name: string; isView: boolean; viewType?: 'V' | 'M' | 'E' }>> {
    const value = await this.readControlValue('synced_tables')
    if (!value) { return [] }
    const parsed = JSON.parse(value)
    // Backwards-compatible: old format was string[], then { name, isView }[]
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
      return (parsed as string[]).map(name => ({ name, isView: false }))
    }
    // Entries without viewType default to 'V' for views
    return (parsed as Array<{ name: string; isView: boolean; viewType?: 'V' | 'M' | 'E' }>).map(e => ({
      ...e,
      viewType: e.viewType ?? (e.isView ? 'V' : undefined),
    }))
  }

  private async writeTrackedList(readables: AtscriptDbReadable[]): Promise<void> {
    const entries = readables.map(r => {
      const isView = r.isView
      let viewType: 'V' | 'M' | 'E' | undefined
      if (isView) {
        const view = r as AtscriptDbView
        viewType = view.isExternal ? 'E' : (view.viewPlan.materialized ? 'M' : 'V')
      }
      return { name: r.tableName, isView, viewType }
    })
    entries.sort((a, b) => a.name.localeCompare(b.name))
    await this.writeControlValue('synced_tables', JSON.stringify(entries))
  }

  // ── Distributed lock ──────────────────────────────────────────────────

  private async tryAcquireLock(podId: string, ttlMs: number): Promise<boolean> {
    const now = Date.now()

    const existing = await this.controlTable!.findOne({
      filter: { _id: { $eq: 'sync_lock' } },
      controls: {},
    }) as Record<string, unknown> | null

    if (existing) {
      const expiresAt = existing.expiresAt as number
      if (expiresAt && expiresAt < now) {
        await this.controlTable!.deleteOne('sync_lock' as any)
      } else {
        return false
      }
    }

    try {
      await this.controlTable!.insertOne({
        _id: 'sync_lock',
        lockedBy: podId,
        lockedAt: now,
        expiresAt: now + ttlMs,
      } as any)
      return true
    } catch {
      return false
    }
  }

  private async releaseLock(podId: string): Promise<void> {
    try {
      const existing = await this.controlTable!.findOne({
        filter: { _id: { $eq: 'sync_lock' } },
        controls: {},
      }) as Record<string, unknown> | null

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
        filter: { _id: { $eq: 'sync_lock' } },
        controls: {},
      }) as Record<string, unknown> | null

      if (!lock) { return }

      const expiresAt = lock.expiresAt as number
      if (expiresAt && expiresAt < Date.now()) {
        await this.controlTable!.deleteOne('sync_lock' as any)
        return
      }

      await new Promise<void>(resolve => { setTimeout(resolve, pollIntervalMs) })
    }

    throw new Error(`Schema sync lock wait timed out after ${timeoutMs}ms`)
  }
}

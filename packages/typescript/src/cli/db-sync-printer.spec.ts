import { SyncEntry } from '@atscript/db/sync'
import type { TSyncPlan, TSyncResult } from '@atscript/db/sync'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DbSyncPrinter, failedMessage, planFlags } from './db-sync-printer'

function makePlan(): TSyncPlan {
  return {
    status: 'changes-needed',
    schemaHash: 'abc123',
    entries: [
      new SyncEntry({
        name: 'users',
        status: 'alter',
        columnsToAdd: [
          {
            path: 'age',
            physicalName: 'age',
            designType: 'number',
            optional: true,
            isPrimaryKey: false,
            ignored: false,
            storage: 'column',
            type: undefined as never,
          },
        ],
        typeChanges: [{ column: 'score', fromType: 'int4', toType: 'int8' }],
        columnsToDrop: ['legacy'],
      }),
      new SyncEntry({
        name: 'orders',
        status: 'in-sync',
      }),
      new SyncEntry({
        name: 'user_stats',
        viewType: 'M',
        status: 'create',
      }),
    ],
  }
}

/** A refused run: the plan comes back untouched, the offending entry as a refusal. */
function makeRefused(): TSyncResult {
  return {
    status: 'refused',
    schemaHash: 'abc123',
    entries: [
      new SyncEntry({ name: 'orders', status: 'in-sync' }),
      new SyncEntry({
        name: 'users',
        status: 'error',
        refused: true,
        errors: ['primary key changes on a populated table: (id) → (code)'],
      }),
      new SyncEntry({ name: 'user_stats', viewType: 'M', status: 'create' }),
    ],
  }
}

/** An applied run over `entries`. */
function makeResult(status: TSyncResult['status'], entries: SyncEntry[]): TSyncResult {
  return { status, schemaHash: 'abc123', entries }
}

/** Collects everything the printer logs to the console. */
function capture(): string[] {
  const lines: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.join(' '))
  })
  return lines
}

describe('DbSyncPrinter refused run', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('prints the refusal heading and only the refused entries, never the success line', () => {
    const lines = capture()
    new DbSyncPrinter().refused(makeRefused())
    const out = lines.join('\n')
    expect(out).toContain('Schema sync refused — nothing was applied.')
    expect(out).toContain('✖ refused: users')
    expect(out).toContain('primary key changes on a populated table: (id) → (code)')
    expect(out).not.toContain('Schema synced successfully')
    // untouched entries are the plan, not an outcome — not reported as applied
    expect(out).not.toContain('orders')
    expect(out).not.toContain('user_stats')
    expect(out).not.toContain('created')
  })

  it('exposes the refusal on the plan flags and the JSON document', () => {
    const plan: TSyncPlan = { ...makeRefused(), status: 'changes-needed' }
    expect(planFlags(plan)).toMatchObject({ refused: true, hasErrors: true, hasChanges: true })
    const doc = JSON.parse(new DbSyncPrinter().renderJson(plan))
    expect(doc.refused).toBe(true)
    expect(doc.entries[1]).toMatchObject({ name: 'users', status: 'error', refused: true })
    expect(doc.entries[0].refused).toBe(false)
  })

  it('renders the refusal in the plan exactly as the run would refuse with', () => {
    const plan: TSyncPlan = { ...makeRefused(), status: 'changes-needed' }
    const lines = capture()
    new DbSyncPrinter().plan(plan)
    expect(lines.join('\n')).toContain('✖ refused: users')
    const md = new DbSyncPrinter().renderMarkdown(plan)
    expect(md).toContain('- **Status:** changes-needed (refused)')
    expect(md).toContain('✖ refused: users')
  })
})

describe('DbSyncPrinter applied run', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('prints the success line with the stored hash for a clean run', () => {
    const lines = capture()
    new DbSyncPrinter().result(
      makeResult('synced', [new SyncEntry({ name: 'users', status: 'create' })])
    )
    const out = lines.join('\n')
    expect(out).toContain('Schema synced successfully.')
    expect(out).toContain('Hash: abc123')
    expect(out).toContain('users')
  })

  it('prints a failure heading without the success line or hash when entries errored', () => {
    const lines = capture()
    new DbSyncPrinter().result(
      makeResult('failed', [
        new SyncEntry({ name: 'orders', status: 'create' }),
        new SyncEntry({
          name: 'users',
          status: 'error',
          errors: ['ALTER failed on users: type change rejected'],
        }),
      ])
    )
    const out = lines.join('\n')
    expect(out).toContain('Schema sync failed for 1 entry — the schema hash was not stored.')
    expect(out).not.toContain('successfully')
    expect(out).not.toContain('abc123')
    // every entry is still listed, the errored one with its errors
    expect(out).toContain('orders')
    expect(out).toContain('ALTER failed on users: type change rejected')
  })

  it('makes no hash claim when the errored entries left nothing pending', () => {
    // an errored external view is advisory: not pending, so the run stored the hash
    const lines = capture()
    new DbSyncPrinter().result(
      makeResult('failed', [
        new SyncEntry({ name: 'users', status: 'create' }),
        new SyncEntry({
          name: 'legacy_report',
          viewType: 'E',
          status: 'error',
          errors: ['External view "legacy_report" not found in the database'],
        }),
      ])
    )
    const out = lines.join('\n')
    expect(out).toContain('Schema sync failed for 1 entry.')
    expect(out).not.toContain('not stored')
    expect(out).not.toContain('successfully')
    expect(out).toContain('External view "legacy_report" not found in the database')
  })

  it('prints a pending heading without the hash when safe mode skipped work', () => {
    const lines = capture()
    new DbSyncPrinter().result(
      makeResult('synced', [
        new SyncEntry({
          name: 'users',
          status: 'alter',
          typeChanges: [{ column: 'score', fromType: 'int4', toType: 'int8' }],
          skipped: ['recreate'],
        }),
      ])
    )
    const out = lines.join('\n')
    expect(out).toContain(
      'Schema synced — work skipped in safe mode is still pending; the schema hash was not stored.'
    )
    expect(out).not.toContain('successfully')
    expect(out).not.toContain('abc123')
    expect(out).toContain('users')
  })
})

describe('failedMessage', () => {
  const errored = new SyncEntry({ name: 'users', status: 'error', errors: ['boom'] })
  const external = new SyncEntry({ name: 'v', viewType: 'E', status: 'error', errors: ['gone'] })

  it('names the withheld hash only when an entry is pending', () => {
    expect(failedMessage(makeResult('failed', [errored]), true)).toBe(
      'Schema sync failed for 1 entry — see above; the schema hash was not stored.'
    )
    expect(failedMessage(makeResult('failed', [external]), true)).toBe(
      'Schema sync failed for 1 entry — see above.'
    )
    expect(failedMessage(makeResult('failed', [errored, external]))).toBe(
      'Schema sync failed for 2 entries — the schema hash was not stored.'
    )
  })
})

describe('DbSyncPrinter structured output', () => {
  it('renders a JSON plan document', () => {
    const doc = JSON.parse(new DbSyncPrinter().renderJson(makePlan()))
    expect(doc.status).toBe('changes-needed')
    expect(doc.schemaHash).toBe('abc123')
    expect(doc.destructive).toBe(true)
    expect(doc.hasChanges).toBe(true)
    expect(doc.hasErrors).toBe(false)
    expect(doc.entries).toHaveLength(3)

    const users = doc.entries[0]
    expect(users).toMatchObject({
      name: 'users',
      kind: 'table',
      status: 'alter',
      destructive: true,
      columnsToDrop: ['legacy'],
      typeChanges: [{ column: 'score', fromType: 'int4', toType: 'int8' }],
    })
    expect(users.columnsToAdd).toEqual([
      {
        path: 'age',
        physicalName: 'age',
        designType: 'number',
        optional: true,
        isPrimaryKey: false,
        storage: 'column',
      },
    ])

    const view = doc.entries[2]
    expect(view).toMatchObject({ name: 'user_stats', kind: 'view', viewType: 'M' })
  })

  it('carries the 0.1.128 entry fields and the derived flags', () => {
    const plan: TSyncPlan = {
      status: 'changes-needed',
      schemaHash: 'abc123',
      entries: [
        new SyncEntry({
          name: 'users',
          status: 'alter',
          pkChange: { from: ['id'], to: ['code'], rebuild: false },
          skipped: ['pk-rebuild'],
          dependsOn: ['orgs'],
        }),
      ],
    }
    const doc = JSON.parse(new DbSyncPrinter().renderJson(plan))
    expect(doc.entries[0]).toMatchObject({
      name: 'users',
      kind: 'table',
      pkChange: { from: ['id'], to: ['code'], rebuild: false },
      skipped: ['pk-rebuild'],
      dependsOn: ['orgs'],
      refused: false,
      pending: true,
      destructive: false,
      hasChanges: true,
      hasErrors: false,
    })
  })

  it('renders a Markdown plan document without color codes', () => {
    const md = new DbSyncPrinter().renderMarkdown(makePlan())
    expect(md).toContain('# Schema Sync Plan')
    expect(md).toContain('- **Status:** changes-needed (destructive)')
    expect(md).toContain('- **Schema hash:** `abc123`')
    expect(md).toContain('## Tables')
    expect(md).toContain('## Views')
    expect(md).toContain('users')
    expect(md).toContain('user_stats')
    // no ANSI escape sequences
    // oxlint-disable-next-line no-control-regex
    expect(md).not.toMatch(/\u001B/u)
  })
})

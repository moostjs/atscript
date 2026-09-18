import { SyncEntry } from '@atscript/db/sync'
import type { TSyncPlan, TSyncResult } from '@atscript/db/sync'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DbSyncPrinter, planFlags } from './db-sync-printer'

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

import { SyncEntry } from '@atscript/db/sync'
import type { TSyncPlan } from '@atscript/db/sync'
import { beforeAll, describe, expect, it } from 'vitest'

import type { DbSyncPrinter as TDbSyncPrinter } from './db-sync-printer'

// __DYE_* are compile-time defines injected by the dye bundler plugin —
// stub them before the printer module is evaluated
let DbSyncPrinter: typeof TDbSyncPrinter
beforeAll(async () => {
  for (const key of [
    '__DYE_GREEN__',
    '__DYE_RED__',
    '__DYE_CYAN__',
    '__DYE_YELLOW__',
    '__DYE_BOLD__',
    '__DYE_BOLD_OFF__',
    '__DYE_DIM__',
    '__DYE_DIM_OFF__',
    '__DYE_UNDERSCORE__',
    '__DYE_UNDERSCORE_OFF__',
    '__DYE_COLOR_OFF__',
  ]) {
    ;(globalThis as Record<string, unknown>)[key] = ''
  }
  ;({ DbSyncPrinter } = await import('./db-sync-printer'))
})

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

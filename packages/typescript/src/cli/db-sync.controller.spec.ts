import type { TSyncResult } from '@atscript/db/sync'
import { SyncEntry } from '@atscript/db/sync'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DbSyncPrinter } from './db-sync-printer'
import { DbSyncController } from './db-sync.controller'

function makeResult(status: TSyncResult['status'], entries: SyncEntry[]): TSyncResult {
  return { status, schemaHash: 'abc123', entries }
}

describe('DbSyncController.runSync', () => {
  const errors: string[] = []
  const logger = {
    log: () => {},
    info: () => {},
    warn: () => {},
    error: (m: string) => errors.push(m),
    debug: () => {},
  }

  /** Calls the private helper with a fake SchemaSync whose run() resolves `result`. */
  function runSync(result: TSyncResult) {
    const controller = new DbSyncController(logger as never)
    const sync = { run: vi.fn().mockResolvedValue(result) }
    return (
      controller as unknown as {
        runSync: (s: unknown, t: never[], safe?: boolean) => Promise<TSyncResult>
      }
    ).runSync(sync, [], true)
  }

  afterEach(() => {
    errors.length = 0
    vi.restoreAllMocks()
  })

  it('returns a synced result untouched', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const refused = vi.spyOn(DbSyncPrinter.prototype, 'refused').mockImplementation(() => {})
    const result = makeResult('synced', [new SyncEntry({ name: 'users', status: 'create' })])
    await expect(runSync(result)).resolves.toBe(result)
    expect(exit).not.toHaveBeenCalled()
    expect(refused).not.toHaveBeenCalled()
    expect(errors).toEqual([])
  })

  it('hands a refused run to the printer and exits 1', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })
    const printed = vi.spyOn(DbSyncPrinter.prototype, 'refused').mockImplementation(() => {})
    const refused = makeResult('refused', [
      new SyncEntry({ name: 'orders', status: 'in-sync' }),
      new SyncEntry({
        name: 'users',
        status: 'error',
        refused: true,
        errors: ['primary key changes on a populated table: (id) → (code)'],
      }),
    ])

    await expect(runSync(refused)).rejects.toThrow('exit')

    expect(printed).toHaveBeenCalledWith(refused)
    expect(exit).toHaveBeenCalledWith(1)
    expect(errors).toEqual([
      'Schema sync refused — nothing was applied. Fix the issues above and re-run.',
    ])
  })
})

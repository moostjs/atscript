import { describe, it, expect } from 'vitest'
import { computeColumnDiff } from '../column-diff'
import type { TDbFieldMeta, TExistingColumn } from '../types'

function field(overrides: Partial<TDbFieldMeta> & { physicalName: string }): TDbFieldMeta {
  return {
    path: overrides.physicalName,
    type: {} as any,
    designType: 'string',
    optional: false,
    isPrimaryKey: false,
    ignored: false,
    storage: 'column',
    ...overrides,
  }
}

function col(name: string, type = 'TEXT', notnull = false, pk = false): TExistingColumn {
  return { name, type, notnull, pk }
}

describe('computeColumnDiff', () => {
  it('should detect added columns', () => {
    const desired = [
      field({ physicalName: 'id', designType: 'number', isPrimaryKey: true }),
      field({ physicalName: 'name' }),
      field({ physicalName: 'email' }),
    ]
    const existing = [col('id', 'INTEGER', false, true), col('name')]
    const diff = computeColumnDiff(desired, existing)

    expect(diff.added.length).toBe(1)
    expect(diff.added[0].physicalName).toBe('email')
    expect(diff.removed.length).toBe(0)
  })

  it('should detect removed columns', () => {
    const desired = [field({ physicalName: 'id', isPrimaryKey: true })]
    const existing = [col('id', 'INTEGER', false, true), col('old_col')]
    const diff = computeColumnDiff(desired, existing)

    expect(diff.added.length).toBe(0)
    expect(diff.removed.length).toBe(1)
    expect(diff.removed[0].name).toBe('old_col')
  })

  it('should detect type changes with typeMapper', () => {
    const desired = [
      field({ physicalName: 'count', designType: 'number' }),
    ]
    const existing = [col('count', 'TEXT')]
    const typeMapper = (f: TDbFieldMeta) => f.designType === 'number' ? 'REAL' : 'TEXT'

    const diff = computeColumnDiff(desired, existing, typeMapper)
    expect(diff.typeChanged.length).toBe(1)
    expect(diff.typeChanged[0].field.physicalName).toBe('count')
    expect(diff.typeChanged[0].existingType).toBe('TEXT')
  })

  it('should skip type changes without typeMapper', () => {
    const desired = [field({ physicalName: 'count', designType: 'number' })]
    const existing = [col('count', 'TEXT')]

    const diff = computeColumnDiff(desired, existing)
    expect(diff.typeChanged.length).toBe(0)
  })

  it('should ignore fields marked as ignored', () => {
    const desired = [
      field({ physicalName: 'id', isPrimaryKey: true }),
      field({ physicalName: 'temp', ignored: true }),
    ]
    const existing = [col('id', 'INTEGER', false, true)]
    const diff = computeColumnDiff(desired, existing)

    expect(diff.added.length).toBe(0)
  })

  it('should handle empty existing columns (new table)', () => {
    const desired = [
      field({ physicalName: 'id', isPrimaryKey: true }),
      field({ physicalName: 'name' }),
    ]
    const diff = computeColumnDiff(desired, [])

    expect(diff.added.length).toBe(2)
    expect(diff.removed.length).toBe(0)
  })

  it('should handle no changes', () => {
    const desired = [
      field({ physicalName: 'id', isPrimaryKey: true }),
      field({ physicalName: 'name' }),
    ]
    const existing = [col('id', 'INTEGER', false, true), col('name')]
    const diff = computeColumnDiff(desired, existing)

    expect(diff.added.length).toBe(0)
    expect(diff.removed.length).toBe(0)
    expect(diff.typeChanged.length).toBe(0)
  })

  it('should detect rename conflict when target name already exists', () => {
    // "email" field has renamedFrom: 'name', but 'email' already exists as a column
    const desired = [
      field({ physicalName: 'id', isPrimaryKey: true }),
      field({ physicalName: 'email', renamedFrom: 'name' }),
    ]
    const existing = [
      col('id', 'INTEGER', false, true),
      col('name'),
      col('email'),
    ]
    const diff = computeColumnDiff(desired, existing)

    expect(diff.conflicts.length).toBe(1)
    expect(diff.conflicts[0].field.physicalName).toBe('email')
    expect(diff.conflicts[0].oldName).toBe('name')
    expect(diff.conflicts[0].conflictsWith).toBe('email')
    // Should not appear in renamed
    expect(diff.renamed.length).toBe(0)
    // 'name' should not appear in removed (it's consumed by the conflict)
    expect(diff.removed.find(c => c.name === 'name')).toBeUndefined()
  })

  it('should allow rename when target name does not exist', () => {
    const desired = [
      field({ physicalName: 'id', isPrimaryKey: true }),
      field({ physicalName: 'full_name', renamedFrom: 'name' }),
    ]
    const existing = [
      col('id', 'INTEGER', false, true),
      col('name'),
    ]
    const diff = computeColumnDiff(desired, existing)

    expect(diff.conflicts.length).toBe(0)
    expect(diff.renamed.length).toBe(1)
    expect(diff.renamed[0].oldName).toBe('name')
    expect(diff.renamed[0].field.physicalName).toBe('full_name')
  })
})

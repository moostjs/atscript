import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import type { AggregateExpr, AggregateQuery } from '@uniqu/core'

import { UniquSelect } from '../query/uniqu-select'
import { AtscriptDbTable } from '../table/db-table'
import { DbError } from '../db-error'
import { resolveAlias } from '../agg'

import { MockAdapter, prepareFixtures } from './test-utils'

let AggOrders: any
let PlainEvents: any

beforeAll(async () => {
  await prepareFixtures()
  const aggModule = await import('./fixtures/agg-orders.as.js')
  AggOrders = aggModule.AggOrders
  PlainEvents = aggModule.PlainEvents
})

// ── UniquSelect ──────────────────────────────────────────────────────────────

describe('UniquSelect with AggregateExpr', () => {
  const mixedSelect: Array<string | AggregateExpr> = [
    'currency',
    { $fn: 'sum', $field: 'amount', $as: 'total' },
    'status',
    { $fn: 'count', $field: '*', $as: 'cnt' },
  ]

  it('asArray returns only string field names', () => {
    const sel = new UniquSelect(mixedSelect as any)
    expect(sel.asArray).toEqual(['currency', 'status'])
  })

  it('aggregates returns only AggregateExpr objects', () => {
    const sel = new UniquSelect(mixedSelect as any)
    expect(sel.aggregates).toEqual([
      { $fn: 'sum', $field: 'amount', $as: 'total' },
      { $fn: 'count', $field: '*', $as: 'cnt' },
    ])
  })

  it('hasAggregates returns true when aggregates present', () => {
    const sel = new UniquSelect(mixedSelect as any)
    expect(sel.hasAggregates).toBe(true)
  })

  it('hasAggregates returns false for plain string array', () => {
    const sel = new UniquSelect(['a', 'b'] as any)
    expect(sel.hasAggregates).toBe(false)
  })

  it('aggregates returns undefined for object form', () => {
    const sel = new UniquSelect({ a: 1, b: 1 } as any)
    expect(sel.aggregates).toBeUndefined()
    expect(sel.hasAggregates).toBe(false)
  })

  it('asProjection ignores AggregateExpr in array form', () => {
    const sel = new UniquSelect(mixedSelect as any)
    expect(sel.asProjection).toEqual({ currency: 1, status: 1 })
  })

  it('asArray works normally for plain string arrays', () => {
    const sel = new UniquSelect(['a', 'b', 'c'] as any)
    expect(sel.asArray).toEqual(['a', 'b', 'c'])
    expect(sel.aggregates).toBeUndefined()
  })
})

// ── resolveAlias ─────────────────────────────────────────────────────────────

describe('resolveAlias', () => {
  it('uses $as when provided', () => {
    expect(resolveAlias({ $fn: 'sum', $field: 'amount', $as: 'total' })).toBe('total')
  })

  it('generates fn_field when $as is absent', () => {
    expect(resolveAlias({ $fn: 'count', $field: '*' })).toBe('count_*')
  })

  it('generates fn_field for named field', () => {
    expect(resolveAlias({ $fn: 'avg', $field: 'price' })).toBe('avg_price')
  })
})

// ── TableMetadata: dimensions/measures ───────────────────────────────────────

describe('TableMetadata dimensions/measures', () => {
  it('populates dimensions and measures from annotations', () => {
    const adapter = new MockAdapter()
    const table = new AtscriptDbTable(AggOrders, adapter)

    expect(table.dimensions).toEqual(['status', 'region'])
    expect(table.measures).toEqual(['amount', 'quantity'])
  })

  it('returns empty arrays when no annotations present', () => {
    const adapter = new MockAdapter()
    const table = new AtscriptDbTable(PlainEvents, adapter)

    expect(table.dimensions).toEqual([])
    expect(table.measures).toEqual([])
  })
})

// ── Validation ───────────────────────────────────────────────────────────────

describe('aggregate() validation', () => {
  let adapter: MockAdapter
  let table: AtscriptDbTable<any>

  beforeEach(() => {
    adapter = new MockAdapter()
    adapter.aggregateResult = [{ status: 'active', total: 100 }]
    table = new AtscriptDbTable(AggOrders, adapter)
  })

  it('rejects plain field in $select not in $groupBy', async () => {
    const query: AggregateQuery = {
      filter: {},
      controls: {
        $groupBy: ['status'],
        $select: ['status', 'region'] as any, // 'region' not in $groupBy
      },
    }
    await expect(table.aggregate(query)).rejects.toThrow(DbError)
    await expect(table.aggregate(query)).rejects.toMatchObject({
      code: 'INVALID_QUERY',
      errors: [{ path: '$select', message: expect.stringContaining('region') }],
    })
  })

  it('strict mode: rejects non-dimension field in $groupBy', async () => {
    const query: AggregateQuery = {
      filter: {},
      controls: {
        $groupBy: ['name'], // 'name' is not a dimension
      },
    }
    await expect(table.aggregate(query)).rejects.toThrow(DbError)
    await expect(table.aggregate(query)).rejects.toMatchObject({
      code: 'INVALID_QUERY',
      errors: [{ path: '$groupBy', message: expect.stringContaining('name') }],
    })
  })

  it('strict mode: rejects non-measure field in aggregate $field', async () => {
    const query: AggregateQuery = {
      filter: {},
      controls: {
        $groupBy: ['status'],
        $select: [
          'status',
          { $fn: 'sum', $field: 'name', $as: 'total' }, // 'name' is not a measure
        ] as any,
      },
    }
    await expect(table.aggregate(query)).rejects.toThrow(DbError)
    await expect(table.aggregate(query)).rejects.toMatchObject({
      code: 'INVALID_QUERY',
      errors: [{ path: '$select', message: expect.stringContaining('name') }],
    })
  })

  it('strict mode: allows count(*) without measure check', async () => {
    const query: AggregateQuery = {
      filter: {},
      controls: {
        $groupBy: ['status'],
        $select: [
          'status',
          { $fn: 'count', $field: '*', $as: 'cnt' },
        ] as any,
      },
    }
    const result = await table.aggregate(query)
    expect(result).toBeDefined()
  })

  it('strict mode: allows valid dimensions and measures', async () => {
    const query: AggregateQuery = {
      filter: {},
      controls: {
        $groupBy: ['status', 'region'],
        $select: [
          'status',
          'region',
          { $fn: 'sum', $field: 'amount', $as: 'total' },
          { $fn: 'count', $field: '*', $as: 'cnt' },
        ] as any,
      },
    }
    const result = await table.aggregate(query)
    expect(result).toBeDefined()
  })
})

describe('aggregate() loose mode (no annotations)', () => {
  let adapter: MockAdapter
  let table: AtscriptDbTable<any>

  beforeEach(() => {
    adapter = new MockAdapter()
    adapter.aggregateResult = [{ category: 'test', total: 50 }]
    table = new AtscriptDbTable(PlainEvents, adapter)
  })

  it('allows any field in $groupBy', async () => {
    const query: AggregateQuery = {
      filter: {},
      controls: {
        $groupBy: ['category'],
        $select: [
          'category',
          { $fn: 'sum', $field: 'value', $as: 'total' },
        ] as any,
      },
    }
    const result = await table.aggregate(query)
    expect(result).toBeDefined()
  })

  it('allows any field as aggregate $field', async () => {
    const query: AggregateQuery = {
      filter: {},
      controls: {
        $groupBy: ['label'],
        $select: [
          'label',
          { $fn: 'max', $field: 'category', $as: 'maxCat' },
        ] as any,
      },
    }
    const result = await table.aggregate(query)
    expect(result).toBeDefined()
  })
})

// ── Delegation and result mapping ────────────────────────────────────────────

describe('aggregate() delegation', () => {
  it('delegates to adapter.aggregate() with translated query', async () => {
    const adapter = new MockAdapter()
    adapter.aggregateResult = [{ status: 'active', region_code: 'US', total: 500 }]
    const table = new AtscriptDbTable(AggOrders, adapter)

    const query: AggregateQuery = {
      filter: { status: 'active' },
      controls: {
        $groupBy: ['status', 'region'],
        $select: [
          'status',
          'region',
          { $fn: 'sum', $field: 'amount', $as: 'total' },
        ] as any,
      },
    }

    const result = await table.aggregate(query)

    // Adapter was called
    const aggCall = adapter.calls.find(c => c.method === 'aggregate')
    expect(aggCall).toBeDefined()

    // Query was translated: 'region' → 'region_code' (from @db.column annotation)
    const translatedControls = aggCall!.args[0].controls
    expect(translatedControls.$groupBy).toContain('region_code')
  })

  it('reverse-maps physical field names in results', async () => {
    const adapter = new MockAdapter()
    // Adapter returns physical column names
    adapter.aggregateResult = [{ status: 'active', region_code: 'US', total: 500 }]
    const table = new AtscriptDbTable(AggOrders, adapter)

    const query: AggregateQuery = {
      filter: {},
      controls: {
        $groupBy: ['status', 'region'],
        $select: [
          'status',
          'region',
          { $fn: 'sum', $field: 'amount', $as: 'total' },
        ] as any,
      },
    }

    const result = await table.aggregate(query)

    // Result should have logical field names
    expect(result[0]).toHaveProperty('region')
    expect(result[0]).toHaveProperty('status')
    expect(result[0]).toHaveProperty('total')
    // Physical name 'region_code' should be mapped back to 'region'
    expect(result[0]).not.toHaveProperty('region_code')
  })
})

// ── BaseDbAdapter default ────────────────────────────────────────────────────

describe('BaseDbAdapter.aggregate() default', () => {
  it('throws Error by default', async () => {
    // Use a minimal concrete adapter without aggregate override
    const adapter = new (class extends MockAdapter {
      override async aggregate(): Promise<Array<Record<string, unknown>>> {
        return super.aggregate({} as any) // call the original BaseDbAdapter behavior
      }
    })()

    // BaseDbAdapter.aggregate throws
    // We test via the MockAdapter which overrides it, so test the base class directly
    const { BaseDbAdapter } = await import('../base-adapter')
    const base = Object.create(BaseDbAdapter.prototype)
    await expect(base.aggregate({})).rejects.toThrow('Aggregation not supported by this adapter')
  })
})

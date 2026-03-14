import { beforeAll, describe, expect, it } from 'vitest'

import dbPlugin from '../../../db/src/plugin'
import type { TAtscriptDocConfig } from '../document'
import { AtscriptDoc } from '../document'
import { PluginManager } from '../plugin/plugin-manager'

let docConfig: TAtscriptDocConfig

beforeAll(async () => {
  const pm = new PluginManager({ plugins: [dbPlugin()] })
  docConfig = await pm.getDocConfig()
})

function createDoc(source: string): AtscriptDoc {
  const doc = new AtscriptDoc('test.as', docConfig)
  doc.update(source)
  return doc
}

function getErrors(doc: AtscriptDoc) {
  return doc.getDiagMessages().filter(m => m.severity === 1)
}

function getWarnings(doc: AtscriptDoc) {
  return doc.getDiagMessages().filter(m => m.severity === 2)
}

describe('@db.column.collate', () => {
  it('should accept "binary"', () => {
    const doc = createDoc(`
@db.table "test"
interface Test {
  @db.column.collate "binary"
  name: string
}`)
    expect(getErrors(doc)).toHaveLength(0)
  })

  it('should accept "nocase"', () => {
    const doc = createDoc(`
@db.table "test"
interface Test {
  @db.column.collate "nocase"
  name: string
}`)
    expect(getErrors(doc)).toHaveLength(0)
  })

  it('should accept "unicode"', () => {
    const doc = createDoc(`
@db.table "test"
interface Test {
  @db.column.collate "unicode"
  name: string
}`)
    expect(getErrors(doc)).toHaveLength(0)
  })

  it('should reject invalid collation value', () => {
    const doc = createDoc(`
@db.table "test"
interface Test {
  @db.column.collate "latin1"
  name: string
}`)
    const allMessages = doc.getDiagMessages()
    // Should produce a diagnostic about invalid value
    expect(allMessages.length).toBeGreaterThan(0)
  })

  it('should reject on non-string field', () => {
    const doc = createDoc(`
@db.table "test"
interface Test {
  @db.column.collate "binary"
  count: number
}`)
    const errors = getErrors(doc)
    expect(errors.some(e => e.message.includes('not compatible'))).toBe(true)
  })
})

describe('@db.column.precision', () => {
  it('should accept two number args', () => {
    const doc = createDoc(`
@db.table "test"
interface Test {
  @db.column.precision 10, 2
  price: number
}`)
    expect(getErrors(doc)).toHaveLength(0)
  })

  it('should accept on decimal field', () => {
    const doc = createDoc(`
@db.table "test"
interface Test {
  @db.column.precision 10, 2
  price: decimal
}`)
    expect(getErrors(doc)).toHaveLength(0)
  })

  it('should reject on non-number/decimal field', () => {
    const doc = createDoc(`
@db.table "test"
interface Test {
  @db.column.precision 10, 2
  active: boolean
}`)
    const errors = getErrors(doc)
    expect(errors.some(e => e.message.includes('not compatible'))).toBe(true)
  })

  it('should reject on string field', () => {
    const doc = createDoc(`
@db.table "test"
interface Test {
  @db.column.precision 10, 2
  name: string
}`)
    const errors = getErrors(doc)
    expect(errors.some(e => e.message.includes('not compatible'))).toBe(true)
  })
})

describe('@db.default.increment', () => {
  it('should accept on number field without args', () => {
    const doc = createDoc(`
@db.table "test"
interface Test {
  @meta.id
  @db.default.increment
  id: number
}`)
    expect(getErrors(doc)).toHaveLength(0)
  })

  it('should accept optional start value', () => {
    const doc = createDoc(`
@db.table "test"
interface Test {
  @meta.id
  @db.default.increment 1000
  id: number
}`)
    expect(getErrors(doc)).toHaveLength(0)
  })

  it('should reject on string field', () => {
    const doc = createDoc(`
@db.table "test"
interface Test {
  @db.default.increment
  name: string
}`)
    const errors = getErrors(doc)
    expect(errors.some(e => e.message.includes('not compatible'))).toBe(true)
  })
})

describe('@db.default.uuid', () => {
  it('should accept on string field', () => {
    const doc = createDoc(`
@db.table "test"
interface Test {
  @meta.id
  @db.default.uuid
  id: string
}`)
    expect(getErrors(doc)).toHaveLength(0)
  })

  it('should reject on number field', () => {
    const doc = createDoc(`
@db.table "test"
interface Test {
  @db.default.uuid
  id: number
}`)
    const errors = getErrors(doc)
    expect(errors.some(e => e.message.includes('not compatible'))).toBe(true)
  })
})

describe('@db.default.now', () => {
  it('should accept on number field', () => {
    const doc = createDoc(`
@db.table "test"
interface Test {
  @db.default.now
  createdAt: number
}`)
    expect(getErrors(doc)).toHaveLength(0)
  })

  it('should accept on string field', () => {
    const doc = createDoc(`
@db.table "test"
interface Test {
  @db.default.now
  createdAt: string
}`)
    expect(getErrors(doc)).toHaveLength(0)
  })

  it('should reject on boolean field', () => {
    const doc = createDoc(`
@db.table "test"
interface Test {
  @db.default.now
  flag: boolean
}`)
    const errors = getErrors(doc)
    expect(errors.some(e => e.message.includes('not compatible'))).toBe(true)
  })
})

describe('@db.default.increment on number.int extension', () => {
  it('should accept on number.int field', () => {
    const doc = createDoc(`
@db.table "test"
interface Test {
  @db.default.increment
  id: number.int
}`)
    expect(getErrors(doc)).toHaveLength(0)
  })
})

describe('@db.column.dimension', () => {
  it('should accept on string field', () => {
    const doc = createDoc(`
@db.table "test"
interface Test {
  @db.column.dimension
  category: string
}`)
    expect(getErrors(doc)).toHaveLength(0)
  })

  it('should accept on number field', () => {
    const doc = createDoc(`
@db.table "test"
interface Test {
  @db.column.dimension
  year: number
}`)
    expect(getErrors(doc)).toHaveLength(0)
  })

  it('should accept on boolean field', () => {
    const doc = createDoc(`
@db.table "test"
interface Test {
  @db.column.dimension
  active: boolean
}`)
    expect(getErrors(doc)).toHaveLength(0)
  })

  it('should accept on enum literal field', () => {
    const doc = createDoc(`
@db.table "test"
interface Test {
  @db.column.dimension
  status: "active" | "inactive"
}`)
    expect(getErrors(doc)).toHaveLength(0)
  })
})

describe('@db.column.measure', () => {
  it('should accept on number field', () => {
    const doc = createDoc(`
@db.table "test"
interface Test {
  @db.column.measure
  amount: number
}`)
    expect(getErrors(doc)).toHaveLength(0)
  })

  it('should accept on decimal field', () => {
    const doc = createDoc(`
@db.table "test"
interface Test {
  @db.column.measure
  price: decimal
}`)
    expect(getErrors(doc)).toHaveLength(0)
  })

  it('should accept on number.int extension', () => {
    const doc = createDoc(`
@db.table "test"
interface Test {
  @db.column.measure
  quantity: number.int
}`)
    expect(getErrors(doc)).toHaveLength(0)
  })

  it('should reject on string field', () => {
    const doc = createDoc(`
@db.table "test"
interface Test {
  @db.column.measure
  name: string
}`)
    const errors = getErrors(doc)
    expect(errors.some(e => e.message.includes('not compatible'))).toBe(true)
  })

  it('should reject on boolean field', () => {
    const doc = createDoc(`
@db.table "test"
interface Test {
  @db.column.measure
  active: boolean
}`)
    const errors = getErrors(doc)
    expect(errors.some(e => e.message.includes('not compatible'))).toBe(true)
  })
})

describe('@db.agg.sum', () => {
  it('should accept on number field', () => {
    const doc = createDoc(`
@db.table "orders"
interface Order {
  @meta.id
  id: number
  amount: number
}

@db.view
@db.view.for Order
interface OrderStats {
  @db.agg.sum "amount"
  totalAmount: number
}`)
    expect(getErrors(doc)).toHaveLength(0)
  })

  it('should accept on decimal field', () => {
    const doc = createDoc(`
@db.table "orders"
interface Order {
  @meta.id
  id: number
  amount: decimal
}

@db.view
@db.view.for Order
interface OrderStats {
  @db.agg.sum "amount"
  totalAmount: decimal
}`)
    expect(getErrors(doc)).toHaveLength(0)
  })

  it('should reject on string field', () => {
    const doc = createDoc(`
@db.table "orders"
interface Order {
  @meta.id
  id: number
  amount: number
}

@db.view
@db.view.for Order
interface OrderStats {
  @db.agg.sum "amount"
  totalAmount: string
}`)
    const errors = getErrors(doc)
    expect(errors.some(e => e.message.includes('not compatible'))).toBe(true)
  })
})

describe('@db.agg.avg', () => {
  it('should accept on decimal field', () => {
    const doc = createDoc(`
@db.table "orders"
interface Order {
  @meta.id
  id: number
  amount: decimal
}

@db.view
@db.view.for Order
interface OrderStats {
  @db.agg.avg "amount"
  avgAmount: decimal
}`)
    expect(getErrors(doc)).toHaveLength(0)
  })

  it('should reject on boolean field', () => {
    const doc = createDoc(`
@db.table "orders"
interface Order {
  @meta.id
  id: number
  amount: number
}

@db.view
@db.view.for Order
interface OrderStats {
  @db.agg.avg "amount"
  avgAmount: boolean
}`)
    const errors = getErrors(doc)
    expect(errors.some(e => e.message.includes('not compatible'))).toBe(true)
  })
})

describe('@db.agg.count', () => {
  it('should accept without arg on number field', () => {
    const doc = createDoc(`
@db.table "orders"
interface Order {
  @meta.id
  id: number
  amount: number
}

@db.view
@db.view.for Order
interface OrderStats {
  @db.agg.count
  orderCount: number
}`)
    expect(getErrors(doc)).toHaveLength(0)
  })

  it('should accept with field arg on number field', () => {
    const doc = createDoc(`
@db.table "orders"
interface Order {
  @meta.id
  id: number
  amount: number
}

@db.view
@db.view.for Order
interface OrderStats {
  @db.agg.count "amount"
  nonNullCount: number
}`)
    expect(getErrors(doc)).toHaveLength(0)
  })

  it('should reject on string field', () => {
    const doc = createDoc(`
@db.table "orders"
interface Order {
  @meta.id
  id: number
  amount: number
}

@db.view
@db.view.for Order
interface OrderStats {
  @db.agg.count
  orderCount: string
}`)
    const errors = getErrors(doc)
    expect(errors.some(e => e.message.includes('not compatible'))).toBe(true)
  })
})

describe('@db.agg.min / @db.agg.max', () => {
  it('should accept min on number field', () => {
    const doc = createDoc(`
@db.table "orders"
interface Order {
  @meta.id
  id: number
  amount: number
}

@db.view
@db.view.for Order
interface OrderStats {
  @db.agg.min "amount"
  minAmount: number
}`)
    expect(getErrors(doc)).toHaveLength(0)
  })

  it('should accept min on string field (no type validation)', () => {
    const doc = createDoc(`
@db.table "orders"
interface Order {
  @meta.id
  id: number
  name: string
}

@db.view
@db.view.for Order
interface OrderStats {
  @db.agg.min "name"
  firstName: string
}`)
    expect(getErrors(doc)).toHaveLength(0)
  })

  it('should accept max on decimal field', () => {
    const doc = createDoc(`
@db.table "orders"
interface Order {
  @meta.id
  id: number
  price: decimal
}

@db.view
@db.view.for Order
interface OrderStats {
  @db.agg.max "price"
  maxPrice: decimal
}`)
    expect(getErrors(doc)).toHaveLength(0)
  })
})

describe('@db.view.having', () => {
  it('should accept on @db.view interface', () => {
    const doc = createDoc(`
@db.table "orders"
interface Order {
  @meta.id
  id: number
  amount: number
  category: string
}

@db.view
@db.view.for Order
@db.view.having \`totalRevenue > 100\`
interface TopCategories {
  category: Order.category
  @db.agg.sum "amount"
  totalRevenue: number
}`)
    expect(getErrors(doc)).toHaveLength(0)
  })

  it('should reject on @db.table interface', () => {
    const doc = createDoc(`
@db.table "test"
@db.view.having \`amount > 100\`
interface Test {
  @meta.id
  id: number
  amount: number
}`)
    const errors = getErrors(doc)
    expect(errors.some(e => e.message.includes('only valid on @db.view'))).toBe(true)
  })

  it('should reject on plain interface', () => {
    const doc = createDoc(`
@db.view.having \`amount > 100\`
interface Test {
  amount: number
}`)
    const errors = getErrors(doc)
    expect(errors.some(e => e.message.includes('only valid on @db.view'))).toBe(true)
  })
})

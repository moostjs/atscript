import { describe, expect, it } from 'vitest'

import { dbAnnotations } from '../defaults/db-annotations'
import { AtscriptDoc } from '../document'
import { SemanticPrimitiveNode } from '../parser/nodes/primitive-node'

const primitives = new Map<string, SemanticPrimitiveNode>()
primitives.set('string', new SemanticPrimitiveNode('string', {
  type: 'string',
  extensions: {
    uuid: { type: 'string' },
  },
}))
primitives.set('number', new SemanticPrimitiveNode('number', {
  type: 'number',
  extensions: {
    int: { type: 'number' },
    timestamp: { type: 'number' },
  },
}))
primitives.set('decimal', new SemanticPrimitiveNode('decimal', {
  type: 'decimal',
  documentation: 'Decimal number stored as string to preserve precision.',
}))
primitives.set('boolean', new SemanticPrimitiveNode('boolean', { type: 'boolean' }))

function createDoc(source: string): AtscriptDoc {
  const doc = new AtscriptDoc('test.as', {
    primitives,
    annotations: { db: dbAnnotations },
  })
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

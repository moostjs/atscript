import { describe, it, expect } from 'vitest'
import { defineAnnotatedType } from './annotated-type'
import { createDataFromAnnotatedType } from './default-value'

// ── Helpers ─────────────────────────────────────────────────

/** Shorthand for building a simple string type. */
function str(optional = false) {
  const h = defineAnnotatedType().designType('string')
  if (optional) h.optional()
  return h.$type
}

function num(optional = false) {
  const h = defineAnnotatedType().designType('number')
  if (optional) h.optional()
  return h.$type
}

function bool(optional = false) {
  const h = defineAnnotatedType().designType('boolean')
  if (optional) h.optional()
  return h.$type
}

function literal(value: string | number | boolean) {
  const dt = typeof value === 'string' ? 'string' : typeof value === 'number' ? 'number' : 'boolean'
  return defineAnnotatedType().designType(dt as any).value(value).$type
}

// ── Empty mode ──────────────────────────────────────────────

describe('createDataFromAnnotatedType — empty mode', () => {
  it('should return structural defaults for primitives', () => {
    expect(createDataFromAnnotatedType(str())).toBe('')
    expect(createDataFromAnnotatedType(num())).toBe(0)
    expect(createDataFromAnnotatedType(bool())).toBe(false)
  })

  it('should return literal values', () => {
    expect(createDataFromAnnotatedType(literal('hello'))).toBe('hello')
    expect(createDataFromAnnotatedType(literal(42))).toBe(42)
    expect(createDataFromAnnotatedType(literal(true))).toBe(true)
  })

  it('should return undefined/null for those types', () => {
    expect(createDataFromAnnotatedType(defineAnnotatedType().designType('undefined').$type)).toBe(undefined)
    expect(createDataFromAnnotatedType(defineAnnotatedType().designType('null').$type)).toBe(null)
  })

  it('should build object with required props, skip optional', () => {
    const type = defineAnnotatedType('object')
      .prop('name', str())
      .prop('age', num())
      .prop('email', str(true)).$type

    const result = createDataFromAnnotatedType(type)
    expect(result).toEqual({ name: '', age: 0 })
    expect(result).not.toHaveProperty('email')
  })

  it('should build nested objects', () => {
    const address = defineAnnotatedType('object')
      .prop('street', str())
      .prop('city', str()).$type
    const type = defineAnnotatedType('object')
      .prop('name', str())
      .prop('address', address).$type

    expect(createDataFromAnnotatedType(type)).toEqual({
      name: '',
      address: { street: '', city: '' },
    })
  })

  it('should return empty array for array types', () => {
    const type = defineAnnotatedType('array').of(str()).$type
    expect(createDataFromAnnotatedType(type)).toEqual([])
  })

  it('should build tuple with defaults for each position', () => {
    const type = defineAnnotatedType('tuple')
      .item(str())
      .item(num())
      .item(bool()).$type

    expect(createDataFromAnnotatedType(type)).toEqual(['', 0, false])
  })

  it('should use first branch for unions', () => {
    const type = defineAnnotatedType('union')
      .item(str())
      .item(num()).$type

    expect(createDataFromAnnotatedType(type)).toBe('')
  })

  it('should skip phantom types in objects', () => {
    const phantom = defineAnnotatedType().designType('phantom').$type
    const type = defineAnnotatedType('object')
      .prop('name', str())
      .prop('_phantom', phantom).$type

    const result = createDataFromAnnotatedType(type)
    expect(result).toEqual({ name: '' })
    expect(result).not.toHaveProperty('_phantom')
  })

  it('should skip optional nested object', () => {
    const address = defineAnnotatedType('object')
      .prop('street', str())
      .optional().$type
    const type = defineAnnotatedType('object')
      .prop('name', str())
      .prop('address', address).$type

    const result = createDataFromAnnotatedType(type)
    expect(result).toEqual({ name: '' })
    expect(result).not.toHaveProperty('address')
  })
})

// ── Default mode ────────────────────────────────────────────

describe('createDataFromAnnotatedType — default mode', () => {
  it('should use meta.default for string prop (raw string)', () => {
    const type = defineAnnotatedType('object')
      .prop('name', defineAnnotatedType().designType('string').annotate('meta.default' as any, 'John').$type)
      .prop('age', num()).$type

    expect(createDataFromAnnotatedType(type, { mode: 'default' })).toEqual({
      name: 'John',
      age: 0,
    })
  })

  it('should parse meta.default as JSON for number', () => {
    const type = defineAnnotatedType('object')
      .prop('name', str())
      .prop('age', defineAnnotatedType().designType('number').annotate('meta.default' as any, '25').$type).$type

    expect(createDataFromAnnotatedType(type, { mode: 'default' })).toEqual({
      name: '',
      age: 25,
    })
  })

  it('should parse meta.default as JSON for boolean', () => {
    const prop = defineAnnotatedType().designType('boolean').annotate('meta.default' as any, 'true').$type
    expect(createDataFromAnnotatedType(prop, { mode: 'default' })).toBe(true)
  })

  it('should include optional prop when meta.default is provided', () => {
    const type = defineAnnotatedType('object')
      .prop('name', str())
      .prop('nickname', defineAnnotatedType().designType('string').optional().annotate('meta.default' as any, 'buddy').$type).$type

    const result = createDataFromAnnotatedType(type, { mode: 'default' })
    expect(result).toEqual({ name: '', nickname: 'buddy' })
  })

  it('should skip optional prop when no meta.default', () => {
    const type = defineAnnotatedType('object')
      .prop('name', str())
      .prop('nickname', str(true)).$type

    const result = createDataFromAnnotatedType(type, { mode: 'default' })
    expect(result).toEqual({ name: '' })
    expect(result).not.toHaveProperty('nickname')
  })

  it('should apply meta.default on an object type and skip inner recursion', () => {
    const address = defineAnnotatedType('object')
      .prop('street', str())
      .prop('city', str())
      .annotate('meta.default' as any, '{"street":"123 Main St","city":"Springfield"}').$type

    const type = defineAnnotatedType('object')
      .prop('name', str())
      .prop('address', address).$type

    expect(createDataFromAnnotatedType(type, { mode: 'default' })).toEqual({
      name: '',
      address: { street: '123 Main St', city: 'Springfield' },
    })
  })

  it('should apply meta.default on an array type', () => {
    const arrType = defineAnnotatedType('array')
      .of(str())
      .annotate('meta.default' as any, '["a","b","c"]').$type

    const type = defineAnnotatedType('object')
      .prop('tags', arrType).$type

    expect(createDataFromAnnotatedType(type, { mode: 'default' })).toEqual({
      tags: ['a', 'b', 'c'],
    })
  })

  it('should fall back to structural default when meta.default fails validation', () => {
    // Set a string default on a number field — JSON parses to string, not number
    const prop = defineAnnotatedType().designType('number').annotate('meta.default' as any, '"hello"').$type
    expect(createDataFromAnnotatedType(prop, { mode: 'default' })).toBe(0)
  })

  it('should fall back when meta.default has invalid JSON for non-string type', () => {
    const prop = defineAnnotatedType().designType('number').annotate('meta.default' as any, 'not-json').$type
    expect(createDataFromAnnotatedType(prop, { mode: 'default' })).toBe(0)
  })

  it('should fall back when object meta.default has wrong shape', () => {
    const address = defineAnnotatedType('object')
      .prop('street', str())
      .prop('city', str())
      .annotate('meta.default' as any, '{"street":123,"city":"Springfield"}').$type

    const type = defineAnnotatedType('object')
      .prop('address', address).$type

    // street is number instead of string — validation fails, falls back to structural
    expect(createDataFromAnnotatedType(type, { mode: 'default' })).toEqual({
      address: { street: '', city: '' },
    })
  })
})

// ── Example mode ────────────────────────────────────────────

describe('createDataFromAnnotatedType — example mode', () => {
  it('should use meta.example for string prop', () => {
    const type = defineAnnotatedType('object')
      .prop('name', defineAnnotatedType().designType('string').annotate('meta.example' as any, 'Jane Doe').$type)
      .prop('age', defineAnnotatedType().designType('number').annotate('meta.example' as any, '30').$type).$type

    expect(createDataFromAnnotatedType(type, { mode: 'example' })).toEqual({
      name: 'Jane Doe',
      age: 30,
    })
  })

  it('should include optional prop when meta.example is provided', () => {
    const type = defineAnnotatedType('object')
      .prop('name', str())
      .prop('bio', defineAnnotatedType().designType('string').optional().annotate('meta.example' as any, 'A developer').$type).$type

    const result = createDataFromAnnotatedType(type, { mode: 'example' })
    expect(result).toEqual({ name: '', bio: 'A developer' })
  })

  it('should not read meta.default in example mode', () => {
    const prop = defineAnnotatedType().designType('string').annotate('meta.default' as any, 'default-val').$type
    // example mode ignores meta.default — falls through to structural default
    expect(createDataFromAnnotatedType(prop, { mode: 'example' })).toBe('')
  })
})

// ── Callback mode ───────────────────────────────────────────

describe('createDataFromAnnotatedType — callback mode', () => {
  it('should use callback return value', () => {
    const type = defineAnnotatedType('object')
      .prop('name', str())
      .prop('age', num()).$type

    const result = createDataFromAnnotatedType(type, {
      mode: (_prop, path) => {
        if (path === 'name') return 'Custom'
        if (path === 'age') return 99
        return undefined
      },
    })
    expect(result).toEqual({ name: 'Custom', age: 99 })
  })

  it('should fall through to structural default when callback returns undefined', () => {
    const type = defineAnnotatedType('object')
      .prop('name', str())
      .prop('age', num()).$type

    const result = createDataFromAnnotatedType(type, {
      mode: (_prop, path) => {
        if (path === 'name') return 'Only Name'
        return undefined
      },
    })
    expect(result).toEqual({ name: 'Only Name', age: 0 })
  })

  it('should skip callback value that fails validation', () => {
    const prop = defineAnnotatedType().designType('number').$type

    const result = createDataFromAnnotatedType(prop, {
      mode: () => 'not-a-number',
    })
    // Callback returned a string for a number type — validation fails, falls back
    expect(result).toBe(0)
  })

  it('should include optional prop when callback provides a value', () => {
    const type = defineAnnotatedType('object')
      .prop('name', str())
      .prop('nickname', str(true)).$type

    const result = createDataFromAnnotatedType(type, {
      mode: (_prop, path) => {
        if (path === 'nickname') return 'buddy'
        return undefined
      },
    })
    expect(result).toEqual({ name: '', nickname: 'buddy' })
  })
})

// ── Union handling ──────────────────────────────────────────

describe('createDataFromAnnotatedType — union handling', () => {
  it('should validate meta.default against the whole union', () => {
    const union = defineAnnotatedType('union')
      .item(str())
      .item(num())
      .annotate('meta.default' as any, '42').$type

    // 42 is valid for the number branch of the union
    expect(createDataFromAnnotatedType(union, { mode: 'default' })).toBe(42)
  })

  it('should use first branch when no annotation on union', () => {
    const union = defineAnnotatedType('union')
      .item(num())
      .item(str()).$type

    expect(createDataFromAnnotatedType(union, { mode: 'default' })).toBe(0)
  })
})

import { describe, it, expect } from 'vitest'

import { defineAnnotatedType } from './annotated-type'
import { Validator, type TValidatorPlugin, type TValidatorPluginContext } from './validator'

describe('Validator at primitives', () => {
  it('should validate primitive string', () => {
    const validator = new Validator(defineAnnotatedType().designType('string').$type)
    expect(validator.validate('hello', true)).toBe(true)
    expect(validator.validate(123, true)).toBe(false)
    expect(validator.validate(true, true)).toBe(false)
    expect(validator.validate(undefined, true)).toBe(false)
    expect(validator.validate(null, true)).toBe(false)
  })
  it('should validate primitive number', () => {
    const validator = new Validator(defineAnnotatedType().designType('number').$type)
    expect(validator.validate('hello', true)).toBe(false)
    expect(validator.validate(123, true)).toBe(true)
    expect(validator.validate(true, true)).toBe(false)
    expect(validator.validate(undefined, true)).toBe(false)
    expect(validator.validate(null, true)).toBe(false)
  })
  it('should validate primitive boolean', () => {
    const validator = new Validator(defineAnnotatedType().designType('boolean').$type)
    expect(validator.validate('hello', true)).toBe(false)
    expect(validator.validate(123, true)).toBe(false)
    expect(validator.validate(true, true)).toBe(true)
    expect(validator.validate(undefined, true)).toBe(false)
    expect(validator.validate(null, true)).toBe(false)
  })
  it('should validate primitive string literal', () => {
    const validator = new Validator(defineAnnotatedType().designType('string').value('test').$type)
    expect(validator.validate('hello', true)).toBe(false)
    expect(validator.validate(123, true)).toBe(false)
    expect(validator.validate('test', true)).toBe(true)
  })
  it('should validate primitive number literal', () => {
    const validator = new Validator(defineAnnotatedType().designType('number').value(7).$type)
    expect(validator.validate('hello', true)).toBe(false)
    expect(validator.validate(123, true)).toBe(false)
    expect(validator.validate(7, true)).toBe(true)
  })
})

describe('Validator at objects', () => {
  const simpleObj = defineAnnotatedType('object')
    .prop('name', defineAnnotatedType().designType('string').$type)
    .prop('age', defineAnnotatedType().designType('number').$type)
  it('should validate object', () => {
    const t = simpleObj
    const validator = new Validator(t.$type)
    expect(validator.validate({ name: 'John', age: 30 }, true)).toBe(true)
    expect(validator.validate({ name: 'John', age: '30' }, true)).toBe(false)
    expect(validator.validate({ name: 'John', age: 30, email: 'test@test.com' }, true)).toBe(false)
  })
  it('should validate object with optional', () => {
    const t = defineAnnotatedType('object')
      .prop('name', defineAnnotatedType().designType('string').$type)
      .prop('age', defineAnnotatedType().designType('number').$type)
      .prop('email', defineAnnotatedType().optional().designType('string').$type)
    const validator = new Validator(t.$type)
    expect(validator.validate({ name: 'John', age: 30 }, true)).toBe(true)
    expect(validator.validate({ name: 'John', age: '30' }, true)).toBe(false)
    expect(validator.validate({ name: 'John', age: 30, email: 'test@test.com' }, true)).toBe(true)
  })
  const deepObjectType = defineAnnotatedType('object')
    .prop('name', defineAnnotatedType().designType('string').$type)
    .prop('age', defineAnnotatedType().designType('number').$type)
    .prop(
      'address',
      defineAnnotatedType('object')
        .prop('street', defineAnnotatedType().designType('string').$type)
        .prop('city', defineAnnotatedType().designType('string').$type)
        .prop('state', defineAnnotatedType().designType('string').$type)
        .prop('zip', defineAnnotatedType().designType('number').$type).$type
    )

  it('should validate nested objects', () => {
    const t = deepObjectType
    const validator = new Validator(t.$type)
    expect(
      validator.validate(
        {
          name: 'John',
          age: 30,
          address: { street: '123 Main St', city: 'Anytown', state: 'CA', zip: 12345 },
        },
        true
      )
    ).toBe(true)
    expect(
      validator.validate(
        {
          name: 'John',
          age: 30,
          address: { street: '123 Main St', city: 'Anytown', state: 'CA', zip: '12345' },
        },
        true
      )
    ).toBe(false)
  })

  it('should validate object with skipList', () => {
    const t = deepObjectType
    const validator = new Validator(t.$type, { skipList: new Set(['age', 'address.street']) })

    const result = validator.validate(
      {
        name: 'John',
        address: { city: 'Anytown', state: 'CA', zip: 12345 },
      },
      true
    )
    expect(result).toBe(true)
  })

  it('should validate object with partial option', () => {
    const t = deepObjectType
    const validator = new Validator(t.$type, { partial: true })
    expect(validator.validate({}, true)).toBe(true)
    expect(validator.validate({ address: {} }, true)).toBe(false)
  })

  it('should validate object with deep partial option', () => {
    const t = deepObjectType
    const validator = new Validator(t.$type, { partial: 'deep' })
    expect(validator.validate({}, true)).toBe(true)
    expect(validator.validate({ address: {} }, true)).toBe(true)
  })

  it('should validate object ignoring unknown props', () => {
    const t = simpleObj
    const validator = new Validator(t.$type, { unknwonProps: 'ignore' })
    expect(validator.validate({ name: 'John', age: 25 }, true)).toBe(true)
    expect(validator.validate({ name: 'John', age: 25, dummy: true }, true)).toBe(true)
  })

  it('should validate object stripping unknown props', () => {
    const t = simpleObj
    const validator = new Validator(t.$type, { unknwonProps: 'strip' })
    const o = { name: 'John', age: 25, dummy: true }
    expect(validator.validate(o, true)).toBe(true)
    expect(o.dummy).toBeUndefined()
  })

  it('should validate object with wildcard props', () => {
    const t = defineAnnotatedType('object').propPattern(
      /./,
      defineAnnotatedType().designType('string').$type
    )
    const validator = new Validator(t.$type)
    expect(validator.validate({ name: 'John', age: 30 }, true)).toBe(false)
    expect(validator.validate({ name: 'John', age: '30' }, true)).toBe(true)
  })

  it('should validate object with mixed wildcard and static props', () => {
    const t = defineAnnotatedType('object')
      .prop('name', defineAnnotatedType().designType('string').$type)
      .prop('age', defineAnnotatedType().designType('number').$type)
      .propPattern(/./, defineAnnotatedType().designType('boolean').$type)
    const validator = new Validator(t.$type)
    validator.validate({ name: 'John', age: 30 }, true)
    expect(validator.errors).toEqual([])
    expect(validator.validate({ name: 'John' }, true)).toBe(false)
    expect(validator.validate({ name: 'John', age: 30, str: 'str' }, true)).toBe(false)
    expect(validator.validate({ name: 'John', age: 30, bool: true }, true)).toBe(true)
    expect(validator.validate({ name: 'John', age: 30, bool: false }, true)).toBe(true)
  })

  it('should skip phantom props during validation and treat them as unknown keys', () => {
    const t = defineAnnotatedType('object')
      .prop('name', defineAnnotatedType().designType('string').$type)
      .prop('info', defineAnnotatedType().designType('phantom').$type)
      .prop('age', defineAnnotatedType().designType('number').$type)
    const validator = new Validator(t.$type)
    // Phantom props are not recognized — object with only real fields passes
    expect(validator.validate({ name: 'John', age: 30 }, true)).toBe(true)
    // Data with a phantom prop name is treated as unexpected property
    expect(validator.validate({ name: 'John', age: 30, info: 'text' }, true)).toBe(false)
  })

  it('should validate phantom designType as always passing', () => {
    const validator = new Validator(defineAnnotatedType().designType('phantom').$type)
    expect(validator.validate(undefined, true)).toBe(true)
    expect(validator.validate('anything', true)).toBe(true)
    expect(validator.validate(42, true)).toBe(true)
  })
})

describe('Validator at tuples', () => {
  it('should validate tuple', () => {
    const t = defineAnnotatedType('tuple')
      .item(defineAnnotatedType().designType('string').$type)
      .item(defineAnnotatedType().designType('number').$type)
    const validator = new Validator(t.$type)
    expect(validator.validate(['hello', 123], true)).toBe(true)
    expect(validator.validate(['hello', '123'], true)).toBe(false)
    expect(validator.validate(['hello', 123, 'test'], true)).toBe(false)
  })
})

describe('Validator at arrays', () => {
  it('should validate array', () => {
    const t = defineAnnotatedType('array').of(defineAnnotatedType().designType('string').$type)
    const validator = new Validator(t.$type)
    expect(validator.validate(['hello', 'world'], true)).toBe(true)
    expect(validator.validate(['hello', 123], true)).toBe(false)
    expect(validator.validate(['hello', {}], true)).toBe(false)
  })
})

describe('Validator at union', () => {
  it('should validate union', () => {
    const t = defineAnnotatedType('union')
      .item(defineAnnotatedType().designType('string').$type)
      .item(defineAnnotatedType().designType('number').$type)
    const validator = new Validator(t.$type)
    expect(validator.validate('hello', true)).toBe(true)
    expect(validator.validate(123, true)).toBe(true)
    expect(validator.validate(true, true)).toBe(false)
  })
})

describe('Validator @meta.required', () => {
  it('should reject empty string', () => {
    const t = defineAnnotatedType().designType('string').annotate('meta.required', true)
    const validator = new Validator(t.$type)
    expect(validator.validate('', true)).toBe(false)
    expect(validator.errors[0].message).toBe('Must not be empty')
  })

  it('should reject whitespace-only string', () => {
    const t = defineAnnotatedType().designType('string').annotate('meta.required', true)
    const validator = new Validator(t.$type)
    expect(validator.validate('   ', true)).toBe(false)
    expect(validator.validate(' \t\n ', true)).toBe(false)
  })

  it('should accept non-empty string', () => {
    const t = defineAnnotatedType().designType('string').annotate('meta.required', true)
    const validator = new Validator(t.$type)
    expect(validator.validate('hello', true)).toBe(true)
    expect(validator.validate(' a', true)).toBe(true)
  })

  it('should use custom error message', () => {
    const t = defineAnnotatedType()
      .designType('string')
      .annotate('meta.required', { message: 'Name is required' })
    const validator = new Validator(t.$type)
    expect(validator.validate('', true)).toBe(false)
    expect(validator.errors[0].message).toBe('Name is required')
  })

  it('should reject false for boolean', () => {
    const t = defineAnnotatedType().designType('boolean').annotate('meta.required', true)
    const validator = new Validator(t.$type)
    expect(validator.validate(false, true)).toBe(false)
    expect(validator.errors[0].message).toBe('Must be checked')
  })

  it('should accept true for boolean', () => {
    const t = defineAnnotatedType().designType('boolean').annotate('meta.required', true)
    const validator = new Validator(t.$type)
    expect(validator.validate(true, true)).toBe(true)
  })

  it('should use custom error message for boolean', () => {
    const t = defineAnnotatedType()
      .designType('boolean')
      .annotate('meta.required', { message: 'You must accept the terms' })
    const validator = new Validator(t.$type)
    expect(validator.validate(false, true)).toBe(false)
    expect(validator.errors[0].message).toBe('You must accept the terms')
  })
})

describe('Validator external context', () => {
  it('should pass context to plugin and clean up after validation', () => {
    const captured: unknown[] = []
    const plugin: TValidatorPlugin = (ctx: TValidatorPluginContext) => {
      captured.push(ctx.context)
      return true
    }
    const def = defineAnnotatedType().designType('string').$type
    const validator = new Validator(def, { plugins: [plugin] })

    validator.validate('a', true, { role: 'admin' })
    expect(captured).toEqual([{ role: 'admin' }])

    validator.validate('b', true, 42)
    expect(captured).toEqual([{ role: 'admin' }, 42])

    validator.validate('c', true)
    expect(captured).toEqual([{ role: 'admin' }, 42, undefined])
  })

  it('should have context undefined when not provided', () => {
    let seen: unknown = 'NOT_SET'
    const plugin: TValidatorPlugin = (ctx: TValidatorPluginContext) => {
      seen = ctx.context
      return undefined // fall through to default validation
    }
    const def = defineAnnotatedType().designType('string').$type
    const validator = new Validator(def, { plugins: [plugin] })

    validator.validate('hello', true)
    expect(seen).toBeUndefined()
  })
})

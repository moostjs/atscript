import { describe, it, expect } from 'vitest'

import {
  defineAnnotatedType,
  isAnnotatedType,
  type TAtscriptAnnotatedType,
  type TAtscriptTypeFinal,
  type TAtscriptTypeObject,
  type TAtscriptTypeArray,
  type TAtscriptTypeComplex,
} from './annotated-type'
import {
  serializeAnnotatedType,
  deserializeAnnotatedType,
  SERIALIZE_VERSION,
  type TSerializedTypeObject,
  type TSerializedTypeFinal,
} from './serialize'
import { Validator } from './validator'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Serialize then deserialize, returning the restored type */
function roundTrip(
  type: TAtscriptAnnotatedType,
  options?: Parameters<typeof serializeAnnotatedType>[1]
) {
  const serialized = serializeAnnotatedType(type, options)
  return deserializeAnnotatedType(serialized)
}

/** Type-narrowing helpers for test assertions */
function asFinal(t: TAtscriptAnnotatedType) {
  return t.type as TAtscriptTypeFinal
}
function asObject(t: TAtscriptAnnotatedType) {
  return t.type as TAtscriptTypeObject<string>
}
function asArray(t: TAtscriptAnnotatedType) {
  return t.type as TAtscriptTypeArray
}
function asComplex(t: TAtscriptAnnotatedType) {
  return t.type as TAtscriptTypeComplex
}

// ---------------------------------------------------------------------------
// Round-trip integrity
// ---------------------------------------------------------------------------

describe('serialize round-trip', () => {
  it('should round-trip a primitive string type', () => {
    const original = defineAnnotatedType().designType('string').tags('string').$type
    const restored = roundTrip(original)

    expect(isAnnotatedType(restored)).toBe(true)
    expect(restored.type.kind).toBe('')
    expect(asFinal(restored).designType).toBe('string')
    expect(asFinal(restored).tags).toBeInstanceOf(Set)
    expect(asFinal(restored).tags.has('string')).toBe(true)
  })

  it('should round-trip a literal type', () => {
    const original = defineAnnotatedType().designType('number').value(42).$type
    const restored = roundTrip(original)

    expect(restored.type.kind).toBe('')
    expect(asFinal(restored).designType).toBe('number')
    expect(asFinal(restored).value).toBe(42)
  })

  it('should round-trip an object type', () => {
    const original = defineAnnotatedType('object')
      .prop('name', defineAnnotatedType().designType('string').$type)
      .prop('age', defineAnnotatedType().designType('number').$type).$type
    const restored = roundTrip(original)

    expect(restored.type.kind).toBe('object')
    const obj = asObject(restored)
    expect(obj.props).toBeInstanceOf(Map)
    expect(obj.props.size).toBe(2)
    expect(asFinal(obj.props.get('name')!).designType).toBe('string')
    expect(asFinal(obj.props.get('age')!).designType).toBe('number')
  })

  it('should round-trip nested objects', () => {
    const original = defineAnnotatedType('object').prop(
      'address',
      defineAnnotatedType('object')
        .prop('city', defineAnnotatedType().designType('string').$type)
        .prop('zip', defineAnnotatedType().designType('number').$type).$type
    ).$type
    const restored = roundTrip(original)

    const address = asObject(restored).props.get('address')!
    expect(address.type.kind).toBe('object')
    expect(asFinal(asObject(address).props.get('city')!).designType).toBe('string')
    expect(asFinal(asObject(address).props.get('zip')!).designType).toBe('number')
  })

  it('should round-trip an array type', () => {
    const original = defineAnnotatedType('array').of(
      defineAnnotatedType().designType('string').$type
    ).$type
    const restored = roundTrip(original)

    expect(restored.type.kind).toBe('array')
    expect(asFinal(asArray(restored).of).designType).toBe('string')
  })

  it('should round-trip a union type', () => {
    const original = defineAnnotatedType('union')
      .item(defineAnnotatedType().designType('string').$type)
      .item(defineAnnotatedType().designType('number').$type).$type
    const restored = roundTrip(original)

    expect(restored.type.kind).toBe('union')
    const items = asComplex(restored).items
    expect(items).toHaveLength(2)
    expect(asFinal(items[0]).designType).toBe('string')
    expect(asFinal(items[1]).designType).toBe('number')
  })

  it('should round-trip an intersection type', () => {
    const original = defineAnnotatedType('intersection')
      .item(
        defineAnnotatedType('object').prop('a', defineAnnotatedType().designType('string').$type)
          .$type
      )
      .item(
        defineAnnotatedType('object').prop('b', defineAnnotatedType().designType('number').$type)
          .$type
      ).$type
    const restored = roundTrip(original)

    expect(restored.type.kind).toBe('intersection')
    expect(asComplex(restored).items).toHaveLength(2)
  })

  it('should round-trip a tuple type', () => {
    const original = defineAnnotatedType('tuple')
      .item(defineAnnotatedType().designType('string').$type)
      .item(defineAnnotatedType().designType('number').$type)
      .item(defineAnnotatedType().designType('boolean').$type).$type
    const restored = roundTrip(original)

    expect(restored.type.kind).toBe('tuple')
    const items = asComplex(restored).items
    expect(items).toHaveLength(3)
    expect(asFinal(items[2]).designType).toBe('boolean')
  })

  it('should preserve optional flag', () => {
    const original = defineAnnotatedType().designType('string').optional().$type
    const restored = roundTrip(original)
    expect(restored.optional).toBe(true)
  })

  it('should not set optional when false', () => {
    const original = defineAnnotatedType().designType('string').$type
    const restored = roundTrip(original)
    expect(restored.optional).toBeUndefined()
  })

  it('should round-trip tags through Set→Array→Set', () => {
    const original = defineAnnotatedType()
      .designType('string')
      .tags('string', 'email', 'uuid').$type
    const serialized = serializeAnnotatedType(original)
    expect(Array.isArray(serialized.type.tags)).toBe(true)
    expect(serialized.type.tags).toContain('email')

    const restored = deserializeAnnotatedType(serialized)
    const tags = asFinal(restored).tags
    expect(tags).toBeInstanceOf(Set)
    expect(tags.has('email')).toBe(true)
    expect(tags.has('uuid')).toBe(true)
  })

  it('should round-trip propsPatterns with RegExp', () => {
    const original = defineAnnotatedType('object')
      .prop('id', defineAnnotatedType().designType('string').$type)
      .propPattern(/^extra_/, defineAnnotatedType().designType('string').$type).$type

    const serialized = serializeAnnotatedType(original)
    const serializedObj = serialized.type as TSerializedTypeObject
    expect(serializedObj.propsPatterns[0].pattern).toEqual({ source: '^extra_', flags: '' })

    const restored = deserializeAnnotatedType(serialized)
    const restoredObj = asObject(restored)
    expect(restoredObj.propsPatterns[0].pattern).toBeInstanceOf(RegExp)
    expect(restoredObj.propsPatterns[0].pattern.test('extra_foo')).toBe(true)
    expect(restoredObj.propsPatterns[0].pattern.test('other')).toBe(false)
  })

  it('should round-trip metadata with various value types', () => {
    const original = defineAnnotatedType()
      .designType('string')
      .annotate('meta.label', 'Name')
      .annotate('expect.minLength', 3)
      .annotate('meta.sensitive', true)
      .annotate('expect.pattern', { pattern: '^[a-z]+$', flags: 'i' }, true).$type

    const restored = roundTrip(original)
    expect(restored.metadata).toBeInstanceOf(Map)
    expect(restored.metadata.get('meta.label')).toBe('Name')
    expect(restored.metadata.get('expect.minLength')).toBe(3)
    expect(restored.metadata.get('meta.sensitive')).toBe(true)
    expect(restored.metadata.get('expect.pattern')).toEqual([{ pattern: '^[a-z]+$', flags: 'i' }])
  })

  it('should handle empty metadata', () => {
    const original = defineAnnotatedType().designType('string').$type
    const serialized = serializeAnnotatedType(original)
    expect(serialized.metadata).toEqual({})

    const restored = deserializeAnnotatedType(serialized)
    expect(restored.metadata.size).toBe(0)
  })

  it('should handle empty object (no props)', () => {
    const original = defineAnnotatedType('object').$type
    const restored = roundTrip(original)
    expect(restored.type.kind).toBe('object')
    expect(asObject(restored).props.size).toBe(0)
  })

  it('should handle deeply nested structures', () => {
    const original = defineAnnotatedType('object').prop(
      'a',
      defineAnnotatedType('object').prop(
        'b',
        defineAnnotatedType('object').prop(
          'c',
          defineAnnotatedType('object').prop(
            'd',
            defineAnnotatedType('object').prop(
              'e',
              defineAnnotatedType().designType('string').$type
            ).$type
          ).$type
        ).$type
      ).$type
    ).$type

    const restored = roundTrip(original)
    const e = asObject(restored).props.get('a')!
    const eDeep = asObject(e).props.get('b')!
    const eDeeper = asObject(eDeep).props.get('c')!
    const eDeepest = asObject(eDeeper).props.get('d')!
    const leaf = asObject(eDeepest).props.get('e')!
    expect(asFinal(leaf).designType).toBe('string')
  })
})

// ---------------------------------------------------------------------------
// Validator re-attachment
// ---------------------------------------------------------------------------

describe('deserialized validator', () => {
  it('should have a working validator on deserialized type', () => {
    const original = defineAnnotatedType('object')
      .prop('name', defineAnnotatedType().designType('string').$type)
      .prop('age', defineAnnotatedType().designType('number').$type).$type

    const restored = roundTrip(original)
    const validator = new Validator(restored)
    expect(validator.validate({ name: 'Alice', age: 30 }, true)).toBe(true)
    expect(validator.validate({ name: 'Alice', age: '30' }, true)).toBe(false)
  })

  it('should validate with metadata constraints after deserialization', () => {
    const original = defineAnnotatedType()
      .designType('string')
      .annotate('expect.minLength', 3).$type

    const restored = roundTrip(original)
    const validator = new Validator(restored)
    expect(validator.validate('hello', true)).toBe(true)
    expect(validator.validate('hi', true)).toBe(false)
  })

  it('should support calling validator via .validator() method', () => {
    const original = defineAnnotatedType('object').prop(
      'x',
      defineAnnotatedType().designType('number').$type
    ).$type

    const restored = roundTrip(original)
    const validator = restored.validator()
    expect(validator.validate({ x: 1 }, true)).toBe(true)
    expect(validator.validate({ x: 'a' }, true)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Serialization options
// ---------------------------------------------------------------------------

describe('serialize options', () => {
  it('should strip annotations listed in ignoreAnnotations', () => {
    const original = defineAnnotatedType()
      .designType('string')
      .annotate('meta.label', 'Name')
      .annotate('meta.description', 'User name')
      .annotate('expect.minLength', 1).$type

    const serialized = serializeAnnotatedType(original, {
      ignoreAnnotations: ['meta.description'],
    })

    expect(serialized.metadata).toEqual({
      'meta.label': 'Name',
      'expect.minLength': 1,
    })
  })

  it('should strip multiple annotations', () => {
    const original = defineAnnotatedType()
      .designType('string')
      .annotate('meta.label', 'Name')
      .annotate('meta.description', 'desc')
      .annotate('meta.sensitive', true)
      .annotate('expect.minLength', 1).$type

    const serialized = serializeAnnotatedType(original, {
      ignoreAnnotations: ['meta.description', 'meta.sensitive'],
    })

    expect(serialized.metadata).toEqual({
      'meta.label': 'Name',
      'expect.minLength': 1,
    })
  })

  it('should not affect type structure when stripping annotations', () => {
    const original = defineAnnotatedType('object')
      .prop('name', defineAnnotatedType().designType('string').annotate('meta.label', 'Name').$type)
      .annotate('meta.label', 'Root').$type

    const serialized = serializeAnnotatedType(original, {
      ignoreAnnotations: ['meta.label'],
    })

    const serializedObj = serialized.type as TSerializedTypeObject
    expect(serialized.type.kind).toBe('object')
    expect(serializedObj.props.name).toBeDefined()
    expect(serialized.metadata).toEqual({})
    expect(serializedObj.props.name.metadata).toEqual({})
  })

  it('should rename annotations via processAnnotation', () => {
    const original = defineAnnotatedType().designType('string').annotate('meta.label', 'Name').$type

    const serialized = serializeAnnotatedType(original, {
      processAnnotation(ctx) {
        if (ctx.key === 'meta.label') {
          return { key: 'label', value: ctx.value }
        }
        return { key: ctx.key, value: ctx.value }
      },
    })

    expect(serialized.metadata).toEqual({ label: 'Name' })
  })

  it('should transform annotation values via processAnnotation', () => {
    const original = defineAnnotatedType().designType('string').annotate('meta.label', 'Name').$type

    const serialized = serializeAnnotatedType(original, {
      processAnnotation(ctx) {
        if (ctx.key === 'meta.label') {
          return { key: ctx.key, value: (ctx.value as string).toUpperCase() }
        }
        return { key: ctx.key, value: ctx.value }
      },
    })

    expect(serialized.metadata).toEqual({ 'meta.label': 'NAME' })
  })

  it('should strip annotations when processAnnotation returns undefined', () => {
    const original = defineAnnotatedType()
      .designType('string')
      .annotate('meta.label', 'Name')
      .annotate('meta.description', 'secret').$type

    const serialized = serializeAnnotatedType(original, {
      processAnnotation(ctx) {
        if (ctx.key === 'meta.description') {
          return undefined
        }
        return { key: ctx.key, value: ctx.value }
      },
    })

    expect(serialized.metadata).toEqual({ 'meta.label': 'Name' })
  })

  it('should provide correct path in processAnnotation context', () => {
    const original = defineAnnotatedType('object').prop(
      'address',
      defineAnnotatedType('object').prop(
        'city',
        defineAnnotatedType().designType('string').annotate('meta.label', 'City').$type
      ).$type
    ).$type

    const calls: Array<{ key: string; path: string[]; kind: string }> = []
    serializeAnnotatedType(original, {
      processAnnotation(ctx) {
        calls.push({ key: ctx.key, path: [...ctx.path], kind: ctx.kind })
        return { key: ctx.key, value: ctx.value }
      },
    })

    expect(calls).toContainEqual({
      key: 'meta.label',
      path: ['address', 'city'],
      kind: '',
    })
  })

  it('should provide correct kind in processAnnotation context', () => {
    const original = defineAnnotatedType('object')
      .annotate('meta.label', 'Root')
      .prop(
        'items',
        defineAnnotatedType('array')
          .annotate('meta.label', 'Items')
          .of(defineAnnotatedType().designType('string').$type).$type
      ).$type

    const calls: Array<{ key: string; kind: string }> = []
    serializeAnnotatedType(original, {
      processAnnotation(ctx) {
        calls.push({ key: ctx.key, kind: ctx.kind })
        return { key: ctx.key, value: ctx.value }
      },
    })

    expect(calls).toContainEqual({ key: 'meta.label', kind: 'object' })
    expect(calls).toContainEqual({ key: 'meta.label', kind: 'array' })
  })

  it('should apply ignoreAnnotations before processAnnotation', () => {
    const original = defineAnnotatedType()
      .designType('string')
      .annotate('meta.label', 'Name')
      .annotate('meta.description', 'secret')
      .annotate('expect.minLength', 1).$type

    const processed: string[] = []
    serializeAnnotatedType(original, {
      ignoreAnnotations: ['meta.description'],
      processAnnotation(ctx) {
        processed.push(ctx.key)
        return { key: ctx.key, value: ctx.value }
      },
    })

    // meta.description should never reach processAnnotation
    expect(processed).not.toContain('meta.description')
    expect(processed).toContain('meta.label')
    expect(processed).toContain('expect.minLength')
  })
})

// ---------------------------------------------------------------------------
// Version handling
// ---------------------------------------------------------------------------

describe('serialize version', () => {
  it('should include $v marker in serialized output', () => {
    const original = defineAnnotatedType().designType('string').$type
    const serialized = serializeAnnotatedType(original)
    expect(serialized.$v).toBe(SERIALIZE_VERSION)
  })

  it('should throw on wrong version during deserialization', () => {
    const serialized = serializeAnnotatedType(defineAnnotatedType().designType('string').$type)
    ;(serialized as any).$v = 999

    expect(() => deserializeAnnotatedType(serialized)).toThrow(
      /Unsupported serialized type version: 999/
    )
  })
})

// ---------------------------------------------------------------------------
// isAnnotatedType guard
// ---------------------------------------------------------------------------

describe('deserialized type guard', () => {
  it('should pass isAnnotatedType check', () => {
    const original = defineAnnotatedType('object').prop(
      'x',
      defineAnnotatedType().designType('number').$type
    ).$type
    const restored = roundTrip(original)
    expect(isAnnotatedType(restored)).toBe(true)
  })

  it('should pass isAnnotatedType on nested nodes', () => {
    const original = defineAnnotatedType('object').prop(
      'x',
      defineAnnotatedType().designType('number').$type
    ).$type
    const restored = roundTrip(original)
    expect(isAnnotatedType(asObject(restored).props.get('x')!)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// JSON serialization safety
// ---------------------------------------------------------------------------

describe('JSON safety', () => {
  it('should produce valid JSON from serialize', () => {
    const original = defineAnnotatedType('object')
      .prop(
        'name',
        defineAnnotatedType()
          .designType('string')
          .tags('string', 'email')
          .annotate('meta.label', 'Name')
          .annotate('expect.pattern', { pattern: '^[a-z]+$', flags: 'i' }, true).$type
      )
      .prop(
        'items',
        defineAnnotatedType('array').of(defineAnnotatedType().designType('number').$type).$type
      )
      .propPattern(/^meta_/, defineAnnotatedType().designType('string').$type)
      .annotate('meta.label', 'Root').$type

    const serialized = serializeAnnotatedType(original)
    const json = JSON.stringify(serialized)
    const parsed = JSON.parse(json)
    const restored = deserializeAnnotatedType(parsed)

    expect(isAnnotatedType(restored)).toBe(true)
    expect(restored.metadata.get('meta.label')).toBe('Root')
    expect(asObject(restored).props.get('name')?.metadata.get('meta.label')).toBe('Name')

    // Validator works after JSON round-trip
    const validator = new Validator(restored)
    expect(validator.validate({ name: 'test', items: [1, 2] }, true)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Phantom type handling
// ---------------------------------------------------------------------------

describe('phantom type serialization', () => {
  it('should preserve phantom props when serializing objects', () => {
    const original = defineAnnotatedType('object')
      .prop('name', defineAnnotatedType().designType('string').$type)
      .prop('info', defineAnnotatedType().designType('phantom').tags('phantom', 'ui').$type)
      .prop('age', defineAnnotatedType().designType('number').$type).$type

    const serialized = serializeAnnotatedType(original)
    const serializedObj = serialized.type as TSerializedTypeObject

    // Phantom prop should be present in serialized props
    expect(serializedObj.props.info).toBeDefined()
    expect((serializedObj.props.info.type as TSerializedTypeFinal).designType).toBe('phantom')
    // Regular props should also be present
    expect(serializedObj.props.name).toBeDefined()
    expect(serializedObj.props.age).toBeDefined()
  })

  it('should restore phantom props correctly', () => {
    const original = defineAnnotatedType('object')
      .prop('name', defineAnnotatedType().designType('string').$type)
      .prop('action', defineAnnotatedType().designType('phantom').tags('phantom', 'ui').$type)
      .prop('age', defineAnnotatedType().designType('number').$type).$type

    const restored = roundTrip(original)
    const restoredObj = asObject(restored)

    // Phantom props should be restored
    expect(restoredObj.props.has('action')).toBe(true)
    const actionProp = restoredObj.props.get('action')!
    expect(asFinal(actionProp).designType).toBe('phantom')
    expect(asFinal(actionProp).tags.has('phantom')).toBe(true)
    expect(asFinal(actionProp).tags.has('ui')).toBe(true)

    // Regular props should also be present
    expect(restoredObj.props.has('name')).toBe(true)
    expect(restoredObj.props.has('age')).toBe(true)
    expect(restoredObj.props.size).toBe(3)
  })

  it('should serialize phantom type when encountered directly', () => {
    const original = defineAnnotatedType().designType('phantom').tags('phantom', 'ui').$type

    const serialized = serializeAnnotatedType(original)
    const serializedFinal = serialized.type as TSerializedTypeFinal

    expect(serializedFinal.kind).toBe('')
    expect(serializedFinal.designType).toBe('phantom')
    expect(serializedFinal.tags).toContain('phantom')
    expect(serializedFinal.tags).toContain('ui')
  })

  it('should restore phantom type when encountered directly', () => {
    const original = defineAnnotatedType().designType('phantom').tags('phantom', 'ui').$type
    const restored = roundTrip(original)

    expect(restored.type.kind).toBe('')
    expect(asFinal(restored).designType).toBe('phantom')
    expect(asFinal(restored).tags.has('phantom')).toBe(true)
    expect(asFinal(restored).tags.has('ui')).toBe(true)
  })

  it('should preserve nested phantom props in complex structures', () => {
    const original = defineAnnotatedType('object')
      .prop(
        'user',
        defineAnnotatedType('object')
          .prop('name', defineAnnotatedType().designType('string').$type)
          .prop(
            'resetPassword',
            defineAnnotatedType().designType('phantom').tags('ui', 'action').$type
          ).$type
      )
      .prop(
        'metadata',
        defineAnnotatedType('object')
          .prop('created', defineAnnotatedType().designType('string').$type)
          .prop(
            'deleteButton',
            defineAnnotatedType().designType('phantom').tags('ui', 'button').$type
          ).$type
      ).$type

    const restored = roundTrip(original)
    const user = asObject(asObject(restored).props.get('user')!)
    const metadata = asObject(asObject(restored).props.get('metadata')!)

    // Phantom props should be preserved at all nesting levels
    expect(user.props.has('resetPassword')).toBe(true)
    expect(asFinal(user.props.get('resetPassword')!).designType).toBe('phantom')
    expect(metadata.props.has('deleteButton')).toBe(true)
    expect(asFinal(metadata.props.get('deleteButton')!).designType).toBe('phantom')

    // Regular props should also be present
    expect(user.props.has('name')).toBe(true)
    expect(metadata.props.has('created')).toBe(true)
  })

  it('should preserve phantom props with metadata', () => {
    const original = defineAnnotatedType('object')
      .prop('name', defineAnnotatedType().designType('string').$type)
      .prop(
        'info',
        defineAnnotatedType()
          .designType('phantom')
          .annotate('meta.label', 'Info Paragraph')
          .annotate('meta.description', 'Informational text')
          .tags('phantom', 'ui').$type
      ).$type

    const restored = roundTrip(original)
    const info = asObject(restored).props.get('info')!

    expect(asFinal(info).designType).toBe('phantom')
    expect(info.metadata.get('meta.label')).toBe('Info Paragraph')
    expect(info.metadata.get('meta.description')).toBe('Informational text')
    expect(asFinal(info).tags.has('ui')).toBe(true)
  })
})

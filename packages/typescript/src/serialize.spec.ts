import { existsSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'

import { build } from '@atscript/core'
import { beforeAll, describe, it, expect } from 'vitest'

import { tsPlugin } from './plugin'
import {
  defineAnnotatedType,
  isAnnotatedType,
  type TAtscriptAnnotatedType,
  type TAtscriptTypeFinal,
  type TAtscriptTypeObject,
  type TAtscriptTypeArray,
  type TAtscriptTypeComplex,
} from './runtime/annotated-type'
import {
  serializeAnnotatedType,
  deserializeAnnotatedType,
  SERIALIZE_VERSION,
  type TSerializedAnnotatedTypeInner,
  type TSerializedTypeObject,
  type TSerializedTypeFinal,
} from './runtime/serialize'
import { Validator } from './runtime/validator'

const fixturesDir = path.join(path.dirname(import.meta.url.slice(7)), '../test/fixtures')

async function prepareFractionalRefFixtures() {
  const repo = await build({
    rootDir: fixturesDir,
    entries: ['fractional-ref.as'],
    plugins: [tsPlugin()],
  })
  const [outJs, outDts] = await Promise.all([
    repo.generate({ outDir: '.', format: 'js' }),
    repo.generate({ outDir: '.', format: 'dts' }),
  ])
  for (const file of [...outJs, ...outDts]) {
    const target = file.target ?? path.join(fixturesDir, file.fileName)
    if (!existsSync(target) || readFileSync(target, 'utf8') !== file.content) {
      writeFileSync(target, file.content)
    }
  }
}

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
    expect(serialized.type.kind).not.toBe('$ref')
    if (serialized.type.kind === '$ref') {
      throw new Error('unreachable')
    }
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

// ---------------------------------------------------------------------------
// $ref resolution
// ---------------------------------------------------------------------------

describe('$ref resolution', () => {
  it('should resolve $ref for recursive type (tree node)', () => {
    // Build a self-referential type: TreeNode { value: string, children: TreeNode[] }
    const handle = defineAnnotatedType('object').id('TreeNode')
    handle.prop('value', defineAnnotatedType().designType('string').$type)
    // children is an array of TreeNode — creates a cycle
    handle.prop('children', defineAnnotatedType('array').of(handle.$type).$type)

    const serialized = serializeAnnotatedType(handle.$type)
    const restored = deserializeAnnotatedType(serialized)

    expect(restored.type.kind).toBe('object')
    const obj = asObject(restored)
    expect(asFinal(obj.props.get('value')!).designType).toBe('string')

    // children should be an array whose element is the TreeNode itself
    const children = obj.props.get('children')!
    expect(children.type.kind).toBe('array')
    const childOf = asArray(children).of
    // The $ref should resolve back to the same TreeNode node
    expect(childOf).toBe(restored)
  })

  it('should resolve $ref for shared named type in union', () => {
    // Shared type appears in two branches of a union
    const shared = defineAnnotatedType('object')
      .id('Shared')
      .prop('x', defineAnnotatedType().designType('number').$type).$type

    const root = defineAnnotatedType('object')
      .prop('a', shared)
      .prop(
        'b',
        defineAnnotatedType('union')
          .item(shared)
          .item(defineAnnotatedType().designType('null').$type).$type
      ).$type

    const serialized = serializeAnnotatedType(root)
    const restored = deserializeAnnotatedType(serialized)

    const obj = asObject(restored)
    const a = obj.props.get('a')!
    const bUnion = asComplex(obj.props.get('b')!)
    // Both references should resolve to the same object
    expect(bUnion.items[0]).toBe(a)
  })
})

// ---------------------------------------------------------------------------
// ref (FK reference) serialization
// ---------------------------------------------------------------------------

describe('ref serialization', () => {
  it('should strip refs by default (refDepth 0)', () => {
    const target = defineAnnotatedType('object')
      .id('Target')
      .prop('id', defineAnnotatedType().designType('string').$type).$type

    const source = defineAnnotatedType('object').prop(
      'targetId',
      defineAnnotatedType().refTo(target, ['id']).$type
    ).$type

    const serialized = serializeAnnotatedType(source)
    const serializedObj = serialized.type as TSerializedTypeObject
    expect(serializedObj.props.targetId.ref).toBeUndefined()

    const restored = deserializeAnnotatedType(serialized)
    const restoredProp = asObject(restored).props.get('targetId')!
    expect(restoredProp.ref).toBeUndefined()
  })

  it('should serialize FK ref with refDepth 1', () => {
    const target = defineAnnotatedType('object')
      .id('TargetTable')
      .prop('id', defineAnnotatedType().designType('string').$type)
      .prop('name', defineAnnotatedType().designType('string').$type)
      .annotate('meta.label', 'Target').$type

    const source = defineAnnotatedType('object').prop(
      'targetId',
      defineAnnotatedType().refTo(target, ['id']).$type
    ).$type

    const serialized = serializeAnnotatedType(source, { refDepth: 1 })
    const serializedObj = serialized.type as TSerializedTypeObject
    const serializedRef = serializedObj.props.targetId.ref
    expect(serializedRef).toBeDefined()
    expect(serializedRef!.field).toBe('id')
    expect(serializedRef!.type.metadata).toHaveProperty('meta.label', 'Target')

    const restored = deserializeAnnotatedType(serialized)
    const restoredProp = asObject(restored).props.get('targetId')!
    expect(restoredProp.ref).toBeDefined()
    expect(restoredProp.ref!.field).toBe('id')
    const refTarget = restoredProp.ref!.type()
    expect(refTarget.type.kind).toBe('object')
    expect(refTarget.metadata.get('meta.label')).toBe('Target')
    expect(asObject(refTarget).props.has('name')).toBe(true)
  })

  it('should not expand target refs at refDepth 1', () => {
    // A -> ref to B -> ref to C
    const typeC = defineAnnotatedType('object')
      .id('TypeC')
      .prop('id', defineAnnotatedType().designType('string').$type).$type

    const typeB = defineAnnotatedType('object')
      .id('TypeB')
      .prop('id', defineAnnotatedType().designType('string').$type)
      .prop('cId', defineAnnotatedType().refTo(typeC, ['id']).$type).$type

    const typeA = defineAnnotatedType('object').prop(
      'bId',
      defineAnnotatedType().refTo(typeB, ['id']).$type
    ).$type

    const serialized = serializeAnnotatedType(typeA, { refDepth: 1 })
    const serializedObj = serialized.type as TSerializedTypeObject

    // A's ref to B should be present
    expect(serializedObj.props.bId.ref).toBeDefined()
    expect(serializedObj.props.bId.ref!.field).toBe('id')

    // B's ref to C should NOT be present (depth exhausted)
    const serializedB = serializedObj.props.bId.ref!.type as TSerializedAnnotatedTypeInner
    const serializedBObj = serializedB.type as TSerializedTypeObject
    expect(serializedBObj.props.cId.ref).toBeUndefined()
  })

  it('should expand two levels with refDepth 2', () => {
    const typeC = defineAnnotatedType('object')
      .id('TypeC2')
      .prop('id', defineAnnotatedType().designType('string').$type)
      .annotate('meta.label', 'C').$type

    const typeB = defineAnnotatedType('object')
      .id('TypeB2')
      .prop('id', defineAnnotatedType().designType('string').$type)
      .prop('cId', defineAnnotatedType().refTo(typeC, ['id']).$type).$type

    const typeA = defineAnnotatedType('object').prop(
      'bId',
      defineAnnotatedType().refTo(typeB, ['id']).$type
    ).$type

    const serialized = serializeAnnotatedType(typeA, { refDepth: 2 })
    const serializedObj = serialized.type as TSerializedTypeObject

    // A -> B
    expect(serializedObj.props.bId.ref).toBeDefined()
    const serializedB = serializedObj.props.bId.ref!.type as TSerializedAnnotatedTypeInner
    const serializedBObj = serializedB.type as TSerializedTypeObject
    // B -> C
    expect(serializedBObj.props.cId.ref).toBeDefined()
    expect(serializedBObj.props.cId.ref!.field).toBe('id')
    expect(serializedBObj.props.cId.ref!.type.metadata).toHaveProperty('meta.label', 'C')
  })

  it('should handle self-referential FK via $ref', () => {
    // Employee has a managerId FK pointing to Employee itself
    const employee = defineAnnotatedType('object')
      .id('Employee')
      .prop('id', defineAnnotatedType().designType('string').$type)
      .prop('name', defineAnnotatedType().designType('string').$type)

    employee.prop('managerId', defineAnnotatedType().refTo(employee.$type, ['id']).$type)

    const serialized = serializeAnnotatedType(employee.$type, { refDepth: 1 })
    const serializedObj = serialized.type as TSerializedTypeObject

    // managerId.ref should exist, and its type should be a $ref to Employee
    const managerRef = serializedObj.props.managerId.ref
    expect(managerRef).toBeDefined()
    expect(managerRef!.field).toBe('id')
    const managerRefTarget = managerRef!.type as TSerializedAnnotatedTypeInner
    expect(managerRefTarget.type.kind).toBe('$ref')

    // Deserialization should resolve the $ref back to the Employee node
    const restored = deserializeAnnotatedType(serialized)
    const restoredObj = asObject(restored)
    const managerProp = restoredObj.props.get('managerId')!
    expect(managerProp.ref).toBeDefined()
    expect(managerProp.ref!.type()).toBe(restored)
  })

  it('should apply processAnnotation to ref target metadata', () => {
    const target = defineAnnotatedType('object')
      .id('RefTarget')
      .prop('id', defineAnnotatedType().designType('string').$type)
      .annotate('meta.label', 'Original Label')
      .annotate('meta.description', 'secret').$type

    const source = defineAnnotatedType('object').prop(
      'fk',
      defineAnnotatedType().refTo(target, ['id']).$type
    ).$type

    const serialized = serializeAnnotatedType(source, {
      refDepth: 1,
      processAnnotation(ctx) {
        if (ctx.key === 'meta.label') {
          return { key: 'label', value: ctx.value }
        }
        if (ctx.key === 'meta.description') {
          return undefined
        }
        return { key: ctx.key, value: ctx.value }
      },
    })

    const serializedObj = serialized.type as TSerializedTypeObject
    const refMeta = serializedObj.props.fk.ref!.type.metadata
    // meta.label should be renamed to label
    expect(refMeta).toHaveProperty('label', 'Original Label')
    // meta.description should be stripped
    expect(refMeta).not.toHaveProperty('meta.description')
  })

  it('should survive full JSON round-trip with refs', () => {
    const target = defineAnnotatedType('object')
      .id('JsonTarget')
      .prop('id', defineAnnotatedType().designType('string').$type)
      .annotate('meta.label', 'My Target').$type

    const source = defineAnnotatedType('object').prop(
      'fk',
      defineAnnotatedType().refTo(target, ['id']).$type
    ).$type

    const serialized = serializeAnnotatedType(source, { refDepth: 1 })
    const json = JSON.stringify(serialized)
    const parsed = JSON.parse(json)
    const restored = deserializeAnnotatedType(parsed)

    const fk = asObject(restored).props.get('fk')!
    expect(fk.ref).toBeDefined()
    expect(fk.ref!.field).toBe('id')
    expect(fk.ref!.type().metadata.get('meta.label')).toBe('My Target')
  })

  // Regression guard: primitive `string.email` (and any pattern-carrying semantic type)
  // stores its regex source with real backslash bytes. JSON.stringify must double-escape
  // them so downstream JSON.parse succeeds. Previously asserted by a bug report against
  // `serializeFormSchema` (which is a pure delegate to serializeAnnotatedType).
  it('emits JSON-safe backslash escapes for regex-bearing metadata', () => {
    const EMAIL_REGEX = '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$'
    const source = defineAnnotatedType('object').prop(
      'email',
      defineAnnotatedType()
        .designType('string')
        .annotate(
          'expect.pattern',
          { pattern: EMAIL_REGEX, flags: '', message: 'Invalid email format.' },
          true
        ).$type
    ).$type

    const body = JSON.stringify(serializeAnnotatedType(source))
    expect(() => JSON.parse(body)).not.toThrow()
    const parsed = JSON.parse(body) as {
      type: { props: { email: { metadata: { 'expect.pattern': Array<{ pattern: string }> } } } }
    }
    expect(parsed.type.props.email.metadata['expect.pattern'][0].pattern).toBe(EMAIL_REGEX)
  })
})

// ---------------------------------------------------------------------------
// fractional refDepth (shallow ref target: { id, metadata } only)
// ---------------------------------------------------------------------------

describe('fractional refDepth', () => {
  beforeAll(prepareFractionalRefFixtures)

  it('refDepth 0.5 on a field with a single FK emits the exact shallow shape', async () => {
    const { FractionalSourceRoles } = await import('../test/fixtures/fractional-ref.as')
    const serialized = serializeAnnotatedType(
      FractionalSourceRoles as unknown as TAtscriptAnnotatedType,
      { refDepth: 0.5 }
    )
    const serializedObj = serialized.type as TSerializedTypeObject
    const ref = serializedObj.props.roleId.ref

    expect(ref).toEqual({
      field: 'id',
      type: {
        id: 'FractionalRolesTable',
        metadata: { 'meta.label': 'Roles', 'meta.description': '/api/db/tables/roles' },
      },
    })

    // Structural body intentionally omitted
    expect(ref!.type).not.toHaveProperty('type')
    expect(ref!.type).not.toHaveProperty('optional')
    expect(ref!.type).not.toHaveProperty('ref')
  })

  it('refDepth 0.5 on a target with empty metadata emits { id, metadata: {} }', async () => {
    const { FractionalSourceBarren } = await import('../test/fixtures/fractional-ref.as')
    const serialized = serializeAnnotatedType(
      FractionalSourceBarren as unknown as TAtscriptAnnotatedType,
      { refDepth: 0.5 }
    )
    const serializedObj = serialized.type as TSerializedTypeObject
    const ref = serializedObj.props.barrenId.ref

    expect(ref).toEqual({
      field: 'id',
      type: { id: 'FractionalBarrenTable', metadata: {} },
    })
    expect(ref!.type).not.toHaveProperty('type')
  })

  it('refDepth 1.5 emits one full level then shallow at the next', async () => {
    const { FractionalSourceNested } = await import('../test/fixtures/fractional-ref.as')
    const serialized = serializeAnnotatedType(
      FractionalSourceNested as unknown as TAtscriptAnnotatedType,
      { refDepth: 1.5 }
    )
    const serializedObj = serialized.type as TSerializedTypeObject

    // fieldA: full target1 body
    const aRef = serializedObj.props.fieldA.ref
    expect(aRef).toBeDefined()
    const aTarget = aRef!.type as TSerializedAnnotatedTypeInner
    expect(aTarget.type).toBeDefined()
    expect(aTarget.type.kind).toBe('object')
    expect(aTarget.metadata).toHaveProperty('meta.label', 'T1')

    // fieldB inside target1: shallow target2
    const aTargetObj = aTarget.type as TSerializedTypeObject
    const bRef = aTargetObj.props.fieldB.ref
    expect(bRef).toBeDefined()
    expect(bRef!.type).toEqual({
      id: 'FractionalTarget2',
      metadata: { 'meta.label': 'T2' },
    })
    expect(bRef!.type).not.toHaveProperty('type')
  })

  it('integer refDepth 0 and 1 outputs are byte-for-byte identical to the pre-change baseline', async () => {
    const { FractionalSourceBaseline } = await import('../test/fixtures/fractional-ref.as')
    const source = FractionalSourceBaseline as unknown as TAtscriptAnnotatedType

    // Baseline for refDepth: 0 — refs entirely stripped.
    const serialized0 = serializeAnnotatedType(source, { refDepth: 0 })
    expect((serialized0.type as TSerializedTypeObject).props.fk.ref).toBeUndefined()
    expect((serialized0.type as TSerializedTypeObject).props.fk.type).toEqual({
      kind: '',
      designType: 'string',
      tags: ['string'],
    })

    // Baseline for refDepth: 1 — ref present with full target body, unchanged shape.
    const serialized1 = serializeAnnotatedType(source, { refDepth: 1 })
    const fkAtDepth1 = (serialized1.type as TSerializedTypeObject).props.fk
    expect(fkAtDepth1.ref).toBeDefined()
    const targetInner = fkAtDepth1.ref!.type as TSerializedAnnotatedTypeInner
    // Full shape has id + type body + metadata
    expect(targetInner.id).toBe('FractionalBaselineTarget')
    expect(targetInner.type).toBeDefined()
    expect(targetInner.type.kind).toBe('object')
    expect(targetInner.metadata).toEqual({ 'meta.label': 'Target' })
    // Target body preserves props (regression guard — integer path unchanged)
    const targetObj = targetInner.type as TSerializedTypeObject
    expect(Object.keys(targetObj.props).sort()).toEqual(['id', 'name'])
  })

  it('deserialize round-trip of a shallow-ref payload preserves field and target metadata', async () => {
    const { FractionalSourceShallow } = await import('../test/fixtures/fractional-ref.as')
    const source = FractionalSourceShallow as unknown as TAtscriptAnnotatedType

    const serialized = serializeAnnotatedType(source, { refDepth: 0.5 })
    const restored = deserializeAnnotatedType(serialized)

    const fk = (restored.type as TAtscriptTypeObject).props.get('fk')!
    expect(fk.ref).toBeDefined()
    expect(fk.ref!.field).toBe('id')

    const refTarget = fk.ref!.type()
    expect(refTarget.id).toBe('FractionalShallowTarget')
    expect(refTarget.metadata.get('meta.label')).toBe('Shallow')
    expect(refTarget.metadata.get('meta.description')).toBe('/api/db/tables/shallow')

    // Re-serializing the deserialized tree at refDepth 0.5 yields a structurally identical payload.
    const reserialized = serializeAnnotatedType(restored, { refDepth: 0.5 })
    expect(reserialized).toEqual(serialized)
  })

  it('deserialize round-trip of an integer-depth payload preserves the full target body', async () => {
    const { FractionalSourceFull } = await import('../test/fixtures/fractional-ref.as')
    const source = FractionalSourceFull as unknown as TAtscriptAnnotatedType

    const serialized = serializeAnnotatedType(source, { refDepth: 1 })
    const restored = deserializeAnnotatedType(serialized)

    const fk = (restored.type as TAtscriptTypeObject).props.get('fk')!
    expect(fk.ref).toBeDefined()
    const refTarget = fk.ref!.type()
    expect(refTarget.type.kind).toBe('object')
    const refObj = refTarget.type as TAtscriptTypeObject
    expect(refObj.props.has('id')).toBe(true)
    expect(refObj.props.has('name')).toBe(true)
    expect(refTarget.metadata.get('meta.label')).toBe('Full')
  })
})

import { describe, expect, it } from 'vitest'
import { defineAnnotatedType as $, type TAtscriptAnnotatedType, type TAtscriptTypeObject } from './annotated-type'
import { flattenAnnotatedType } from './flatten'

function buildObject() {
  // {
  //   name: string
  //   address: { street: string, city: string }
  //   tags: string[]
  //   items: { label: string, count: number }[]
  //   complexField: { a: string } | { a: number, b: string }
  // }
  return $('object')
    .prop('name', $().designType('string').tags('string').$type)
    .prop(
      'address',
      $('object')
        .prop('street', $().designType('string').tags('string').$type)
        .prop('city', $().designType('string').tags('string').$type).$type
    )
    .prop(
      'tags',
      $('array').of($().designType('string').tags('string').$type).$type
    )
    .prop(
      'items',
      $('array').of(
        $('object')
          .prop('label', $().designType('string').tags('string').$type)
          .prop('count', $().designType('number').tags('number').$type).$type
      ).$type
    )
    .prop(
      'complexField',
      $('union')
        .item(
          $('object')
            .prop('a', $().designType('string').tags('string').$type).$type
        )
        .item(
          $('object')
            .prop('a', $().designType('number').tags('number').$type)
            .prop('b', $().designType('string').tags('string').$type).$type
        ).$type
    )
    .$type as TAtscriptAnnotatedType<TAtscriptTypeObject>
}

describe('flattenAnnotatedType', () => {
  it('should flatten a simple object with nested objects', () => {
    const type = buildObject()
    const flatMap = flattenAnnotatedType(type)

    expect(flatMap.has('')).toBe(true) // root
    expect(flatMap.has('name')).toBe(true)
    expect(flatMap.has('address')).toBe(true)
    expect(flatMap.has('address.street')).toBe(true)
    expect(flatMap.has('address.city')).toBe(true)
  })

  it('should flatten arrays and their element types', () => {
    const type = buildObject()
    const flatMap = flattenAnnotatedType(type)

    expect(flatMap.has('tags')).toBe(true)
    expect(flatMap.has('items')).toBe(true)
    expect(flatMap.has('items.label')).toBe(true)
    expect(flatMap.has('items.count')).toBe(true)
  })

  it('should flatten unions by merging paths into synthetic union types', () => {
    const type = buildObject()
    const flatMap = flattenAnnotatedType(type)

    expect(flatMap.has('complexField')).toBe(true)
    expect(flatMap.has('complexField.a')).toBe(true)
    expect(flatMap.has('complexField.b')).toBe(true)

    // complexField.a should be a synthetic union of string | number
    const fieldA = flatMap.get('complexField.a') as any
    expect(fieldA.__flat_union).toBe(true)
    expect(fieldA.type.kind).toBe('union')
    expect(fieldA.type.items).toHaveLength(2)
  })

  it('should call onField for each field with a prefix', () => {
    const type = buildObject()
    const fields: string[] = []

    flattenAnnotatedType(type, {
      onField: (path) => fields.push(path),
    })

    expect(fields).toContain('name')
    expect(fields).toContain('address')
    expect(fields).toContain('address.street')
    expect(fields).toContain('address.city')
    expect(fields).toContain('tags')
    expect(fields).toContain('items')
    expect(fields).toContain('items.label')
    expect(fields).toContain('items.count')
    // root ('') should NOT be in onField calls
    expect(fields).not.toContain('')
  })

  it('should tag top-level arrays when topLevelArrayTag is set', () => {
    const type = buildObject()
    const flatMap = flattenAnnotatedType(type, {
      topLevelArrayTag: 'test.__topLevelArray',
    })

    const tagsField = flatMap.get('tags')!
    expect(tagsField.metadata.get('test.__topLevelArray' as any)).toBe(true)

    const itemsField = flatMap.get('items')!
    expect(itemsField.metadata.get('test.__topLevelArray' as any)).toBe(true)
  })

  it('should not tag top-level arrays when topLevelArrayTag is not set', () => {
    const type = buildObject()
    const flatMap = flattenAnnotatedType(type)

    const tagsField = flatMap.get('tags')!
    expect(tagsField.metadata.get('test.__topLevelArray' as any)).toBeUndefined()
  })

  it('should include phantom types by default', () => {
    const type = $('object')
      .prop('real', $().designType('string').tags('string').$type)
      .prop('phantom', $().designType('phantom').$type)
      .$type as TAtscriptAnnotatedType<TAtscriptTypeObject>

    const flatMap = flattenAnnotatedType(type)
    expect(flatMap.has('real')).toBe(true)
    expect(flatMap.has('phantom')).toBe(true)
  })

  it('should exclude phantom types when excludePhantomTypes is true', () => {
    const type = $('object')
      .prop('real', $().designType('string').tags('string').$type)
      .prop('phantom', $().designType('phantom').$type)
      .$type as TAtscriptAnnotatedType<TAtscriptTypeObject>

    const flatMap = flattenAnnotatedType(type, { excludePhantomTypes: true })
    expect(flatMap.has('real')).toBe(true)
    expect(flatMap.has('phantom')).toBe(false)
  })

  it('should handle deeply nested structures', () => {
    const type = $('object')
      .prop(
        'level1',
        $('object')
          .prop(
            'level2',
            $('object')
              .prop('level3', $().designType('string').tags('string').$type).$type
          ).$type
      )
      .$type as TAtscriptAnnotatedType<TAtscriptTypeObject>

    const flatMap = flattenAnnotatedType(type)
    expect(flatMap.has('level1')).toBe(true)
    expect(flatMap.has('level1.level2')).toBe(true)
    expect(flatMap.has('level1.level2.level3')).toBe(true)
  })

  it('should handle nested arrays of objects', () => {
    const type = $('object')
      .prop(
        'matrix',
        $('array').of(
          $('array').of(
            $('object')
              .prop('value', $().designType('number').tags('number').$type).$type
          ).$type
        ).$type
      )
      .$type as TAtscriptAnnotatedType<TAtscriptTypeObject>

    const flatMap = flattenAnnotatedType(type)
    expect(flatMap.has('matrix')).toBe(true)
    expect(flatMap.has('matrix.value')).toBe(true)
  })
})

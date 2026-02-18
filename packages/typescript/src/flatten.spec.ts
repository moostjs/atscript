import { describe, expect, it } from 'vitest'
import { defineAnnotatedType as $, type TAtscriptAnnotatedType, type TAtscriptTypeObject, type TAtscriptTypeArray } from './annotated-type'
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

describe('refTo metadata propagation', () => {
  it('should propagate type-level metadata through refTo for array elements', () => {
    // Simulate: @label "Address" interface TAddress { @label "Street" street: string; @label "City" city: string }
    const TAddress = $('object')
      .prop('street', $().designType('string').tags('string').annotate('label' as any, 'Street').$type)
      .prop('city', $().designType('string').tags('string').annotate('label' as any, 'City').$type)
      .annotate('label' as any, 'Address')
      .$type

    // Simulate: export interface ExplorationForm { @label "Name" name: string; @label "Addresses" addresses: TAddress[] }
    const ExplorationForm = $('object')
      .prop('name', $().designType('string').tags('string').annotate('label' as any, 'Name').$type)
      .prop('addresses',
        $('array')
          .of($().refTo(TAddress).$type)
          .annotate('label' as any, 'Addresses')
          .$type)
      .$type as TAtscriptAnnotatedType<TAtscriptTypeObject>

    // Property-level metadata
    const addressesProp = ExplorationForm.type.props.get('addresses')!
    expect(addressesProp.metadata.get('label' as any)).toBe('Addresses')

    // Element type should carry TAddress's type-level metadata
    const elementType = (addressesProp.type as TAtscriptTypeArray).of
    expect(elementType.metadata.get('label' as any)).toBe('Address')

    // Props inside the element should retain their metadata (shared via type reference)
    expect((elementType.type as TAtscriptTypeObject).props.get('street')!.metadata.get('label' as any)).toBe('Street')
    expect((elementType.type as TAtscriptTypeObject).props.get('city')!.metadata.get('label' as any)).toBe('City')
  })

  it('should allow property annotations to override type-level metadata from refTo', () => {
    const Inner = $('object')
      .prop('x', $().designType('string').$type)
      .annotate('label' as any, 'Inner Label')
      .$type

    // When refTo copies metadata AND then .annotate() overrides
    const ref = $().refTo(Inner).annotate('label' as any, 'Overridden').$type
    expect(ref.metadata.get('label' as any)).toBe('Overridden')
  })

  it('should not mutate the original type metadata when annotating after refTo', () => {
    const Original = $('object')
      .prop('x', $().designType('string').$type)
      .annotate('label' as any, 'Original')
      .$type

    $().refTo(Original).annotate('label' as any, 'Changed').$type

    // Original should be unaffected
    expect(Original.metadata.get('label' as any)).toBe('Original')
  })
})

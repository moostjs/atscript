import { describe, it, expect } from 'vitest'
import { TsType } from './ts-type'

describe('TsType', () => {
  it('renders a simple type', () => {
    const t = new TsType('string')
    expect(t.render()).toBe('string')
    expect(t.renderTypes()).toBe('string') // same for .d.ts
  })

  it('renders a union type', () => {
    const t = new TsType('string').union(new TsType('number'))
    expect(t.render()).toBe('string | number')
  })

  it('renders an intersection type', () => {
    const t = new TsType('A').intersection(new TsType('B'))
    expect(t.render()).toBe('A & B')
  })

  it('renders an array type (single dimension)', () => {
    const t = new TsType('User').array()
    expect(t.render()).toBe('User[]')
  })

  it('renders a nested array type', () => {
    const t = new TsType('User').array().array()
    expect(t.render()).toBe('User[][]')
  })

  it('renders a generic type', () => {
    const t = new TsType('Promise').generic(new TsType('string'))
    expect(t.render()).toBe('Promise<string>')
  })

  it('renders a generic with complex type', () => {
    const t = new TsType('Promise').generic(
      new TsType('string').union(new TsType('number')).array()
    )
    expect(t.render()).toBe('Promise<(string | number)[]>')
  })

  it('renders a generic type with a union parameter', () => {
    const t = new TsType('Promise').generic(new TsType('string').union(new TsType('number')))
    expect(t.render()).toBe('Promise<string | number>')
  })

  it('renders union + intersection combos', () => {
    // (A | B) & C[]
    const t = new TsType('A').union(new TsType('B')).intersection(new TsType('C').array())
    expect(t.render()).toBe('A | B & C[]')
  })
})

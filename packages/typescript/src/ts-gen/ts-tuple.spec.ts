import { describe, it, expect } from 'vitest'
import { TsTuple } from './ts-tuple'

describe('TsTuple', () => {
  it('renders a simple tuple', () => {
    const t = new TsTuple()
    t.addItem('string')
    t.addItem('string')
    expect(t.render()).toBe('[string, string]')
    expect(t.renderTypes()).toBe('[string, string]') // same for .d.ts
  })
  it('renders a tuple array', () => {
    const t = new TsTuple()
    t.addItem('string')
    t.addItem('string')
    t.array()
    expect(t.render()).toBe('[string, string][]')
    expect(t.renderTypes()).toBe('[string, string][]') // same for .d.ts
  })
})

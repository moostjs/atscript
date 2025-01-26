import { describe, it, expect } from 'vitest'
import { TsTypeAlias } from './ts-type-alias'
import { TsType } from './ts-type'
import { TsStructure } from './ts-structure'

describe('TsTypeAlias', () => {
  it('renders a simple alias with named export', () => {
    // "export type MyAlias = string;"
    const alias = new TsTypeAlias('MyAlias', new TsType('string'))
    expect(alias.render()).toBe('type MyAlias = string;')
    expect(alias.renderTypes()).toBe('declare type MyAlias = string;')
  })

  it('renders a union type alias', () => {
    // "export type UnionAlias = string | number;"
    const unionType = new TsType('string').union(new TsType('number'))
    const alias = new TsTypeAlias('UnionAlias', unionType).exportAs('named')
    expect(alias.render()).toBe('export type UnionAlias = string | number;')
    expect(alias.renderTypes()).toBe('export type UnionAlias = string | number;')
  })

  it('renders a generic array type alias', () => {
    // "export type ArrayAlias = Promise<(string | number)[]>;"
    const complexType = new TsType('Promise').generic(
      new TsType('string').union(new TsType('number')).array()
    )
    const alias = new TsTypeAlias('ArrayAlias', complexType).exportAs('named')
    expect(alias.render()).toBe('export type ArrayAlias = Promise<(string | number)[]>;')
  })

  it('renders doc lines in .ts output', () => {
    // e.g.:
    // /**
    //  * This is my alias doc
    //  * Additional details
    //  */
    // export type DocAlias = string;
    const alias = new TsTypeAlias('DocAlias', new TsType('string'))
      .exportAs('named')
      .addDocLine('This is my alias doc')
      .addDocLine('Additional details')

    expect(alias.render()).toMatchInlineSnapshot(`
      "/**
       * This is my alias doc
       * Additional details
       */
      export type DocAlias = string;"
    `)
  })

  it('renders .d.ts output (same as .ts in this design)', () => {
    // "export type MyDts = unknown;"
    // (since default TsType is "unknown" if no base/union/etc. set)
    const emptyType = new TsType() // no base name => "unknown"
    const alias = new TsTypeAlias('MyDts', emptyType).exportAs('named')
    expect(alias.renderTypes()).toBe('export type MyDts = unknown;')
  })

  it('renders structure type', () => {
    const struct = new TsStructure().addProp('test', 'string').union(new TsType('number'))
    const alias = new TsTypeAlias('MyStruct', struct)
    expect(alias.render()).toMatchInlineSnapshot(`
      "type MyStruct = {
        test: string;
      } | number;"
    `)
    expect(alias.renderTypes()).toMatchInlineSnapshot(`
      "declare type MyStruct = {
        test: string;
      } | number;"
    `)
  })
})

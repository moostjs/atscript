import { describe, it, expect } from 'vitest'
import { TsInterface } from './ts-interface'
import { TsStructure } from './ts-structure'
import { TsType } from './ts-type'

describe('TsStructure', () => {
  it('renders simple object literal with props', () => {
    const struct = new TsStructure().addProp('id', 'number').addProp('name', 'string', true) // optional

    // => "{\n  id: number;\n  name?: string;\n}"
    expect(struct.render()).toBe(`{
  id: number;
  name?: string;
}`)
  })

  it('renders nested structure', () => {
    const addressStruct = new TsStructure().addProp('city', 'string').addProp('zip', 'string')

    const userStruct = new TsStructure()
      .addProp('id', 'number')
      .addProp('name', 'string')
      .addProp('address', addressStruct)

    // => {
    //   id: number;
    //   name: string;
    //   address: {
    //     city: string;
    //     zip: string;
    //   };
    // }
    expect(userStruct.render()).toBe(`{
  id: number;
  name: string;
  address: {
    city: string;
    zip: string;
  };
}`)
  })

  it('renders object literal with union prop', () => {
    // name?: string | null
    const nameType = new TsType('string').union(new TsType('null'))

    const struct = new TsStructure().addProp('name', nameType, true)

    // => {
    //   name?: string | null;
    // }
    expect(struct.render()).toBe(`{
  name?: string | null;
}`)
  })

  it('renders structure as array', () => {
    // Make a structure: { foo: string; }
    // Then call .array() => { foo: string; }[]
    const structArray = new TsStructure().addProp('foo', 'string').array()

    expect(structArray.render()).toBe(`{
  foo: string;
}[]`)
  })

  it('renders union with a structure (object literal | string)', () => {
    // ( { foo: string } | string )
    const objectPart = new TsStructure().addProp('foo', 'string')
    const unionPart = new TsType('string')
    const struct = objectPart.union(unionPart)

    // => "{\n  foo: string;\n} | string"
    expect(struct.render()).toBe(`{
  foo: string;
} | string`)
  })
})

describe('TsInterface', () => {
  it('renders an interface from a structure', () => {
    const userStruct = new TsStructure().addProp('id', 'number').addProp('name', 'string', true)

    const userInterface = new TsInterface('User', userStruct).exportAs('named')

    // =>
    // export interface User {
    //   id: number;
    //   name?: string;
    // }
    expect(userInterface.render()).toBe(`export interface User {
  id: number;
  name?: string;
}`)
  })

  it('extends other interfaces', () => {
    const baseStruct = new TsStructure().addProp('createdAt', 'Date')
    const baseInterface = new TsInterface('BaseModel', baseStruct).exportAs('named')
    // We'll just ignore baseInterface rendering, but let's assume it's somewhere else.

    const userStruct = new TsStructure().addProp('id', 'number')
    const userInterface = new TsInterface('User', userStruct)
      .extends('BaseModel', 'Trackable')
      .exportAs('named')

    // =>
    // export interface User extends BaseModel, Trackable {
    //   id: number;
    // }
    expect(userInterface.render()).toBe(`export interface User extends BaseModel, Trackable {
  id: number;
}`)
  })

  it('supports doc lines on the interface', () => {
    const struct = new TsStructure().addProp('a', 'string')

    const iface = new TsInterface('DocTest', struct)
      .addDocLine('This is an interface doc line.')
      .addDocLine('Additional doc info.')
      .exportAs('named')

    // =>
    // /**
    //  * This is an interface doc line.
    //  * Additional doc info.
    //  */
    // export interface DocTest {
    //   a: string;
    // }
    expect(iface.render()).toBe(`/**
 * This is an interface doc line.
 * Additional doc info.
 */
export interface DocTest {
  a: string;
}`)
  })

  it('handles structure with union in an interface (fallback scenario)', () => {
    // If the structure is union-based, it's not a valid interface body.
    // Our code might fallback to an empty block with a warning.
    const unionStruct = new TsStructure().union(new TsType('string'), new TsType('number'))
    const unionIface = new TsInterface('InvalidInterface', unionStruct).exportAs('named')

    // Currently, in the sample code we used,
    // if the result doesn't start with '{' and end with '}',
    // we fallback to:
    // {
    //   // WARNING: structure is not a simple object literal.
    // }
    expect(unionIface.render()).toBe(`export interface InvalidInterface {
  // WARNING: structure is not a simple object literal.
}`)
  })
})

import { describe, expect, it } from 'vitest'

import { compileType } from '../../test/compiled-engine'
import { defineAnnotatedType as $, type TAtscriptAnnotatedType } from '../runtime/annotated-type'
import { $blk, $f } from '../runtime/blocks'
import { compiledCheckFor } from '../runtime/compiled-check/registry'
import { currentEpoch } from '../runtime/compiled-check/tracking'
import { Validator } from '../runtime/validator'
import { COMPILED_ENV } from '../runtime/validator-fast-check'

/*
 * Compiled checks over layered metadata: the bind watches every map of a layer
 * chain, so a tracked write to a base (a block, a raw `set`, a shell) re-binds once; in steady
 * state nothing re-binds.
 */

type N = TAtscriptAnnotatedType

function cls(id: string): N {
  return class {
    static __is_atscript_annotated_type = true
    static type = {}
    static metadata = new Map()
    static id = id
  } as unknown as N
}
const meta = (n: N) => n.metadata as unknown as Map<string, unknown>

/** interface Address { @expect.maxLength 3 city: string }  interface Client { address: Address } */
function world() {
  const Address = cls('Address')
  const Client = cls('Client')
  $('object', Address).prop(
    'city',
    $().designType('string').tags('string').annotate('expect.maxLength', { length: 3 }).$type
  )
  $('object', Client).prop('address', $().ref(Address).$type)
  return { Address, Client }
}

const ok = (T: N, city: string) => new Validator(T).validate({ address: { city } }, true)

describe('compiled checks bound over layers', () => {
  it('a write on a base re-binds the check once; steady state does not re-bind', () => {
    const { Address, Client } = world()
    // annotate Client { @meta.label 'Home' address.city }: Client's shell over Address.city
    $blk([1, 'm:c'], 0, Client, [
      [
        [['meta.label', 'Home']],
        [
          ['address', 0],
          ['city', 2],
        ],
      ],
    ])
    compileType(Client)
    const check = () => compiledCheckFor(Client, COMPILED_ENV)
    const first = check()
    expect(first).toBeTypeOf('function')
    expect(ok(Client, 'abc')).toBe(true)
    expect(ok(Client, 'abcd')).toBe(false)
    const epoch = currentEpoch()
    for (let i = 0; i < 5; i++) {
      ok(Client, 'ab')
    }
    expect(currentEpoch()).toBe(epoch)
    expect(check()).toBe(first)

    // a raw write on the base node (Address.city), seen through Client's shell
    meta($f(Address, 'city')).set('expect.maxLength', { length: 5 })
    expect(currentEpoch()).toBeGreaterThan(epoch)
    const second = check()
    expect(second).toBeTypeOf('function')
    expect(second).not.toBe(first)
    expect(ok(Client, 'abcd')).toBe(true)
    const epoch2 = currentEpoch()
    expect(check()).toBe(second)

    // a block on the base
    $blk([2, 'm:a'], 0, Address, [[[['expect.maxLength', { length: 2 }]], [['city', 0]]]])
    expect(currentEpoch()).toBeGreaterThan(epoch2)
    expect(ok(Client, 'abc')).toBe(false)
    expect(check()).toBeTypeOf('function')

    // a write on the shell is local to Client
    meta($f(Client, 'address', 'city')).set('expect.maxLength', { length: 10 })
    expect(ok(Client, 'abcdefgh')).toBe(true)
    expect(new Validator(Address).validate({ city: 'abc' }, true)).toBe(false)
  })

  it('a layer over an untracked (plain Map) base stays interpreted', () => {
    const Raw = {
      __is_atscript_annotated_type: true,
      type: { kind: '', tags: new Set(['string']), designType: 'string' },
      metadata: new Map<string, unknown>([['expect.maxLength', { length: 1 }]]),
    } as unknown as N
    const H = cls('H')
    $('object', H).prop('s', $().ref(Raw).$type)
    compileType(H)
    expect(compiledCheckFor(H, COMPILED_ENV)).toBeNull()
    expect(new Validator(H).validate({ s: 'ab' }, true)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'

import { defineAnnotatedType as $, type TAtscriptAnnotatedType } from '../runtime/annotated-type'
import { $alias, $blk, $f, $sh, appliedBlockModules } from '../runtime/blocks'
import { $ak } from '../runtime/layers'

/*
 * Blocks are data with a static rank (MODEL §3, §7); a path through a referrer gets the
 * referrer's own shells (§4); `as` copies (§8). The structures below are what the generated code
 * builds for the `.as` sources in the comments.
 */

$ak('test.list')

type N = TAtscriptAnnotatedType
function cls(id: string): N {
  return class {
    static __is_atscript_annotated_type = true
    static type = {}
    static metadata = new Map()
    static id = id
  } as unknown as N
}
const str = () => $().designType('string').tags('string')
const meta = (n: N) => n.metadata as unknown as Map<string, unknown>
const label = (n: N) => meta(n).get('meta.label')

/**
 * interface Address { city: string; zip?: string; next?: Address }
 * interface Client { address: Address; billing: Address }
 * interface Base { k?: string }   interface Child extends Base { own?: string }
 * interface A { x?: string }   interface B { x?: string }   interface U { u?: A | B }
 */
function world() {
  const Address = cls('Address')
  const Client = cls('Client')
  const Base = cls('Base')
  const Child = cls('Child')
  const A = cls('A')
  const B = cls('B')
  const U = cls('U')
  $('object', Address)
    .prop('city', str().annotate('test.list' as any, 'builder', true).$type)
    .prop('zip', str().optional().$type)
    .prop('next', $().ref(Address).optional().$type)
  $('object', Client)
    .prop('address', $().ref(Address).$type)
    .prop('billing', $().ref(Address).$type)
  $('object', Base).prop('k', str().optional().$type)
  $('object', Child).prop('k', $f(Base, 'k')).prop('own', str().optional().$type)
  $('object', A).prop('x', str().optional().$type)
  $('object', B).prop('x', str().optional().$type)
  $('object', U).prop(
    'u',
    $('union').item($().ref(A).$type).item($().ref(B).$type).optional().$type
  )
  return { Address, Client, Base, Child, A, B, U }
}

describe('shells (MODEL §4)', () => {
  it('a path override through a referrer is that referrer’s, at exactly that path', () => {
    const { Address, Client } = world()
    // annotate Client { @meta.label 'Home City' address.city  @meta.label 'Billing City' billing.city }
    $blk([1, 'app:client.as'], 0, Client, [
      [
        [['meta.label', 'Home City']],
        [
          ['address', 0],
          ['city', 2],
        ],
      ],
      [
        [['meta.label', 'Billing City']],
        [
          ['billing', 0],
          ['city', 2],
        ],
      ],
    ])
    const city = $f(Address, 'city')
    expect(label($f(Client, 'address', 'city'))).toBe('Home City')
    expect(label($f(Client, 'billing', 'city'))).toBe('Billing City')
    expect(label(city)).toBeUndefined()
    // only the path gets shells: the rest stays Address's nodes
    const addr = $f(Client, 'address')
    expect(addr.type).not.toBe(Address.type)
    expect($f(Client, 'address', 'zip')).toBe($f(Address, 'zip'))
    expect($f(Client, 'address', 'next')).toBe($f(Address, 'next'))
    expect($f(Client, 'address', 'next', 'city')).toBe(city)
    expect($f(Client, 'address', 'city').type).toBe(city.type)
    // a write on Address.city shows through the shells; a write on a shell is local
    meta(city).set('meta.description', 'd')
    expect(meta($f(Client, 'address', 'city')).get('meta.description')).toBe('d')
    meta($f(Client, 'billing', 'city')).set('meta.placeholder', 'p')
    expect(meta(city).has('meta.placeholder')).toBe(false)
    expect(meta($f(Client, 'address', 'city')).has('meta.placeholder')).toBe(false)
  })

  it('step kinds: 0 descends, 1 shells a referenced child, 2 gives the node a shell def first', () => {
    const { Base, Child, Address, Client } = world()
    const k = $f(Base, 'k')
    // annotate Child { @meta.label 'C' k }   (k: Base's node, held by Child's own def)
    $blk([1, 'app:c.as'], 0, Child, [[[['meta.label', 'C']], [['k', 1]]]])
    expect($f(Child, 'k')).not.toBe(k)
    expect(label($f(Child, 'k'))).toBe('C')
    expect(label(k)).toBeUndefined()
    expect($f(Base, 'k')).toBe(k)
    meta(k).set('meta.description', 'base')
    expect(meta($f(Child, 'k')).get('meta.description')).toBe('base')
    // deeper: address.next.city — every step below the referrer's own node is shelled
    const addressType = Address.type
    $blk([1, 'app:client.as'], 0, Client, [
      [
        [['meta.label', 'deep']],
        [
          ['address', 0],
          ['next', 2],
          ['city', 2],
        ],
      ],
    ])
    expect(Address.type).toBe(addressType)
    expect(label($f(Client, 'address', 'next', 'city'))).toBe('deep')
    expect(label($f(Client, 'address', 'city'))).toBeUndefined()
    expect(label($f(Address, 'next', 'city'))).toBeUndefined()
    expect($f(Client, 'address', 'next', 'next')).toBe($f(Address, 'next'))
  })

  it('shells are idempotent: blocks and $sh share them', () => {
    const { Client } = world()
    const path: Array<[string, 0 | 1 | 2]> = [
      ['address', 0],
      ['city', 2],
    ]
    $sh(Client, [path])
    const shell = $f(Client, 'address', 'city')
    const def = $f(Client, 'address').type
    $sh(Client, [path])
    $blk([1, 'm:a'], 0, Client, [[[['meta.label', 'a']], path]])
    $blk([1, 'm:b'], 0, Client, [[[['meta.description', 'b']], path]])
    expect($f(Client, 'address', 'city')).toBe(shell)
    expect($f(Client, 'address').type).toBe(def)
    expect(label(shell)).toBe('a')
    expect(meta(shell).get('meta.description')).toBe('b')
  })

  it('a union path writes every branch (MODEL §9 U4), as the referrer’s shells', () => {
    const { A, B, U } = world()
    // annotate U { @meta.label 'L' u.x }
    $blk([1, 'm:u'], 0, U, [
      [
        [['meta.label', 'L']],
        [
          ['u', 0],
          ['|0', 0],
          ['x', 2],
        ],
        [
          ['u', 0],
          ['|1', 0],
          ['x', 2],
        ],
      ],
    ])
    expect(label($f(U, 'u', '|0', 'x'))).toBe('L')
    expect(label($f(U, 'u', '|1', 'x'))).toBe('L')
    expect(label($f(A, 'x'))).toBeUndefined()
    expect(label($f(B, 'x'))).toBeUndefined()
  })
})

describe('annotate T as X (MODEL §8)', () => {
  it('X: T’s structure, a layer over T; its entries are below every block', () => {
    for (const order of ['entries first', 'block first']) {
      const { Address } = world()
      const X = cls('X')
      // annotate Address as X { @meta.label 'X' city }
      const asEntries = () => {
        $alias(X, Address)
        $blk(null, 0, X, [[[['meta.label', 'X']], [['city', 2]]]])
      }
      // annotate X { @meta.label 'block' city }   (another module)
      const block = () => $blk([2, 'm:x'], 0, X, [[[['meta.label', 'block']], [['city', 2]]]])
      if (order === 'entries first') {
        asEntries()
        block()
      } else {
        $alias(X, Address)
        block()
        $blk(null, 0, X, [[[['meta.label', 'X']], [['city', 2]]]])
      }
      expect(label($f(X, 'city'))).toBe('block')
      expect(label($f(Address, 'city'))).toBeUndefined()
      expect(X.type).not.toBe(Address.type)
      expect($f(X, 'zip')).toBe($f(Address, 'zip'))
      // a later block on Address reaches X unless X overrides the key
      $blk([3, 'm:t'], 0, Address, [
        [
          [
            ['meta.label', 'T'],
            ['meta.description', 'T'],
          ],
          [['city', 0]],
        ],
      ])
      expect(label($f(X, 'city'))).toBe('block')
      expect(meta($f(X, 'city')).get('meta.description')).toBe('T')
    }
  })
})

describe('ranks (MODEL §7): same-key writes do not depend on load order', () => {
  /** Blocks of 4 modules on Address (some through Client), replace and append keys. */
  const blocks = (w: ReturnType<typeof world>): Array<() => void> => [
    () =>
      $blk([1, 'p:a.as'], 0, w.Address, [
        [
          [
            ['meta.label', 'a'],
            ['test.list', 'a1', 1],
            ['test.list', 'a2', 1],
          ],
          [['city', 0]],
        ],
        [[['meta.description', 'a']], [['zip', 0]]],
      ]),
    () =>
      $blk([1, 'p:b.as'], 0, w.Address, [
        [
          [
            ['meta.label', 'b'],
            ['test.list', 'b', 1],
          ],
          [['city', 0]],
        ],
      ]),
    () =>
      $blk([2, 'p:a.as'], 1, w.Client, [
        [
          [
            ['meta.label', 'c'],
            ['test.list', 'c', 1],
          ],
          [
            ['address', 0],
            ['city', 2],
          ],
        ],
        [
          [['meta.description', 'c']],
          [
            ['address', 0],
            ['zip', 2],
          ],
        ],
      ]),
    () =>
      $blk([0, 'p:z.as'], 0, w.Address, [
        [
          [
            ['meta.label', 'z'],
            ['meta.description', 'z'],
            ['test.list', 'z', 1],
          ],
          [['city', 0]],
        ],
        [[['meta.label', 'z2']], [['city', 0]]],
      ]),
  ]
  const snapshot = (w: ReturnType<typeof world>) =>
    JSON.stringify(
      [
        $f(w.Address, 'city'),
        $f(w.Address, 'zip'),
        $f(w.Client, 'address', 'city'),
        $f(w.Client, 'address', 'zip'),
        $f(w.Client, 'billing', 'city'),
      ].map(n => [...meta(n)])
    )
  const permutations = <T>(xs: T[]): T[][] =>
    xs.length <= 1
      ? [xs]
      : xs.flatMap((x, i) =>
          permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map(p => [x, ...p])
        )

  it('every permutation of 4 block modules gives the same metadata; re-applying changes nothing', () => {
    const results = new Set<string>()
    for (const order of permutations([0, 1, 2, 3])) {
      const w = world()
      const bs = blocks(w)
      for (const i of order) {
        bs[i]()
      }
      results.add(snapshot(w))
      for (const i of order) {
        bs[i]()
      }
      results.add(snapshot(w))
    }
    expect(results.size).toBe(1)
    const w = world()
    for (const b of blocks(w)) {
      b()
    }
    expect(label($f(w.Address, 'city'))).toBe('b')
    expect(meta($f(w.Address, 'city')).get('test.list')).toEqual(['builder', 'z', 'a1', 'a2', 'b'])
    expect(label($f(w.Client, 'address', 'city'))).toBe('c')
    expect(meta($f(w.Client, 'address', 'city')).get('test.list')).toEqual([
      'builder',
      'z',
      'a1',
      'a2',
      'b',
      'c',
    ])
    expect(meta($f(w.Client, 'address', 'zip')).get('meta.description')).toBe('c')
    expect(meta($f(w.Address, 'zip')).get('meta.description')).toBe('a')
  })

  it('a raw write is local and a later block on the key overwrites it, whatever its rank', () => {
    const { Address } = world()
    const city = $f(Address, 'city')
    const lo = () => $blk([1, 'm:lo'], 0, Address, [[[['meta.label', 'lo']], [['city', 0]]]])
    const hi = () => $blk([2, 'm:hi'], 0, Address, [[[['meta.label', 'hi']], [['city', 0]]]])
    hi()
    meta(city).set('meta.label', 'raw')
    expect(label(city)).toBe('raw')
    lo()
    expect(label(city)).toBe('lo')
    hi()
    expect(label(city)).toBe('hi')
    lo()
    expect(label(city)).toBe('hi')
    // append keys: what a raw write left is kept, the block's part goes after it
    $blk([1, 'm:lo'], 1, Address, [[[['test.list', 'x', 1]], [['city', 0]]]])
    meta(city).set('test.list', ['raw'])
    $blk([0, 'm:lower'], 0, Address, [[[['test.list', 'y', 1]], [['city', 0]]]])
    expect(meta(city).get('test.list')).toEqual(['raw', 'y'])
  })

  it('records the module of every applied block', () => {
    const { Address } = world()
    $blk([4, 'q:applied.as'], 0, Address, [[[['meta.label', 'q']], [['zip', 0]]]])
    expect(appliedBlockModules().has('q:applied.as')).toBe(true)
  })
})

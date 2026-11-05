import path from 'path'

import { beforeAll, describe, expect, it } from 'vitest'

import { detectDiscriminator } from '../runtime/discriminator'
import { normalizeForType } from '../runtime/normalize'
import { deserializeAnnotatedType, serializeAnnotatedType } from '../runtime/serialize'
import { Validator } from '../runtime/validator'
import { prepareFixtures } from '../test-utils'

const rootDir = path.join(__dirname, 'fixtures')

describe('normalizeForType', () => {
  let m: Record<string, any>

  beforeAll(async () => {
    await prepareFixtures({ rootDir, entries: ['normalize.as'] })
    m = await import(path.join(rootDir, 'normalize.as.js'))
  })

  const user = (over: Record<string, unknown> = {}) => ({
    email: 'a@b.co',
    name: 'Ann',
    status: 'active',
    aliases: [],
    pair: ['c@d.co', ' x '],
    address: { city: 'Oslo', zip: ' 0150 ' },
    labels: {},
    slug: 'x',
    plain: ' keep ',
    count: 1,
    ownerEmail: 'o@b.co',
    ...over,
  })

  it('carries the annotations to the runtime metadata', () => {
    expect(m.Email.metadata.get('normalize.trim')).toBe(true)
    expect(m.Email.metadata.get('normalize.lowercase')).toBe(true)
    expect(m.Code.metadata.get('normalize.uppercase')).toBe(true)
    expect(m.User.type.props.get('name').metadata.get('normalize.trim')).toBe(true)
    // (string.trimmed: the primitive's annotation)
    expect(m.Slug.metadata.get('normalize.trim')).toBe(true)
  })

  it('normalizes a scalar type alias', () => {
    expect(normalizeForType(m.Email, '  Ann@Example.COM ')).toBe('ann@example.com')
    expect(normalizeForType(m.Code, 'nl')).toBe('NL')
    expect(normalizeForType(m.Slug, '  a-b  ')).toBe('a-b')
  })

  it('normalizes props, inherited alias annotations, array items, tuples, records and nested objects', () => {
    const input = user({
      email: ' A@B.CO ',
      name: '  Ann ',
      nickname: '  annie  ',
      aliases: [' X@Y.CO', 'z@y.co'],
      pair: [' C@D.CO ', ' x '],
      address: { city: '  Oslo ', zip: ' 0150 ' },
      labels: { home: ' H@B.CO ' },
      slug: ' s ',
      ownerEmail: ' O@B.CO ',
    })
    const snapshot = structuredClone(input)
    expect(normalizeForType(m.User, input)).toEqual({
      email: 'a@b.co',
      name: 'Ann',
      nickname: 'annie',
      status: 'active',
      aliases: ['x@y.co', 'z@y.co'],
      pair: ['c@d.co', ' x '],
      address: { city: 'Oslo', zip: ' 0150 ' },
      labels: { home: 'h@b.co' },
      slug: 's',
      plain: ' keep ',
      count: 1,
      // (a chain reference `User.email` inherits the field's normalizers)
      ownerEmail: 'o@b.co',
    })
    // (never mutates the input)
    expect(input).toEqual(snapshot)
  })

  it('returns the same object when nothing changes (copy-on-change)', () => {
    const input = user()
    expect(normalizeForType(m.User, input)).toBe(input)
    // (untouched sub-objects are shared, not copied)
    const address = { city: 'Oslo', zip: '1' }
    expect((normalizeForType(m.User, user({ name: ' x ', address })) as any).address).toBe(address)
  })

  it('applies a union’s normalizers to its string branches (nullable, literal unions)', () => {
    expect((normalizeForType(m.User, user({ nickname: null })) as any).nickname).toBeNull()
    // `@normalize.lowercase status: 'active' | 'blocked'`: 'ACTIVE' becomes the literal
    expect((normalizeForType(m.User, user({ status: 'ACTIVE' })) as any).status).toBe('active')
    // (no literal matches: left as it is, for the validator to report)
    expect((normalizeForType(m.User, user({ status: 'GONE' })) as any).status).toBe('GONE')
  })

  it('leaves non-strings and values of the wrong kind untouched', () => {
    expect(normalizeForType(m.Email, 42)).toBe(42)
    expect(normalizeForType(m.Email, null)).toBeNull()
    expect(normalizeForType(m.Email, undefined)).toBeUndefined()
    expect(normalizeForType(m.User, 'not an object')).toBe('not an object')
    const odd = user({ aliases: 'nope', count: ' 1 ' })
    expect(normalizeForType(m.User, odd)).toBe(odd)
  })

  it('keeps unknown props as they are', () => {
    expect(normalizeForType(m.User, user({ extra: ' x ', name: ' A ' }))).toMatchObject({
      extra: ' x ',
      name: 'A',
    })
  })

  describe('unions', () => {
    it('a discriminated object union uses the branch its discriminator names', () => {
      expect(normalizeForType(m.Pet, { kind: 'cat', name: ' Tom ' })).toEqual({
        kind: 'cat',
        name: 'Tom',
      })
      expect(normalizeForType(m.Pet, { kind: 'dog', name: ' rex ' })).toEqual({
        kind: 'dog',
        name: ' REX ',
      })
    })

    it('a literal branch takes only its literal', () => {
      expect(normalizeForType(m.EmailOrNone, ' A@B.CO ')).toBe('a@b.co')
      expect(normalizeForType(m.EmailOrNone, 'none')).toBe('none')
    })

    it('branches that normalize differently leave the value untouched (ambiguous)', () => {
      expect(normalizeForType(m.EmailOrCode, ' Ab ')).toBe(' Ab ')
    })

    it('object branches that agree normalize; branches that disagree leave it untouched', () => {
      expect(normalizeForType(m.SameObjects, { a: ' x ' })).toEqual({ a: 'x' })
      const value = { a: ' x ' }
      expect(normalizeForType(m.DifferentObjects, value)).toBe(value)
    })
  })

  it('an `annotate … as` copy normalizes; its target does not', () => {
    expect(normalizeForType(m.TrimmedPlain, { a: ' x ' })).toEqual({ a: 'x' })
    const value = { a: ' x ' }
    expect(normalizeForType(m.Plain, value)).toBe(value)
  })

  it('normalizers survive serialization (a client normalizes with a deserialized type)', () => {
    const type = deserializeAnnotatedType(serializeAnnotatedType(m.User))
    expect(normalizeForType(type, user({ email: ' A@B.CO ', aliases: [' X@Y.CO'] }))).toMatchObject(
      { email: 'a@b.co', aliases: ['x@y.co'] }
    )
  })

  it('the validator itself never normalizes (validate → normalize is the caller’s job)', () => {
    const value = user({ name: ' Ann ', email: ' A@B.CO ' })
    const validator = new Validator(m.User, { unknownProps: 'ignore' })
    expect(validator.validate(value, true)).toBe(true)
    expect(value.name).toBe(' Ann ')
    expect(value.email).toBe(' A@B.CO ')
  })

  describe('hardening', () => {
    it('a discriminator value named like an Object.prototype key picks no branch (no throw)', () => {
      const pet = m.Pet
      const values = ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf'].map(
        kind => ({ kind, name: ' x ' })
      )
      for (const value of values) {
        // (no branch takes it: left as it is, no throw)
        expect(normalizeForType(pet, value)).toBe(value)
      }
      // (the public lookup table has no prototype either)
      const disc = detectDiscriminator(m.Pet.type.items)!
      expect(disc.indexMapping.constructor).toBeUndefined()
      expect(disc.indexMapping.cat).toBe(0)
    })

    it('an own `__proto__` key stays an own key (never the output’s prototype)', () => {
      const input = JSON.parse('{"__proto__": {"role": "admin"}, "name": " x "}')
      const out = normalizeForType(m.Address, { ...input, city: ' Oslo ', zip: '1' }) as any
      expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
      expect(out.role).toBeUndefined()
      expect(Object.keys(out)).toContain('__proto__')
      expect(out.city).toBe('Oslo')
      // (so the validator still sees — and rejects — the unknown key)
      expect(new Validator(m.Address).validate(out, true)).toBe(false)
    })

    it('a recursive union without a discriminator is linear, with or without normalizers', () => {
      const mk = (d: number, key: string, text: string): any =>
        d === 0
          ? { [key]: text, children: [] }
          : { [key]: text, children: [mk(d - 1, key, text), mk(0, key, text)] }
      // (depth 24: about 2^24 branch walks before; generous bound, a linear walk takes ~1 ms)
      const plain = mk(24, 'a', 'x')
      let start = performance.now()
      expect(normalizeForType(m.Tree, plain)).toBe(plain)
      const trimmed = mk(24, 'b', ' x ')
      expect((normalizeForType(m.TrimTree, trimmed) as any).children[0].children[1].b).toBe('x')
      expect(performance.now() - start).toBeLessThan(1000)
      // (a deeper value still scales linearly)
      start = performance.now()
      normalizeForType(m.TrimTree, mk(150, 'a', ' x '))
      expect(performance.now() - start).toBeLessThan(1000)
    })

    it('when union branches disagree, the one whose validator accepts its result wins', () => {
      // `contact: Email | Digits`: only the Email result ('a@b.co') validates
      expect(normalizeForType(m.ContactForm, { contact: ' A@B.CO ' })).toEqual({
        contact: 'a@b.co',
      })
      // (digits: both branches give '123' — nothing to settle)
      expect(normalizeForType(m.ContactForm, { contact: '123' })).toEqual({ contact: '123' })
    })

    it('non-plain objects are left as they are', () => {
      const date = new Date()
      expect(normalizeForType(m.Holder, date)).toBe(date)
      const buffer = Buffer.from(' x ')
      expect(normalizeForType(m.Holder, buffer)).toBe(buffer)
      class Box {
        s = ' x '
      }
      const box = new Box()
      expect(normalizeForType(m.Holder, box)).toBe(box)
      const when = new Date()
      const out = normalizeForType(m.Holder, { s: ' x ', when }) as any
      expect(out).toEqual({ s: 'x', when })
      expect(out.when).toBe(when)
    })

    it('an object whose literal prop holds another value is left as it is', () => {
      const value = { kind: 'dog', name: ' x ' }
      expect(normalizeForType(m.Cat, value)).toBe(value)
    })

    it('sees normalizers added at runtime (the cached answer is dropped on a metadata write)', () => {
      const value = { a: ' x ' }
      expect(normalizeForType(m.Untrimmed, value)).toBe(value)
      const prop = m.Untrimmed.type.props.get('a')
      prop.metadata.set('normalize.trim', true)
      try {
        expect(normalizeForType(m.Untrimmed, value)).toEqual({ a: 'x' })
      } finally {
        prop.metadata.delete('normalize.trim')
      }
      expect(normalizeForType(m.Untrimmed, value)).toBe(value)
    })
  })
})

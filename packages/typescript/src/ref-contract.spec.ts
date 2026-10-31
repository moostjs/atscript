import path from 'path'

import { beforeAll, describe, it, expect } from 'vitest'

import {
  defineAnnotatedType,
  type TAtscriptAnnotatedType,
  type TAtscriptTypeArray,
  type TAtscriptTypeObject,
} from './runtime/annotated-type'
import {
  serializeAnnotatedType,
  deserializeAnnotatedType,
  type TSerializedTypeObject,
} from './runtime/serialize'
import { prepareFixtures } from './test-utils'

const fixturesDir = path.join(path.dirname(import.meta.url.slice(7)), '../test/fixtures')

const prop = (t: TAtscriptAnnotatedType, name: string) =>
  (t.type as TAtscriptTypeObject<string>).props.get(name)!

// Runtime `ref` contract: EVERY reference node records `ref` — eager (same-file) and lazy
// (imported) alike. `field` is the chain path, or '' for a plain reference.
describe('runtime ref contract (eager and lazy refTo record the same shape)', () => {
  beforeAll(() =>
    prepareFixtures({
      rootDir: fixturesDir,
      entries: ['ref-contract.as', 'ref-contract-common.as'],
    })
  )

  it('eager plain ref (same-file nav prop) exposes ref with field ""', async () => {
    const { RcOrder, RcAddress } = await import('../test/fixtures/ref-contract.as')
    const address = prop(RcOrder, 'address')
    expect(address.ref).toBeDefined()
    expect(address.ref!.field).toBe('')
    expect(address.ref!.type()).toBe(RcAddress)
  })

  it('eager plain ref as an array element exposes ref on `of`', async () => {
    const { RcOrder, RcLine } = await import('../test/fixtures/ref-contract.as')
    const lines = prop(RcOrder, 'lines')
    expect(lines.type.kind).toBe('array')
    expect(lines.ref).toBeUndefined()
    const of = (lines.type as TAtscriptTypeArray).of
    expect(of.ref!.type()).toBe(RcLine)
    expect(of.ref!.field).toBe('')
  })

  it('eager chain ref exposes ref with the chain as field', async () => {
    const { RcOrder, RcAddress } = await import('../test/fixtures/ref-contract.as')
    const city = prop(RcOrder, 'city')
    expect(city.ref!.field).toBe('city')
    expect(city.ref!.type()).toBe(RcAddress)
    expect(city.type.kind).toBe('')
  })

  it('lazy plain and lazy chain refs keep their shape (parity with eager)', async () => {
    const { RcOrder } = await import('../test/fixtures/ref-contract.as')
    const { RcCustomer } = await import('../test/fixtures/ref-contract-common.as')
    const customer = prop(RcOrder, 'customer')
    expect(customer.ref!.field).toBe('')
    expect(customer.ref!.type()).toBe(RcCustomer)
    const customerId = prop(RcOrder, 'customerId')
    expect(customerId.ref!.field).toBe('id')
    expect(customerId.ref!.type()).toBe(RcCustomer)
  })

  it('does not copy ref onto non-reference props', async () => {
    const { RcOrder, RcAddress } = await import('../test/fixtures/ref-contract.as')
    expect(prop(RcOrder, 'id').ref).toBeUndefined()
    expect(prop(RcAddress, 'city').ref).toBeUndefined()
    expect(RcOrder.ref).toBeUndefined()
    expect(RcAddress.ref).toBeUndefined()
  })

  it('aliases expose ref to their target (eager plain, eager chain, lazy plain)', async () => {
    const { RcLocalAlias, RcChainAlias, RcCustomerAlias, RcAddress } =
      await import('../test/fixtures/ref-contract.as')
    const { RcCustomer } = await import('../test/fixtures/ref-contract-common.as')

    // MODEL §10 D3: a bare plain alias IS its target (no reference node, no ref of its own)
    expect(RcLocalAlias).toBe(RcAddress)

    expect(RcChainAlias.ref!.type()).toBe(RcAddress)
    expect(RcChainAlias.ref!.field).toBe('city')

    expect(RcCustomerAlias.type.kind).toBe('object')
    // MODEL §10 D3: a bare plain alias IS its target
    expect(RcCustomerAlias).toBe(RcCustomer)
  })

  it("an object alias's props are its target's (with their refs)", async () => {
    const { RcOrderAlias, RcOrder } = await import('../test/fixtures/ref-contract.as')
    // MODEL §10 D3: a bare plain alias IS its target
    expect(RcOrderAlias).toBe(RcOrder)
    for (const name of ['address', 'city', 'customer', 'customerId']) {
      const shared = prop(RcOrderAlias, name)
      const original = prop(RcOrder, name)
      expect(shared).toBe(original)
      expect(shared.ref).toBe(original.ref)
    }
  })

  it('mutating annotate through a ref boundary keeps ref on the cloned prop', async () => {
    const { RcShipment, RcLine } = await import('../test/fixtures/ref-contract.as')
    const { RcCustomer } = await import('../test/fixtures/ref-contract-common.as')
    const line = prop(RcShipment, 'line')
    expect(prop(line, 'sku').metadata.get('meta.label')).toBe('SKU')
    // the clone did not leak the annotation onto the target
    expect(prop(RcLine, 'sku').metadata.get('meta.label')).toBeUndefined()
    expect(line.ref!.type()).toBe(RcLine)
    expect(line.ref!.field).toBe('')

    const customer = prop(RcShipment, 'customer')
    expect(prop(customer, 'name').metadata.get('meta.label')).toBe('Customer name')
    expect(customer.ref!.type()).toBe(RcCustomer)
    expect(customer.ref!.field).toBe('')
  })

  it('serializes same-file and imported plain refs identically at refDepth > 0', async () => {
    const { RcOrder } = await import('../test/fixtures/ref-contract.as')
    const serialized = serializeAnnotatedType(RcOrder, { refDepth: 1 })
    const props = (serialized.type as TSerializedTypeObject).props

    // same-file nav prop now carries ref, exactly like the imported one always did
    expect(props.address.ref).toBeDefined()
    expect(props.address.ref!.field).toBe('')
    expect(props.customer.ref).toBeDefined()
    expect(props.customer.ref!.field).toBe('')

    const restored = deserializeAnnotatedType(JSON.parse(JSON.stringify(serialized)))
    expect(prop(restored, 'address').ref!.field).toBe('')
    expect(prop(restored, 'address').ref!.type().id).toBe('RcAddress')

    // refDepth 0 (default) still strips every ref
    const stripped = (serializeAnnotatedType(RcOrder).type as TSerializedTypeObject).props
    expect(stripped.address.ref).toBeUndefined()
    expect(stripped.customer.ref).toBeUndefined()
  })
})

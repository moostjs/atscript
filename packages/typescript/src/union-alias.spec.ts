import path from 'path'

import { beforeAll, describe, it, expect } from 'vitest'

import {
  type TAtscriptAnnotatedType,
  type TAtscriptTypeComplex,
  type TAtscriptTypeObject,
  type TAtscriptTypeFinal,
} from './runtime/annotated-type'
import { flattenAnnotatedType } from './runtime/flatten'
import { buildJsonSchema } from './runtime/json-schema'
import { serializeAnnotatedType, deserializeAnnotatedType } from './runtime/serialize'
import { prepareFixtures } from './test-utils'

const fixturesDir = path.join(path.dirname(import.meta.url.slice(7)), '../test/fixtures')

const asComplex = (t: TAtscriptAnnotatedType) => t.type as TAtscriptTypeComplex
const asObject = (t: TAtscriptAnnotatedType) => t.type as TAtscriptTypeObject<string>
const literalValues = (t: TAtscriptAnnotatedType) =>
  asComplex(t).items.map(i => (i.type as TAtscriptTypeFinal).value)

// Regression for the "type alias of a union generates an empty runtime type" bug:
// refTo() used to reassign this.$type to a detached node instead of patching the named
// `base` class in place, so `export type X = Y` left X with type = {} / kind "".
describe('type alias runtime type (refTo in-place base patch)', () => {
  beforeAll(() =>
    prepareFixtures({
      rootDir: fixturesDir,
      entries: ['union-alias.as', 'union-alias-common.as'],
    })
  )

  it('cross-file alias of a string-literal union resolves to a union (lazy refTo)', async () => {
    const { DealerStatus } = await import('../test/fixtures/union-alias.as')
    expect(DealerStatus.type.kind).toBe('union')
    expect(literalValues(DealerStatus)).toEqual(['ACTIVE', 'INACTIVE'])
    // alias keeps its own id, not the target's
    expect(DealerStatus.id).toBe('DealerStatus')
  })

  it('same-file alias of a union resolves to a union (eager refTo)', async () => {
    const { LocalAlias } = await import('../test/fixtures/union-alias.as')
    expect(LocalAlias.type.kind).toBe('union')
    expect(literalValues(LocalAlias)).toEqual(['LO', 'HI'])
    expect(LocalAlias.id).toBe('LocalAlias')
  })

  it('a field typed as a union alias flattens to a union (value-help restored)', async () => {
    const { Dealer } = await import('../test/fixtures/union-alias.as')
    const flat = flattenAnnotatedType(Dealer, { excludePhantomTypes: true })
    // cross-file alias, same-file alias, and the inline-union parity baseline all match
    expect(flat.get('status')!.type.kind).toBe('union')
    expect(flat.get('priority')!.type.kind).toBe('union')
    expect(flat.get('inlineStatus')!.type.kind).toBe('union')
  })

  it('survives serialize -> deserialize as a union with its members intact', async () => {
    const { Dealer } = await import('../test/fixtures/union-alias.as')
    const roundTripped = deserializeAnnotatedType(
      JSON.parse(JSON.stringify(serializeAnnotatedType(Dealer)))
    )
    // the raw round-tripped prop is a clean 2-member union
    const statusProp = asObject(roundTripped).props.get('status')!
    expect(statusProp.type.kind).toBe('union')
    expect(literalValues(statusProp)).toEqual(['ACTIVE', 'INACTIVE'])
    // and the flattened view exposes it as a union — same as an inline union (parity),
    // which is what drives literal value-help downstream
    const flat = flattenAnnotatedType(roundTripped, { excludePhantomTypes: true })
    expect(flat.get('status')!.type.kind).toBe('union')
    expect(flat.get('status')!.type.kind).toBe(flat.get('inlineStatus')!.type.kind)
  })

  it('object alias resolves to an object, keeps its own id, and is cloned (no leak)', async () => {
    const { ProfileAlias } = await import('../test/fixtures/union-alias.as')
    const { Profile } = await import('../test/fixtures/union-alias-common.as')

    expect(ProfileAlias.type.kind).toBe('object')
    expect([...asObject(ProfileAlias).props.keys()]).toEqual(['name', 'age'])

    // distinct ids -> distinct json-schema $defs (id must NOT be clobbered to the target's)
    expect(ProfileAlias.id).toBe('ProfileAlias')
    expect(Profile.id).toBe('Profile')

    // type-level annotations are preserved on the alias...
    expect(asObject(ProfileAlias).props.get('name')!.metadata.get('meta.label')).toBe('Full Name')

    // ...but the alias does NOT share the target's nodes/maps by reference, so mutating
    // ad-hoc annotations on the alias cannot leak onto the referenced type.
    expect(ProfileAlias.type).not.toBe(Profile.type)
    expect(asObject(ProfileAlias).props.get('name')).not.toBe(asObject(Profile).props.get('name'))
    expect(asObject(ProfileAlias).props.get('name')!.metadata).not.toBe(
      asObject(Profile).props.get('name')!.metadata
    )
  })

  it('object alias builds a non-empty json schema', async () => {
    const { ProfileAlias } = await import('../test/fixtures/union-alias.as')
    const schema = JSON.stringify(buildJsonSchema(ProfileAlias))
    expect(schema).toContain('name')
    expect(schema).toContain('age')
    expect(schema).not.toBe('{}')
  })
})

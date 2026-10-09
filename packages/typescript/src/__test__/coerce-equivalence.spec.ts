import path from 'path'

import { beforeAll, describe, expect, it } from 'vitest'

import {
  defineAnnotatedType as $,
  type TAtscriptAnnotatedType,
  type TAtscriptTypeObject,
} from '../runtime/annotated-type'
import { coerceForType } from '../runtime/coerce'
import { forAnnotatedType } from '../runtime/traverse'
import { prepareFixtures } from '../test-utils'

// ── reference: the previous handler-object implementation, verbatim ─────────

const NO_MATCH = Symbol('ref.no-match')

function refCoerceForType(def: TAtscriptAnnotatedType, value: unknown): unknown {
  const result = refCoerce(def, value)
  return result === NO_MATCH ? value : result
}

function refCoerce(def: TAtscriptAnnotatedType, value: unknown): unknown {
  if (value === undefined || value === null) {
    return def.optional === true ? value : NO_MATCH
  }
  return forAnnotatedType<unknown>(def, {
    final: d => {
      const result = refScalar(d.type.designType, value)
      if (result !== NO_MATCH && d.type.value !== undefined && result !== d.type.value) {
        return NO_MATCH
      }
      return result
    },
    phantom: () => value,
    object: d => {
      if (!isPlainObject(value)) {
        return NO_MATCH
      }
      return refProps(d, value)
    },
    array: d => (Array.isArray(value) ? refItems(value, d.type.of) : NO_MATCH),
    tuple: d =>
      Array.isArray(value) && value.length === d.type.items.length
        ? refItems(value, undefined, d.type.items)
        : NO_MATCH,
    union: d => {
      for (const item of d.type.items) {
        const result = refCoerce(item, value)
        if (result !== NO_MATCH) {
          return result
        }
      }
      return NO_MATCH
    },
    intersection: d => {
      let current: unknown = value
      for (const item of d.type.items) {
        const result = refCoerce(item, current)
        if (result === NO_MATCH) {
          return NO_MATCH
        }
        current = result
      }
      return current
    },
  })
}

function refScalar(designType: string, value: unknown): unknown {
  switch (designType) {
    case 'string':
    case 'decimal': {
      return typeof value === 'string' ? value : NO_MATCH
    }
    case 'number': {
      if (typeof value === 'number') {
        return value
      }
      if (typeof value === 'string') {
        const trimmed = value.trim()
        if (trimmed.length > 0) {
          const parsed = Number(trimmed)
          if (Number.isFinite(parsed)) {
            return parsed
          }
        }
      }
      return NO_MATCH
    }
    case 'boolean': {
      if (typeof value === 'boolean') {
        return value
      }
      if (value === 'true' || value === '1') {
        return true
      }
      if (value === 'false' || value === '0') {
        return false
      }
      return NO_MATCH
    }
    case 'object': {
      return typeof value === 'object' ? value : NO_MATCH
    }
    case 'any':
    case 'phantom': {
      return value
    }
    default: {
      return NO_MATCH
    }
  }
}

function refProps(
  def: TAtscriptAnnotatedType<TAtscriptTypeObject<string>>,
  value: Record<string, unknown>
): unknown {
  const keys = Object.keys(value)
  let out: Record<string, unknown> | undefined
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    const input = value[key]
    let propDef = def.type.props.get(key)
    if (!propDef) {
      for (const { pattern, def: patternDef } of def.type.propsPatterns) {
        if (pattern.test(key)) {
          propDef = patternDef
          break
        }
      }
    }
    let coerced = input
    if (propDef) {
      const result = refCoerce(propDef, input)
      if (result !== NO_MATCH) {
        coerced = result
      }
    }
    if (out) {
      out[key] = coerced
    } else if (coerced !== input) {
      out = {}
      for (let j = 0; j < i; j++) {
        out[keys[j]] = value[keys[j]]
      }
      out[key] = coerced
    }
  }
  return out ?? value
}

function refItems(
  value: unknown[],
  of: TAtscriptAnnotatedType | undefined,
  items?: TAtscriptAnnotatedType[]
): unknown {
  let out: unknown[] | undefined
  for (let i = 0; i < value.length; i++) {
    const input = value[i]
    const result = refCoerce(of ?? items![i], input)
    const coerced = result === NO_MATCH ? input : result
    if (out) {
      out.push(coerced)
    } else if (coerced !== input) {
      out = value.slice(0, i)
      out.push(coerced)
    }
  }
  return out ?? value
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const proto = Object.getPrototypeOf(value) as object | null
  return proto === Object.prototype || proto === null
}

// ── fixtures & inputs ───────────────────────────────────────────────────────

const prim = (designType: any, value?: string | number | boolean) => {
  const h = $().designType(designType)
  if (value !== undefined) {
    h.value(value)
  }
  return h
}

function makeTypes(): TAtscriptAnnotatedType[] {
  const inner = $('object')
    .prop('n', prim('number').$type)
    .prop('b', prim('boolean').optional().$type)
  const union = $('union')
    .item(prim('string', 'a').$type)
    .item(prim('number', 7).$type)
    .item(prim('boolean').$type).$type
  const tuple = $('tuple').item(prim('number').$type).item(prim('boolean').$type).$type
  const inter = $('intersection')
    .item(inner.$type)
    .item($('object').prop('s', prim('string').$type).$type).$type
  return [
    $('object')
      .prop('limit', prim('number').optional().$type)
      .prop('flag', prim('boolean').$type)
      .prop('q', prim('string').$type)
      .prop('dec', prim('decimal').$type)
      .prop('any', prim('any').$type)
      .prop('ph', prim('phantom').$type)
      .prop('obj', prim('object').$type)
      .prop('nul', prim('null').$type)
      .prop('nested', inner.$type)
      .prop('list', $('array').of(prim('number').$type).$type)
      .prop('u', union)
      .prop('t', tuple)
      .prop('i', inter)
      .propPattern(/^n_/, prim('number').$type).$type,
    union,
    tuple,
    inter,
    $('array').of(union).$type,
  ]
}

const LEAVES: unknown[] = [
  '42',
  ' 42 ',
  '',
  '  ',
  'abc',
  '1e3',
  'Infinity',
  'NaN',
  '0x10',
  'true',
  'false',
  '1',
  '0',
  'a',
  '7',
  42,
  7,
  0,
  true,
  false,
  null,
  undefined,
  [],
  ['1', '2'],
  ['1', 'true'],
  {},
  { n: '1' },
  { n: '1', b: 'true', s: 'x' },
  Object.create(null),
  new Date(0),
]

function rng(seed: number) {
  // mulberry32 — the int32 / uint32 coercions are intentional
  // oxlint-disable unicorn/prefer-math-trunc
  return () => {
    seed = (seed + 0x6d_2b_79_f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
  // oxlint-enable unicorn/prefer-math-trunc
}

function randomInput(r: () => number, depth = 0): unknown {
  const p = r()
  if (depth > 2 || p < 0.6) {
    return LEAVES[Math.floor(r() * LEAVES.length)]
  }
  if (p < 0.8) {
    return Array.from({ length: Math.floor(r() * 4) }, () => randomInput(r, depth + 1))
  }
  const keys = ['limit', 'flag', 'q', 'dec', 'any', 'ph', 'obj', 'nul', 'nested', 'list', 'u', 't']
  const out: Record<string, unknown> = {}
  for (const k of [...keys, 'i', 'n_x', 'zz']) {
    if (r() < 0.6) {
      out[k] = randomInput(r, depth + 1)
    }
  }
  return out
}

function same(def: TAtscriptAnnotatedType, input: unknown) {
  const a = coerceForType(def, input)
  const b = refCoerceForType(def, input)
  expect(a).toEqual(b)
  // copy-on-change identity must match too
  expect(a === input).toBe(b === input)
}

describe('coerceForType — switch dispatch matches the previous implementation', () => {
  it('builder types × randomized inputs', () => {
    const r = rng(11)
    const types = makeTypes()
    for (let i = 0; i < 3000; i++) {
      const input = randomInput(r)
      for (const t of types) {
        same(t, input)
      }
    }
  })

  it('unknown kinds still throw', () => {
    const bad = { __is_atscript_annotated_type: true, type: { kind: 'weird' }, metadata: new Map() }
    expect(() => coerceForType(bad as any, '1')).toThrow('Unknown type kind "weird"')
    expect(() => refCoerceForType(bad as any, '1')).toThrow('Unknown type kind "weird"')
  })

  describe('generated types', () => {
    let gen: Record<string, TAtscriptAnnotatedType>
    beforeAll(async () => {
      const rootDir = path.join(__dirname, 'fixtures')
      await prepareFixtures({ rootDir, entries: ['coerce.as', 'date-primitives.as'] })
      gen = {
        ...(await import(path.join(rootDir, 'coerce.as.js'))),
        ...(await import(path.join(rootDir, 'date-primitives.as.js'))),
      }
    })

    it('randomized inputs', () => {
      const r = rng(12)
      const types = Object.values(gen).filter(t => t && (t as any).__is_atscript_annotated_type)
      expect(types.length).toBeGreaterThan(4)
      for (let i = 0; i < 2000; i++) {
        const input = randomInput(r)
        for (const t of types) {
          same(t, input)
        }
      }
      same(gen.SearchQuery, {
        offset: '0',
        limit: '50',
        active: 'true',
        term: 'x',
        price: '1.5',
        ids: ['1', '2'],
        nested: { depth: '3' },
      })
    })
  })
})

import Ajv from 'ajv'

import type { TAtscriptAnnotatedType } from '../runtime/annotated-type'
import { buildJsonSchema } from '../runtime/json-schema'
import { Validator } from '../runtime/validator'
import { rng } from '../test-utils'

/*
 * JSON schemas checked against the validator: a JSON value passes a type's JSON schema (runtime
 * `buildJsonSchema` and the bundled `toJsonSchema()`, compiled by ajv 8) exactly when the
 * validator accepts it with `unknownProps: 'ignore'` (a schema allows keys it does not list).
 * The differences JSON Schema cannot express are listed in `ALLOWED` (and documented in
 * `json-schema.md`).
 */

/** ajv compiles patterns with the `u` flag; `nonUnicode` without (patterns written without `u`). */
const ajv = new Ajv({ strict: false, validateFormats: false })
const ajvNonUnicode = new Ajv({ strict: false, validateFormats: false, unicodeRegExp: false })

/** A validator ignoring `@expect.array.uniqueItems` (see {@link ALLOWED}). */
class NoUniqueValidator extends Validator<TAtscriptAnnotatedType> {
  protected override validateArrayConstraints(
    metadata: Map<string, unknown>,
    value: any[],
    of?: TAtscriptAnnotatedType
  ): boolean {
    const without = new Map(metadata)
    without.delete('expect.array.uniqueItems')
    return super.validateArrayConstraints(without as any, value, of)
  }
}

/** `schema` without its `uniqueItems` keywords. */
function withoutUniqueItems(schema: unknown): unknown {
  return JSON.parse(JSON.stringify(schema), (key, value) =>
    key === 'uniqueItems' ? undefined : value
  )
}

/** Every `patternProperties` of `schema` with several patterns, as regexes. */
function overlappingPatternSets(schema: unknown, out: RegExp[][] = []): RegExp[][] {
  if (schema && typeof schema === 'object') {
    const pp = (schema as Record<string, unknown>).patternProperties
    if (pp && typeof pp === 'object' && Object.keys(pp).length > 1) {
      out.push(Object.keys(pp).map(p => new RegExp(p, 'u')))
    }
    for (const value of Object.values(schema)) {
      overlappingPatternSets(value, out)
    }
  }
  return out
}

/** Every key of every object in `value`. */
function keysOf(value: unknown, out = new Set<string>()): Set<string> {
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (!Array.isArray(value)) {
        out.add(key)
      }
      keysOf(item, out)
    }
  }
  return out
}

interface TCase {
  type: TAtscriptAnnotatedType
  schema: object
  value: unknown
  /** the schema's verdict and the validator's */
  schemaOk: boolean
  validatorOk: boolean
  nonUnicode: boolean
  /** the validator's `unknownProps` (`'error'` for a closed schema) */
  unknownProps: 'ignore' | 'error'
}

/**
 * Deliberate differences (documented in `json-schema.md`): a disagreement they explain is not
 * reported.
 */
export const ALLOWED: Array<{ reason: string; match: (c: TCase) => boolean }> = [
  {
    // `@expect.array.uniqueItems` with `@expect.array.key` props: the validator compares the
    // key props only; the schema has no `uniqueItems` (it would compare whole items).
    reason: 'unique by key props',
    match: c =>
      !c.validatorOk &&
      c.schemaOk &&
      new NoUniqueValidator(c.type, { unknownProps: c.unknownProps }).validate(
        structuredClone(c.value),
        true
      ),
  },
  {
    // `uniqueItems` of object items: JSON Schema compares objects ignoring the order of their
    // keys; the validator compares them as written (`{ a, b }` and `{ b, a }` are different).
    reason: 'key order of object items',
    match: c =>
      c.validatorOk &&
      !c.schemaOk &&
      compile(withoutUniqueItems(c.schema) as object, c.nonUnicode)(structuredClone(c.value)),
  },
  {
    // A key matching several different pattern props (`[/^k/]: number`, `[/k$/]: string`):
    // the validator wants it to pass one of them, JSON Schema `patternProperties` all of them.
    reason: 'key matching several pattern props',
    match: c => {
      if (!c.validatorOk || c.schemaOk) {
        return false
      }
      const keys = [...keysOf(c.value)]
      return overlappingPatternSets(c.schema).some(set =>
        keys.some(key => set.filter(re => re.test(key)).length > 1)
      )
    },
  },
]

const STRINGS = [
  '',
  ' ',
  'a',
  'ab',
  'abc',
  'abcd',
  'abcdefg',
  'A',
  'x@y.co',
  'not an email',
  '1.50',
  '-12',
  '+3',
  '1.',
  '.5',
  '12',
  '123e4567-e89b-12d3-a456-426614174000',
  '2024-01-02',
  'true',
]
const NUMBERS = [0, 1, -1, 2, 3, 1.5, -2.5, 100, 1e6]

/** A random JSON value shaped like `type` (to depth 4), sometimes off. */
export function sampleValue(type: TAtscriptAnnotatedType, r: () => number, depth = 0): unknown {
  const t = type.type as any
  const pick = <T>(list: T[]): T => list[Math.floor(r() * list.length)]
  if (depth > 4 || r() < 0.08) {
    return pick<unknown>([null, 'x', 1, true, [], {}])
  }
  switch (t.kind) {
    case 'object': {
      const out: Record<string, unknown> = {}
      for (const [key, prop] of t.props) {
        const k = r()
        if (!prop.optional || k < 0.6) {
          out[key] = sampleValue(prop, r, depth + 1)
        } else if (k < 0.75) {
          out[key] = null
        }
      }
      if (r() < 0.15) {
        out[pick(['extra', 'a', 'b', 'x'])] = pick<unknown>(['x', 1, null])
      }
      return out
    }
    case 'array': {
      return Array.from({ length: Math.floor(r() * 4) }, () => sampleValue(t.of, r, depth + 1))
    }
    case 'tuple': {
      const items = t.items.map((item: TAtscriptAnnotatedType) => sampleValue(item, r, depth + 1))
      const k = r()
      return k < 0.1 ? items.slice(0, -1) : k < 0.2 ? [...items, 'x'] : items
    }
    case 'union': {
      return sampleValue(pick(t.items as TAtscriptAnnotatedType[]), r, depth)
    }
    case 'intersection': {
      const parts = t.items.map((item: any) => sampleValue(item, r, depth))
      return parts.every((p: unknown) => p && typeof p === 'object' && !Array.isArray(p))
        ? Object.assign({}, ...parts)
        : pick(parts)
    }
    default: {
      if (t.value !== undefined && r() < 0.6) {
        return t.value
      }
      switch (t.designType) {
        case 'number': {
          return pick(NUMBERS)
        }
        case 'boolean': {
          return r() < 0.5
        }
        case 'null':
        case 'undefined': {
          return null
        }
        default: {
          return pick(STRINGS)
        }
      }
    }
  }
}

/** Values to check `type` with: `fixed` plus `count` sampled ones (seeded by `seed`). */
export function valuesFor(
  type: TAtscriptAnnotatedType,
  fixed: unknown[],
  count: number,
  seed: number
): unknown[] {
  const r = rng(seed)
  return [...fixed, ...Array.from({ length: count }, () => sampleValue(type, r))]
}

function compile(schema: object, nonUnicode: boolean): (value: unknown) => boolean {
  return (nonUnicode ? ajvNonUnicode : ajv).compile(schema) as (value: unknown) => boolean
}

/**
 * The disagreements of `type`'s JSON schemas (runtime, and bundled when `bundled`) with the
 * validator (`unknownProps: 'ignore'`) on `values` (as JSON: `undefined` props dropped, a
 * top-level `undefined` skipped). `checks` counts the comparisons. `closed`: the runtime schema
 * built with `{ closed: true }` against the validator's `unknownProps: 'error'`.
 */
export function schemaDisagreements(
  label: string,
  type: TAtscriptAnnotatedType,
  values: unknown[],
  bundled: boolean,
  stats?: { checks: number; allowed?: Record<string, number> },
  nonUnicode = false,
  closed = false
): string[] {
  stats ??= { checks: 0 }
  const out: string[] = []
  const schemas: Array<[string, object]> = [
    [closed ? 'runtime closed' : 'runtime', buildJsonSchema(type, { closed })],
  ]
  if (bundled) {
    schemas.push(['bundled', (type as any).toJsonSchema()])
  }
  const validator = new Validator(type, { unknownProps: closed ? 'error' : 'ignore' })
  for (const [kind, schema] of schemas) {
    let check: (value: unknown) => boolean
    try {
      check = compile(schema, nonUnicode)
    } catch (error) {
      out.push(`${label} (${kind}): ajv refuses ${JSON.stringify(schema)}: ${String(error)}`)
      continue
    }
    for (const raw of values) {
      if (raw === undefined) {
        continue
      }
      const value = JSON.parse(JSON.stringify(raw))
      const expected = validator.validate(structuredClone(value), true)
      const got = check(structuredClone(value))
      stats.checks++
      const c: TCase = {
        type,
        schema,
        value,
        schemaOk: got,
        validatorOk: expected,
        nonUnicode,
        unknownProps: closed ? 'error' : 'ignore',
      }
      const allowed = got === expected ? undefined : ALLOWED.find(a => a.match(c))
      if (allowed) {
        stats.allowed ??= {}
        stats.allowed[allowed.reason] = (stats.allowed[allowed.reason] ?? 0) + 1
      } else if (got !== expected) {
        out.push(
          `${label} (${kind}) on ${JSON.stringify(value)}: schema ${got}, validator ${expected} — ${JSON.stringify(schema)}`
        )
      }
    }
  }
  return out
}

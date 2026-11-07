import {
  isPhantomType,
  type TAtscriptAnnotatedType,
  type TAtscriptTypeArray,
  type TAtscriptTypeComplex,
  type TAtscriptTypeObject,
} from './annotated-type'
import { mapList } from './copy-on-change'
import { detectDiscriminator, type TUnionDiscriminator } from './discriminator'
import { acceptsNull } from './validator-fast-check'

/**
 * What `value` looks like without the `null` values the model sends for fields it leaves out under
 * a `requireAll` profile (`OPENAI_STRICT`), before it goes to the validator. The validator
 * takes a missing optional field, but not `null` on an optional `@meta.required` one.
 *
 * A `null` is dropped only from an optional field whose type does not accept `null`: for
 * `x?: string | null` it stays (`null` and a missing field mean different things, e.g. "clear"
 * and "keep" in a patch). In a union, the branch its discriminator picks applies; else every
 * branch does, and a key is dropped only when every branch (and, in an intersection, every part)
 * that declares it has it optional and not accepting `null`: one that needs the `null` keeps it.
 *
 * Copy-on-change: `value` is never mutated (a frozen one works); the same reference comes back
 * when nothing is dropped, else a copy with the changed objects and arrays rebuilt.
 */
export function dropOptionalNulls<T>(type: TAtscriptAnnotatedType, value: T): T {
  return dropNulls([type], value) as T
}

/** The discriminator of a union, found once per union type. */
const discriminators = new WeakMap<object, TUnionDiscriminator | null>()

function discriminatorOf(union: TAtscriptTypeComplex): TUnionDiscriminator | null {
  let disc = discriminators.get(union)
  if (disc === undefined) {
    disc = detectDiscriminator(union.items)
    discriminators.set(union, disc)
  }
  return disc
}

/**
 * The defs `value` is checked against, unions and intersections expanded: the branch a
 * discriminator picks, else every branch.
 */
function expand(defs: TAtscriptAnnotatedType[], value: unknown, out: TAtscriptAnnotatedType[]) {
  for (const def of defs) {
    const type = def.type
    if (type.kind === 'union' || type.kind === 'intersection') {
      const union = type as TAtscriptTypeComplex
      const isObject = value !== null && typeof value === 'object' && !Array.isArray(value)
      const disc = type.kind === 'union' && isObject ? discriminatorOf(union) : null
      const picked = disc
        ? disc.indexMapping[String((value as Record<string, unknown>)[disc.propertyName])]
        : undefined
      expand(picked === undefined ? union.items : [union.items[picked]], value, out)
    } else {
      out.push(def)
    }
  }
}

/** {@link dropOptionalNulls} of `value` as every one of `defs` (alternatives or parts). */
function dropNulls(defs: TAtscriptAnnotatedType[], value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value
  }
  const leaves: TAtscriptAnnotatedType[] = []
  expand(defs, value, leaves)
  if (Array.isArray(value)) {
    return dropNullsOfArray(leaves, value)
  }
  let out: Record<string, unknown> | undefined
  for (const key of Object.keys(value)) {
    const current = (value as Record<string, unknown>)[key]
    if (current !== null && typeof current !== 'object') {
      continue
    }
    const declared: TAtscriptAnnotatedType[] = []
    for (const leaf of leaves) {
      const prop =
        leaf.type.kind === 'object' ? (leaf.type as TAtscriptTypeObject).props.get(key) : undefined
      if (prop !== undefined && !isPhantomType(prop)) {
        declared.push(prop)
      }
    }
    if (declared.length === 0) {
      continue
    }
    if (current === null) {
      if (declared.every(prop => prop.optional && !acceptsNull(prop))) {
        out ??= { ...value }
        delete out[key]
      }
      continue
    }
    const next = dropNulls(declared, current)
    if (next !== current) {
      out ??= { ...value }
      out[key] = next
    }
  }
  return out ?? value
}

/** {@link dropNulls} of an array `value`: the items of every array and tuple among `leaves`. */
function dropNullsOfArray(leaves: TAtscriptAnnotatedType[], value: unknown[]): unknown {
  return mapList(value, (item, i) => {
    if (item === null || typeof item !== 'object') {
      return item
    }
    const declared: TAtscriptAnnotatedType[] = []
    for (const leaf of leaves) {
      const type = leaf.type
      if (type.kind === 'array') {
        declared.push((type as TAtscriptTypeArray).of)
      } else if (type.kind === 'tuple' && i < (type as TAtscriptTypeComplex).items.length) {
        declared.push((type as TAtscriptTypeComplex).items[i])
      }
    }
    return dropNulls(declared, item)
  })
}

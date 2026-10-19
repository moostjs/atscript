/**
 * Layout of a compiled validator check: the structure a check was compiled for, as plain
 * data. `buildLayout` (build-layout.ts) derives it from a type tree (the build-time model
 * of a generated module, or a live tree in tests); the binder (registry.ts) verifies a
 * live tree against it and collects the constraint values the compiled code reads into
 * the K slots.
 *
 * ```
 * Layout = [defs: Def[], root: Site, slotCount]
 * Site   = [optional: 0|1, keyMask, def: number | EXT | INTERP, patternShape, slot]
 * Def    = [FINAL, designType] | [FINAL, designType, literal]
 *        | [OBJECT, keys, sites] | [OBJECT_PATTERNS]
 *        | [ARRAY, of] | [UNION | INTERSECTION | TUPLE, items] | [UNKNOWN, kind]
 * ```
 * - A site is one annotated-type node (a class root, prop, array element, union / tuple /
 *   intersection item). A def is one type-def object: sites sharing a def index share the
 *   def object (by identity) at runtime, which is how shared and recursive types are
 *   compiled once.
 * - `keyMask` has a bit (by {@link VALIDATOR_KEYS} index) per validator annotation that is
 *   *effective* on the node and relevant to its def (present; flags: truthy).
 *   `patternShape` has one char per `@expect.pattern` entry: `e` (empty, skipped),
 *   `n` (checked), `s` (stateful `g` / `y` regex: the check bails to the walk there).
 * - `slot`: the site's first K slot (see {@link siteSlotCount}); `slotCount` is the total.
 * - `EXT`: an anonymous reference into another module's type; bound to that type's own
 *   compiled check (as a template, against the referring node) when it has one, else
 *   checked by the interpreted pre-check.
 * - `INTERP`: a node only known at runtime (e.g. a chained reference into another module's
 *   type): always checked by the interpreted pre-check.
 */
import {
  ARRAY_KEYS,
  BOOLEAN_KEYS,
  boundOf,
  NUMBER_KEYS,
  STRING_KEYS,
  VALIDATOR_KEYS,
} from '../validator-keys'

/** Layout format version; checks of another version are ignored (interpreted). */
export const LAYOUT_VERSION = 2

export const EXT = -1
export const INTERP = -2

export const D_FINAL = 0
export const D_OBJECT = 1
export const D_ARRAY = 2
export const D_UNION = 3
export const D_INTERSECTION = 4
export const D_TUPLE = 5
export const D_UNKNOWN = 6
export const D_OBJECT_PATTERNS = 7

/** Def codes of the kinds with `items`, by kind name. */
export const ITEMS_KIND_CODES: Record<string, number> = {
  union: D_UNION,
  intersection: D_INTERSECTION,
  tuple: D_TUPLE,
}

/** Kind names of the def codes with `items`. */
export const ITEMS_KIND_NAMES: Record<number, string> = {
  [D_UNION]: 'union',
  [D_INTERSECTION]: 'intersection',
  [D_TUPLE]: 'tuple',
}

/** Bits of a compiled check's `flags` argument: the pre-check's TOP / IN_UNION, then options. */
export const F_TOP = 1
export const F_IN_UNION = 2
export const F_ERROR = 4
export const F_STRIP = 8
export const F_PARTIAL_DEEP = 16
export const F_PARTIAL_TOP = 32

export type TSite = [optional: number, mask: number, def: number, shape: string, slot: number]
export type TDef = Array<string | number | boolean | string[] | TSite | TSite[]>
export type TLayout = [defs: TDef[], root: TSite, slotCount: number]

/** Key mask bit of a validator annotation. */
function bit(key: (typeof VALIDATOR_KEYS)[number]): number {
  return 1 << VALIDATOR_KEYS.indexOf(key)
}

function bitsOf(keys: ReadonlyArray<(typeof VALIDATOR_KEYS)[number]>): number {
  let bits = 0
  for (const key of keys) {
    bits |= bit(key)
  }
  return bits
}

export const B_REQUIRED = bit('meta.required')
const B_MIN_LENGTH = bit('expect.minLength')
const B_MAX_LENGTH = bit('expect.maxLength')
const B_PATTERN = bit('expect.pattern')
export const B_INT = bit('expect.int')
const B_MIN = bit('expect.min')
const B_MAX = bit('expect.max')
const B_EX_MIN = bit('expect.exclusiveMin')
const B_EX_MAX = bit('expect.exclusiveMax')
export const B_UNIQUE = bit('expect.array.uniqueItems')

/** Annotations the pre-check reads per kind of value (see validator-keys.ts). */
export const STRING_BITS = bitsOf(STRING_KEYS)
export const NUMBER_BITS = bitsOf(NUMBER_KEYS)
export const ARRAY_BITS = bitsOf(ARRAY_KEYS)
const BOOLEAN_BITS = bitsOf(BOOLEAN_KEYS)

/** Keys whose value the compiled code reads (one K slot each). */
const VALUE_BITS = B_MIN_LENGTH | B_MAX_LENGTH | B_MIN | B_MAX | B_EX_MIN | B_EX_MAX
const FLAG_BITS = B_REQUIRED | B_INT | B_UNIQUE
const ALL_BITS = (1 << VALIDATOR_KEYS.length) - 1

/** The field holding the bound of each value key's object form. */
const BOUND_FIELDS: Record<number, string> = {
  [B_MIN_LENGTH]: 'length',
  [B_MAX_LENGTH]: 'length',
  [B_MIN]: 'minValue',
  [B_MAX]: 'maxValue',
  [B_EX_MIN]: 'exclusiveMinValue',
  [B_EX_MAX]: 'exclusiveMaxValue',
}

/**
 * Validator annotations the pre-check reads for a node of this type def (the rest of the
 * node's annotations cannot change its outcome, so they are not part of the layout).
 */
function relevantBits(type: { kind?: unknown; designType?: unknown; value?: unknown }) {
  switch (type.kind) {
    case '': {
      if (type.designType === 'phantom' || type.value !== undefined) {
        return 0
      }
      switch (type.designType) {
        case 'string': {
          return STRING_BITS
        }
        case 'number': {
          return NUMBER_BITS
        }
        case 'boolean': {
          return BOOLEAN_BITS
        }
        default: {
          return 0
        }
      }
    }
    case 'array': {
      return ARRAY_BITS
    }
    case 'union': {
      return ALL_BITS
    }
    default: {
      return 0
    }
  }
}

/**
 * {@link relevantBits} of a site (`undefined`: a type only known at runtime);
 * `meta.required` also matters on any optional node.
 */
export function siteBits(
  type: { kind?: unknown; designType?: unknown; value?: unknown } | undefined,
  optional: boolean
) {
  return (type === undefined ? 0 : relevantBits(type)) | (optional ? B_REQUIRED : 0)
}

/**
 * Number of K slots a site takes, from its first slot on:
 * - INTERP: its interpreted check, then whether its type is a literal;
 * - otherwise, for an optional `@meta.required` node ({@link hasRejectSlot}): the node
 *   (its `null` is rejected unless its type accepts `null`, decided live);
 * - then EXT: the bound check of the referenced type, and whether that type is a literal;
 *   any other site: its annotation values (see {@link keySlots}).
 */
export function siteSlotCount(site: TSite): number {
  const [, mask, def, shape] = site
  if (def === INTERP) {
    return 2
  }
  let n = (hasRejectSlot(site) ? 1 : 0) + (def === EXT ? 2 : 0)
  if (def !== EXT) {
    for (let bits = mask & VALUE_BITS; bits !== 0; bits &= bits - 1) {
      n++
    }
    for (const c of shape) {
      if (c === 'n') {
        n++
      }
    }
  }
  return n
}

/** An optional node with `@meta.required`: `null` fails unless its type accepts `null`. */
export function hasRejectSlot(site: TSite): boolean {
  return site[0] === 1 && (site[1] & B_REQUIRED) !== 0
}

/** K slots of a site's annotation values, by key (in {@link readKeys} order; `-1`: none). */
export interface TKeySlots {
  minLength: number
  maxLength: number
  patterns: number[]
  min: number
  max: number
  exMin: number
  exMax: number
}

/** The K slot of each annotation value of a site whose values start at slot `at`. */
export function keySlots(mask: number, shape: string, at: number): TKeySlots {
  let k = at
  const next = (b: number) => ((mask & b) === 0 ? -1 : k++)
  const minLength = next(B_MIN_LENGTH)
  const maxLength = next(B_MAX_LENGTH)
  const patterns: number[] = []
  for (const c of shape) {
    if (c === 'n') {
      patterns.push(k++)
    }
  }
  const min = next(B_MIN)
  const max = next(B_MAX)
  const exMin = next(B_EX_MIN)
  const exMax = next(B_EX_MAX)
  return { minLength, maxLength, patterns, min, max, exMin, exMax }
}

/** The child sites of a def. */
export function childSites(def: TDef): TSite[] {
  switch (def[0]) {
    case D_OBJECT: {
      return def[2] as TSite[]
    }
    case D_ARRAY: {
      return [def[1] as TSite]
    }
    case D_UNION:
    case D_INTERSECTION:
    case D_TUPLE: {
      return def[1] as TSite[]
    }
    default: {
      return []
    }
  }
}

/** Compiles `@expect.pattern` entries (the pre-check's regex cache). */
export interface TKeyReader {
  /** The regex of a non-empty `@expect.pattern` entry. */
  regex: (pattern: string, flags: string | undefined) => RegExp
}

/**
 * Computes a node's key mask and pattern shape over `relevant` bits, and — when `out` is
 * given — writes the normalised annotation values from `out[at]` on (the K slots).
 * Throws on annotation values the pre-check itself would throw on (the bind then fails
 * and the interpreted pre-check runs, which reproduces that behaviour).
 */
export function readKeys(
  metadata: Map<string, unknown>,
  relevant: number,
  reader: TKeyReader,
  out?: unknown[],
  at = 0
): { mask: number; shape: string } {
  let mask = 0
  let shape = ''
  let k = at
  if (metadata.size === 0) {
    return { mask, shape }
  }
  for (let i = 0; i < VALIDATOR_KEYS.length; i++) {
    const b = 1 << i
    if ((relevant & b) === 0) {
      continue
    }
    const raw = metadata.get(VALIDATOR_KEYS[i]) as any
    if ((b & FLAG_BITS) !== 0) {
      if (raw) {
        mask |= b
      }
      continue
    }
    if (b === B_PATTERN) {
      if (!raw) {
        continue
      }
      if (!Array.isArray(raw)) {
        throw new TypeError('expect.pattern is not an array')
      }
      mask |= b
      for (const entry of raw) {
        const { pattern, flags } = entry
        if (!pattern) {
          shape += 'e'
          continue
        }
        const re = reader.regex(pattern, flags)
        if (re.global || re.sticky) {
          shape += 's'
          // later entries are never reached
          break
        }
        shape += 'n'
        if (out) {
          out[k] = re
        }
        k++
      }
      continue
    }
    if (raw === undefined) {
      continue
    }
    mask |= b
    if (out) {
      out[k] = boundOf(raw, BOUND_FIELDS[b] as never)
    }
    k++
  }
  return { mask, shape }
}

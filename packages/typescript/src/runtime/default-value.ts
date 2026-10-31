import type { TAtscriptAnnotatedType, TAtscriptTypeFinal } from './annotated-type'
import { isPhantomType } from './annotated-type'
import { enterCut, type TCutPath } from './cut'
import { runWalk, type TWalk } from './traverse'

/**
 * Custom resolver function for computing field values.
 * Return `undefined` to fall through to structural defaults.
 */
export type TValueResolver = (prop: TAtscriptAnnotatedType, path: string) => unknown | undefined

/** Options for {@link createDataFromAnnotatedType}. */
export interface TCreateDataOptions {
  /**
   * How to resolve values:
   * - `'empty'` — structural defaults only (`''`, `0`, `false`, `[]`, `{}`); optional props skipped
   * - `'default'` — use `@meta.default` annotations; optional props skipped unless annotated
   * - `'example'` — use `@meta.example` annotations; optional props always included; arrays get one sample item
   * - `'db'` — use `@db.default` (parsed) or `@db.default.increment/uuid/now` (returns fn name string); optional props skipped unless annotated
   * - `function` — custom resolver per field; optional props skipped unless resolver returns a value
   *
   * @default 'empty'
   */
  mode?: 'empty' | 'default' | 'example' | 'db' | TValueResolver
}

/**
 * Attempts to resolve a value from the mode for the given annotated type.
 * Returns `undefined` when no value is available (or parse/validation fails).
 */
function resolveValue(
  prop: TAtscriptAnnotatedType,
  path: string,
  mode: TCreateDataOptions['mode']
): { value: unknown } | undefined {
  if (!mode || mode === 'empty') {
    return undefined
  }

  let raw: unknown
  if (typeof mode === 'function') {
    raw = mode(prop, path)
    if (raw === undefined) {
      return undefined
    }
    // Callback returns already-parsed values — validate directly
    if (prop.validator({ unknownProps: 'ignore' }).validate(raw, true)) {
      return { value: raw }
    }
    return undefined
  }

  if (mode === 'db') {
    // Try @db.default first (static value, parsed like meta.default)
    const dbValue = prop.metadata.get('db.default') as string | undefined
    if (dbValue !== undefined) {
      const parsed = parseRawValue(dbValue, prop)
      if (
        parsed !== undefined &&
        prop.validator({ unknownProps: 'ignore' }).validate(parsed, true)
      ) {
        return { value: parsed }
      }
      return undefined
    }
    // Fall back to @db.default.increment/uuid/now (return function name as-is)
    if (prop.metadata.has('db.default.increment')) {
      return { value: 'increment' }
    }
    if (prop.metadata.has('db.default.uuid')) {
      return { value: 'uuid' }
    }
    if (prop.metadata.has('db.default.now')) {
      return { value: 'now' }
    }
    return undefined
  }

  // 'default' or 'example'
  const metaKey = mode === 'default' ? 'meta.default' : 'meta.example'
  const rawStr = prop.metadata.get(metaKey) as string | undefined
  if (rawStr === undefined) {
    return undefined
  }

  const parsed = parseRawValue(rawStr, prop)
  if (parsed === undefined) {
    return undefined
  }

  if (prop.validator({ unknownProps: 'ignore' }).validate(parsed, true)) {
    return { value: parsed }
  }
  return undefined
}

/**
 * Parses a raw annotation string into a JS value.
 * Strings are returned as-is for string types; everything else goes through JSON.parse.
 */
function parseRawValue(raw: string, prop: TAtscriptAnnotatedType): unknown {
  if (prop.type.kind === '' && prop.type.designType === 'string') {
    return raw
  }
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

/** Returns the structural default for a final (primitive/literal) type. */
function finalDefault(def: TAtscriptAnnotatedType<TAtscriptTypeFinal>): unknown {
  if (def.type.value !== undefined) {
    return def.type.value
  }
  switch (def.type.designType) {
    case 'string': {
      return ''
    }
    case 'number': {
      return 0
    }
    case 'boolean': {
      return false
    }
    case 'undefined': {
      return undefined
    }
    case 'null': {
      return null
    }
    default: {
      return undefined
    }
  }
}

/**
 * What {@link build} returns for a type it does not build: a recursive type reached again, or a
 * type holding one where a value is required (a required prop, a tuple item, an intersection
 * member) — its value would have to hold its ancestor's again.
 */
const STOPPED = Symbol('stopped')

/**
 * Creates a data object from an ATScript annotated type definition.
 *
 * Supports five modes:
 * - `'empty'` — structural defaults only; optional props omitted
 * - `'default'` — uses `@meta.default` annotations; optional props omitted unless annotated
 * - `'example'` — uses `@meta.example` annotations; optional props always included; arrays get one sample item
 * - `'db'` — uses `@db.default` (parsed) or `@db.default.increment/uuid/now` (fn name string); optional props omitted unless annotated
 * - `function` — custom resolver; optional props omitted unless resolver returns a value
 *
 * When a `@meta.default` / `@meta.example` value is set on a complex type (object, array)
 * and passes full validation, the entire subtree is replaced — no recursion into inner props.
 * If validation fails, the annotation is ignored and structural defaults are built from inner props.
 *
 * @param type - The ATScript annotated type to create data from.
 * @param opts - Options controlling value resolution mode.
 * @returns A value conforming to the type's shape.
 */
export function createDataFromAnnotatedType(
  type: TAtscriptAnnotatedType,
  opts?: TCreateDataOptions
): unknown {
  const data = runWalk(build(type, '', opts?.mode, { path: undefined, lenient: false }))
  // (a type whose required props lead back to it has no value: what it has, as before)
  return built(
    data === STOPPED
      ? runWalk(build(type, '', opts?.mode, { path: undefined, lenient: true }))
      : data
  )
}

/**
 * Where {@link build} is: the path above the node built, for the readers' recursion cut (see
 * `cut.ts`: where `flattenAnnotatedType` cuts a recursive type).
 */
interface TBuilding {
  path: TCutPath | undefined
  /**
   * Builds what it can of a type whose required props lead back (the root, see above): a
   * required prop, tuple item or member not built is left out, the container built all the same.
   */
  lenient: boolean
}

/**
 * Builds the data of `def`. A recursive type stops where the path reaches it again
 * ({@link STOPPED}): an optional prop or an array item leading back is left out, a union takes a
 * branch that does not, and anything else holding it stops too.
 */
function* build(
  def: TAtscriptAnnotatedType,
  path: string,
  mode: TCreateDataOptions['mode'],
  walk: TBuilding
): TWalk<unknown> {
  // Try to resolve a value from the mode before structural defaults
  const resolved = resolveValue(def, path, mode)
  if (resolved !== undefined) {
    return resolved.value
  }
  const below = enterCut(walk.path, def)
  if (below === false) {
    return STOPPED
  }
  return yield buildStructure(def, path, mode, { ...walk, path: below })
}

function* buildStructure(
  def: TAtscriptAnnotatedType,
  path: string,
  mode: TCreateDataOptions['mode'],
  walk: TBuilding
): TWalk<unknown> {
  const recursive = (node: TAtscriptAnnotatedType) => enterCut(walk.path, node) === false
  const stops = (value: unknown) => value === STOPPED && !walk.lenient
  const type = def.type
  switch (type.kind) {
    case '': {
      return type.designType === 'phantom'
        ? undefined
        : finalDefault(def as TAtscriptAnnotatedType<TAtscriptTypeFinal>)
    }
    case 'object': {
      const data: Record<string, unknown> = {}
      for (const [key, prop] of type.props.entries()) {
        if (isPhantomType(prop)) {
          continue
        }
        const childPath = path ? `${path}.${key}` : key

        if (prop.optional) {
          if (mode === 'example') {
            if (!recursive(prop)) {
              setBuilt(data, key, yield build(prop, childPath, mode, walk))
            }
          } else {
            const childResolved = resolveValue(prop, childPath, mode)
            if (childResolved !== undefined) {
              data[key] = childResolved.value
            }
          }
          continue
        }

        const value = yield build(prop, childPath, mode, walk)
        if (stops(value)) {
          return STOPPED
        }
        setBuilt(data, key, value)
      }
      return data
    }
    case 'array': {
      if (mode === 'example' && !recursive(type.of)) {
        const item = yield build(type.of, `${path}.0`, mode, walk)
        return item !== undefined && item !== STOPPED ? [item] : []
      }
      return []
    }
    case 'tuple': {
      const items: unknown[] = []
      for (const [i, item] of type.items.entries()) {
        items.push(yield build(item, `${path}.${i}`, mode, walk))
      }
      return items.some(stops) ? STOPPED : items.map(built)
    }
    case 'union': {
      for (const item of type.items) {
        if (recursive(item)) {
          continue
        }
        const value = yield build(item, path, mode, walk)
        if (value !== STOPPED || walk.lenient) {
          return built(value)
        }
      }
      return walk.lenient ? undefined : STOPPED
    }
    case 'intersection': {
      const items: unknown[] = []
      for (const item of type.items) {
        items.push(yield build(item, path, mode, walk))
      }
      if (items.some(stops)) {
        return STOPPED
      }
      const values = items.filter(item => item !== STOPPED)
      return values.length > 0 && values.every(isPlainObject)
        ? Object.assign({}, ...values)
        : values[0]
    }
    default: {
      throw new Error(`Unknown type kind "${(type as { kind: string }).kind}"`)
    }
  }
}

/** Sets `data[key]` unless nothing was built (see {@link STOPPED}). */
function setBuilt(data: Record<string, unknown>, key: string, value: unknown) {
  if (value !== STOPPED) {
    data[key] = value
  }
}

/** A built value (`undefined` for {@link STOPPED}). */
function built(value: unknown): unknown {
  return value === STOPPED ? undefined : value
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

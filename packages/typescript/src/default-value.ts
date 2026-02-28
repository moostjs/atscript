import type { TAtscriptAnnotatedType, TAtscriptTypeFinal } from './annotated-type'
import { isPhantomType } from './annotated-type'
import { forAnnotatedType } from './traverse'

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
   * - `'db'` — use `@db.default.value` (parsed) or `@db.default.fn` (returns fn name string); optional props skipped unless annotated
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
    // Try @db.default.value first (static value, parsed like meta.default)
    const dbValue = prop.metadata.get('db.default.value' as keyof AtscriptMetadata) as
      | string
      | undefined
    if (dbValue !== undefined) {
      const parsed = parseRawValue(dbValue, prop)
      if (parsed !== undefined && prop.validator({ unknownProps: 'ignore' }).validate(parsed, true)) {
        return { value: parsed }
      }
      return undefined
    }
    // Fall back to @db.default.fn (return function name as-is)
    const dbFn = prop.metadata.get('db.default.fn' as keyof AtscriptMetadata) as
      | string
      | undefined
    if (dbFn !== undefined) {
      return { value: dbFn }
    }
    return undefined
  }

  // 'default' or 'example'
  const metaKey = mode === 'default' ? 'meta.default' : 'meta.example'
  const rawStr = prop.metadata.get(metaKey as keyof AtscriptMetadata) as string | undefined
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
 * Creates a data object from an ATScript annotated type definition.
 *
 * Supports five modes:
 * - `'empty'` — structural defaults only; optional props omitted
 * - `'default'` — uses `@meta.default` annotations; optional props omitted unless annotated
 * - `'example'` — uses `@meta.example` annotations; optional props always included; arrays get one sample item
 * - `'db'` — uses `@db.default.value` (parsed) or `@db.default.fn` (fn name string); optional props omitted unless annotated
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
  return build(type, '', opts?.mode)
}

function build(
  def: TAtscriptAnnotatedType,
  path: string,
  mode: TCreateDataOptions['mode']
): unknown {
  // Try to resolve a value from the mode before structural defaults
  const resolved = resolveValue(def, path, mode)
  if (resolved !== undefined) {
    return resolved.value
  }

  return forAnnotatedType(def, {
    phantom: () => undefined,

    final: d => finalDefault(d),

    object: d => {
      const data: Record<string, unknown> = {}
      for (const [key, prop] of d.type.props.entries()) {
        if (isPhantomType(prop)) {
          continue
        }
        const childPath = path ? `${path}.${key}` : key

        if (prop.optional) {
          if (mode === 'example') {
            // Example mode: always include optional props for a complete example
            data[key] = build(prop, childPath, mode)
          } else {
            // Other modes: only include if mode provides a value
            const childResolved = resolveValue(prop, childPath, mode)
            if (childResolved !== undefined) {
              data[key] = childResolved.value
            }
          }
          continue
        }

        data[key] = build(prop, childPath, mode)
      }
      return data
    },

    array: d => {
      if (mode === 'example') {
        // In example mode, generate one sample item so the array isn't uselessly empty
        const item = build(d.type.of, `${path}.0`, mode)
        return item !== undefined ? [item] : []
      }
      return []
    },

    tuple: d => d.type.items.map((item, i) => build(item, `${path}.${i}`, mode)),

    union: d => {
      const first = d.type.items[0]
      return first ? build(first, path, mode) : undefined
    },

    intersection: d => {
      const first = d.type.items[0]
      return first ? build(first, path, mode) : undefined
    },
  })
}

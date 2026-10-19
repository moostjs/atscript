/**
 * Build-time layout derivation (renderer and tests; not part of the runtime bundle).
 */
import type { TAtscriptAnnotatedType } from '../annotated-type'
import {
  D_ARRAY,
  D_FINAL,
  D_OBJECT,
  D_OBJECT_PATTERNS,
  D_UNKNOWN,
  EXT,
  INTERP,
  ITEMS_KIND_CODES,
  readKeys,
  siteBits,
  siteSlotCount,
  type TDef,
  type TKeyReader,
  type TLayout,
  type TSite,
} from './layout'

/**
 * How a build-time model marks nodes whose type is only known at runtime: `'ext'` for an
 * anonymous reference into another module's type, `'interp'` for anything else unknown.
 */
export type TClassifyType = (type: unknown) => 'ext' | 'interp' | undefined

/**
 * Derives the layout of `root` (see layout.ts). Shared / recursive type defs are recorded
 * once and referenced by index.
 */
export function buildLayout(
  root: TAtscriptAnnotatedType,
  reader: TKeyReader,
  classify?: TClassifyType
): TLayout {
  const defs: TDef[] = []
  const index = new Map<unknown, number>()
  let slots = 0

  function describeDef(type: any): TDef {
    switch (type.kind) {
      case '': {
        return type.value === undefined
          ? [D_FINAL, type.designType]
          : [D_FINAL, type.designType, type.value]
      }
      case 'object': {
        if (type.propsPatterns.length > 0) {
          return [D_OBJECT_PATTERNS]
        }
        const props = [...(type.props as Map<string, TAtscriptAnnotatedType>)]
        return [D_OBJECT, props.map(([key]) => key), props.map(([, prop]) => site(prop))]
      }
      case 'array': {
        return [D_ARRAY, site(type.of)]
      }
      case 'union':
      case 'intersection':
      case 'tuple': {
        return [ITEMS_KIND_CODES[type.kind], (type.items as TAtscriptAnnotatedType[]).map(site)]
      }
      default: {
        return [D_UNKNOWN, String(type.kind)]
      }
    }
  }

  function site(node: TAtscriptAnnotatedType): TSite {
    const type = node.type as any
    const marker = classify?.(type)
    const optional = !marker || marker === 'ext' ? (node.optional ? 1 : 0) : 0
    let d: number
    let keys = { mask: 0, shape: '' }
    if (marker === 'interp') {
      d = INTERP
    } else if (marker === 'ext') {
      d = EXT
      keys = readKeys(node.metadata as any, siteBits(undefined, optional === 1), reader)
    } else {
      d = index.get(type) ?? -1
      if (d < 0) {
        d = defs.length
        defs.push([])
        index.set(type, d)
        defs[d] = describeDef(type)
      }
      keys = readKeys(node.metadata as any, siteBits(type, optional === 1), reader)
    }
    const result: TSite = [optional, keys.mask, d, keys.shape, slots]
    slots += siteSlotCount(result)
    return result
  }

  const rootSite = site(root)
  return [defs, rootSite, slots]
}

/** JS source of a layout literal (plain arrays, strings and numbers incl. NaN / ±Infinity / -0). */
export function layoutSource(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(layoutSource).join(',')}]`
  }
  return literalSource(value)
}

/** JS source of a primitive literal. */
export function literalSource(value: unknown): string {
  if (typeof value === 'number') {
    return Object.is(value, -0) ? '-0' : String(value)
  }
  if (typeof value === 'string') {
    // U+2028 / U+2029 are valid in string literals since ES2019, but escape them anyway.
    return JSON.stringify(value).replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029')
  }
  if (value === undefined) {
    return 'undefined'
  }
  return JSON.stringify(value)
}

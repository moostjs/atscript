import type {
  TAtscriptAnnotatedType,
  TAtscriptTypeFinal,
  TAtscriptTypeObject,
} from './annotated-type'

/**
 * Describes a discriminator property shared by all variants of a union.
 *
 * Returned by {@link detectDiscriminator} when a union qualifies as a
 * discriminated (a.k.a. tagged) union — every variant is an object that
 * carries the same literal-valued property with a distinct value.
 */
export type TUnionDiscriminator = {
  /** Name of the discriminator property shared by all variants. */
  propertyName: string
  /**
   * Maps the literal value of `propertyName` (as a string) → variant index in `items`. An object
   * without a prototype: look a value up directly (`indexMapping[String(tag)]`), a key such as
   * `constructor` finds nothing.
   */
  indexMapping: Record<string, number>
}

/**
 * Detects a discriminator property across union items.
 *
 * Scans all items for object-typed members that share a common property
 * with distinct const/literal values. If exactly one such property exists,
 * it is returned as the discriminator. Returns `null` when no qualifying
 * property exists, or when more than one does (ambiguous).
 */
export function detectDiscriminator(items: TAtscriptAnnotatedType[]): TUnionDiscriminator | null {
  if (items.length < 2) {
    return null
  }

  // All items must be objects
  for (const item of items) {
    if (item.type.kind !== 'object') {
      return null
    }
  }

  // Collect candidate prop names: props that have a const value in the first item
  const firstObj = items[0].type as TAtscriptTypeObject<string>
  const candidates: string[] = []
  for (const [propName, propType] of firstObj.props.entries()) {
    if (propType.type.kind === '' && (propType.type as TAtscriptTypeFinal).value !== undefined) {
      candidates.push(propName)
    }
  }

  // Filter candidates: must exist with a const value in ALL items, all values must be distinct
  let result: TUnionDiscriminator | null = null

  for (const candidate of candidates) {
    const values = new Set<string | number | boolean>()
    // (no prototype: a value such as `constructor` or `__proto__` names no variant)
    const indexMapping: Record<string, number> = Object.create(null)
    let valid = true

    for (let i = 0; i < items.length; i++) {
      const obj = items[i].type as TAtscriptTypeObject<string>
      const prop = obj.props.get(candidate)
      if (!prop || prop.type.kind !== '' || (prop.type as TAtscriptTypeFinal).value === undefined) {
        valid = false
        break
      }
      const val = (prop.type as TAtscriptTypeFinal).value!
      if (values.has(val)) {
        valid = false
        break
      }
      values.add(val)
      indexMapping[String(val)] = i
    }

    if (valid) {
      // More than one qualifying prop → ambiguous, no discriminator
      if (result) {
        return null
      }
      result = { propertyName: candidate, indexMapping }
    }
  }

  return result
}

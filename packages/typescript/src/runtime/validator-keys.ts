/**
 * Annotation keys the validator pre-check reads, per kind of checked value — shared by the
 * interpreted pre-check (validator-fast-check.ts) and the compiled checks (compiled-check/).
 */

/** Annotations of a string node, in check order. */
export const STRING_KEYS = [
  'meta.required',
  'expect.minLength',
  'expect.maxLength',
  'expect.pattern',
] as const

/** Annotations of a number node, in check order. */
export const NUMBER_KEYS = [
  'expect.int',
  'expect.min',
  'expect.max',
  'expect.exclusiveMin',
  'expect.exclusiveMax',
] as const

/** Annotations of a boolean node. */
export const BOOLEAN_KEYS = ['meta.required'] as const

/** Annotations of an array node, in check order. */
export const ARRAY_KEYS = [
  'expect.minLength',
  'expect.maxLength',
  'expect.array.uniqueItems',
] as const

/**
 * Every annotation key the validator pre-check reads. The order is the bit order of
 * compiled-check layouts: changing it changes the layout format.
 */
export const VALIDATOR_KEYS = [
  'meta.required',
  'expect.minLength',
  'expect.maxLength',
  'expect.pattern',
  'expect.int',
  'expect.min',
  'expect.max',
  'expect.exclusiveMin',
  'expect.exclusiveMax',
  'expect.array.uniqueItems',
] as const

/**
 * The number a length / bound annotation compares with: the annotation is either the number
 * itself or an object carrying it in `field` (`{ length }`, `{ minValue }`, …).
 */
export function boundOf<T extends object, K extends keyof T>(
  m: number | T,
  field: K
): number | T[K] {
  return typeof m === 'number' ? m : m[field]
}

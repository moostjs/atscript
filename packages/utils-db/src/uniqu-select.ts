import type { UniqueryControls } from '@uniqu/core'

/**
 * Wraps a raw `$select` value and provides lazy-cached conversions
 * to the forms different adapters need.
 *
 * Only instantiated when `$select` is actually provided —
 * `controls.$select` is `UniquSelect | undefined`.
 *
 * For exclusion → inclusion inversion, pass `allFields` (physical field names).
 */
export class UniquSelect {
  private _raw: UniqueryControls['$select']
  private _allFields?: string[]

  private _arrayResolved = false
  private _array?: string[]

  private _projectionResolved = false
  private _projection?: Record<string, 0 | 1>

  constructor(raw: UniqueryControls['$select'], allFields?: string[]) {
    this._raw = raw
    this._allFields = allFields
  }

  /**
   * Resolved inclusion array of field names.
   * For exclusion form, inverts using `allFields` from constructor.
   */
  get asArray(): string[] | undefined {
    if (this._arrayResolved) {
      return this._array
    }
    this._arrayResolved = true

    if (Array.isArray(this._raw)) {
      this._array = this._raw as string[]
      return this._array
    }

    const raw = this._raw as Record<string, number>
    const entries = Object.entries(raw)
    if (entries.length === 0) {
      return undefined
    }

    if (entries[0][1] === 1) {
      // Inclusion form — extract keys with value 1
      const result: string[] = []
      for (const entry of entries) {
        if (entry[1] === 1) {
          result.push(entry[0])
        }
      }
      this._array = result
    } else {
      // Exclusion form — invert using allFields
      if (!this._allFields) {
        return undefined
      }
      const excluded = new Set<string>()
      for (const entry of entries) {
        if (entry[1] === 0) {
          excluded.add(entry[0])
        }
      }
      const result: string[] = []
      for (const field of this._allFields) {
        if (!excluded.has(field)) {
          result.push(field)
        }
      }
      this._array = result
    }

    return this._array
  }

  /**
   * Record projection preserving original semantics.
   * Returns original object as-is if raw was object.
   * Converts `string[]` to `{field: 1}` inclusion object.
   */
  get asProjection(): Record<string, 0 | 1> | undefined {
    if (this._projectionResolved) {
      return this._projection
    }
    this._projectionResolved = true

    if (!Array.isArray(this._raw)) {
      const raw = this._raw as Record<string, 0 | 1>
      if (Object.keys(raw).length === 0) {
        return undefined
      }
      this._projection = raw
      return this._projection
    }

    // Convert string[] to inclusion object
    const arr = this._raw as string[]
    if (arr.length === 0) {
      return undefined
    }
    const result: Record<string, 1> = {}
    for (const item of arr) {
      result[item] = 1
    }
    this._projection = result
    return this._projection
  }
}

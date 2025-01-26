import { TsArtifact } from './ts-artifact'

/**
 * Represents a complex TypeScript type definition (base name, union, intersection, array, generics).
 *
 * This class is strictly for inline usage, e.g. the part after "=" or ":", like:
 *   prop: TsType(...)
 *   returnType: TsType(...)
 *
 * For a file-level alias (e.g., `export type MyAlias = ...;`), create a separate
 * TsArtifact (e.g. `TsTypeAlias`) that references one of these TsType instances.
 */
export class TsType extends TsArtifact {
  // If this represents an array type, we store the "inner" TsType.
  protected arrayOf?: TsType

  // Parts for union types, e.g. T1 | T2 | T3
  protected unionParts: TsType[] = []

  // Parts for intersection types, e.g. T1 & T2 & T3
  protected intersectionParts: TsType[] = []

  // Generic type parameters, e.g. Promise<T>
  protected genericParams: TsType[] = []

  /**
   * @param baseName - The base name of this type (e.g. "User", "string", "Promise").
   */
  constructor(baseName?: string) {
    super(baseName ?? '') // Storing it in this.name from TsArtifact
  }

  /**
   * Creates a union type: thisType | otherType.
   */
  public union(...others: TsType[]): this {
    this.unionParts.push(...others)
    return this
  }

  /**
   * Creates an intersection type: thisType & otherType.
   */
  public intersection(...others: TsType[]): this {
    this.intersectionParts.push(...others)
    return this
  }

  /**
   * Makes this type into an array type, e.g. "User" => "User[]".
   * If called multiple times, it nests further, e.g. "User[][]".
   */
  public array(): this {
    if (!this.arrayOf) {
      // Move the existing definition into 'arrayOf'
      const inner = new TsType(this.name)
      inner.unionParts = this.unionParts
      inner.intersectionParts = this.intersectionParts
      inner.genericParams = this.genericParams

      this.arrayOf = inner

      // Reset current container so `this` becomes the "outer array"
      this.name = ''
      this.unionParts = []
      this.intersectionParts = []
      this.genericParams = []
    } else {
      // If already an array, just nest further
      this.arrayOf.array()
    }
    return this
  }

  /**
   * Attaches generic type parameters, e.g. Promise<T>, Array<User>, etc.
   */
  public generic(...params: TsType[]): this {
    this.genericParams.push(...params)
    return this
  }

  // ---------------------------------------------------------------------------
  // .ts RENDERING (inline usage)
  // ---------------------------------------------------------------------------
  /**
   * Produces the inline type expression (e.g. "string", "User[]", "A | B & C[]", etc.).
   */
  public override render(prefix = ''): string {
    return this.buildTypeString(prefix)
  }

  // ---------------------------------------------------------------------------
  // .d.ts RENDERING (same here, as it's purely a type)
  // ---------------------------------------------------------------------------
  /**
   * Often the same as render() for pure types, but kept separate if you need customization.
   */
  public override renderTypes(prefix = ''): string {
    return this.buildTypeString(prefix)
  }

  // ---------------------------------------------------------------------------
  // INTERNAL: Build the raw type expression
  // ---------------------------------------------------------------------------
  protected buildTypeString(prefix = ''): string {
    // Start with the base name if any
    let base = this.name || ''

    // If it's an array, we need to render the inner type first
    if (this.arrayOf) {
      let inner = this.arrayOf.buildTypeString()

      // If the inner type contains a union or intersection, wrap it in parentheses
      // before appending "[]".
      if (inner.includes('|') || inner.includes('&')) {
        inner = `(${inner})`
      }
      base = `${inner}[]`
    }

    // If we have generic params, e.g. "Promise<T>"
    if (base && this.genericParams.length > 0) {
      const generics = this.genericParams.map(g => g.buildTypeString()).join(', ')
      // Note: `Promise<string | number>` is valid without parentheses.
      // TS doesn't require parentheses for union/intersection in generics.
      base = `${base}<${generics}>`
    }

    // If we have union parts, build them: "base | part1 | part2"
    if (this.unionParts.length > 0) {
      const unionStr = this.unionParts.map(u => u.buildTypeString()).join(' | ')
      base = base ? `${base} | ${unionStr}` : unionStr
    }

    // If we have intersection parts, build them: "base & part1 & part2"
    if (this.intersectionParts.length > 0) {
      const intersectStr = this.intersectionParts.map(i => i.buildTypeString()).join(' & ')
      base = base ? `${base} & ${intersectStr}` : intersectStr
    }

    // If we ended up with an empty string, default to 'unknown'
    return `${base || 'unknown'}`
  }
}

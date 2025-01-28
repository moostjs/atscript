import { TsType } from './ts-type'
import { wrapProp } from './utils'

/**
 * Represents an object type literal (a set of properties),
 * but can also use union/intersection/array/generic logic from `TsType`.
 *
 * Example usage:
 *   const userStruct = new TsStructure()
 *     .addProp('id', new TsType('number'))
 *     .addProp('name', new TsType('string'))
 *     .array(); // => array of { id: number; name: string }
 */
export class TsStructure extends TsType {
  // A list of object-literal properties, each with a name, an optional flag, and a `TsType` or `TsStructure`.
  private properties: Array<{
    name: string
    type: TsType | TsStructure | string
    optional?: boolean
  }> = []

  /**
   * Adds a property to this structure.
   *
   * @param name - property name
   * @param type - can be a `TsType`, `TsStructure`, or a simple string
   * @param optional - if true, property becomes `name?: type`
   */
  public addProp(name: string, type: TsType | TsStructure | string, optional = false): this {
    this.properties.push({ name, type, optional })
    return this
  }

  public array(): this {
    if (!this.arrayOf) {
      // Move the existing definition into 'arrayOf'
      const inner = new TsStructure(this.name)
      inner.unionParts = this.unionParts
      inner.intersectionParts = this.intersectionParts
      inner.genericParams = this.genericParams
      inner.properties = this.properties

      this.arrayOf = inner

      // Reset current container so `this` becomes the "outer array"
      this.name = ''
      this.unionParts = []
      this.intersectionParts = []
      this.genericParams = []
      this.properties = []
    } else {
      // If already an array, just nest further
      this.arrayOf.array()
    }
    return this
  }

  /**
   * Override `buildTypeString()` to produce an object literal
   * if we have declared properties. Otherwise, we fall back to
   * the normal TsType logic (union, intersection, etc.).
   */
  protected override buildTypeString(prefix = ''): string {
    // build an object literal: { prop1: Type1; prop2?: Type2; ... }
    const lines = this.properties.map(prop => {
      const propType =
        typeof prop.type === 'string'
          ? prop.type
          : prop.type instanceof TsType
            ? prop.type.render(prop.type instanceof TsStructure ? prefix + '  ' : '')
            : prop.type
      // If prop.type is TsStructure, it also extends TsType, so `.render()` works.

      const questionMark = prop.optional ? '?' : ''
      return `${prefix}  ${wrapProp(prop.name)}${questionMark}: ${propType};`
    })

    const objectLiteral = `{\n${lines.join('\n')}\n${prefix}}`
    this.name = objectLiteral
    return super.buildTypeString(prefix)
  }
}

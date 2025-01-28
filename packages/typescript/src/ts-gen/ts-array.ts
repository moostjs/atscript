import { TsArtifact } from './ts-artifact'
import { TsValue } from './ts-value'

/**
 * Represents an array literal, e.g.:
 * [
 *   42,
 *   "hello",
 *   { nested: 123 },
 * ]
 *
 * Each "item" can be either a primitive/string value or another TsArtifact (e.g. TsObject or TsValue).
 *
 * Indentation is managed via the `prefix` parameter, which increments for nested structures.
 */
export class TsArray extends TsArtifact {
  protected items: Array<TsValue | TsArtifact> = []

  constructor() {
    super('array-literal')
  }

  /**
   * Adds a new item to this array.
   *
   * If `value` is a raw string/number/boolean, we convert it into a TsValue internally.
   */
  public addItem(
    value: TsValue | TsArtifact | string | number | boolean | { render(prefix?: string): string }
  ): this {
    if (
      value instanceof TsValue ||
      value instanceof TsArtifact ||
      Object.hasOwn(value as object, 'render')
    ) {
      this.items.push(value as TsArtifact)
    } else {
      // Convert primitive to TsValue
      const valStr = value.toString()
      const tsVal = new TsValue(valStr).setType(typeof value)
      this.items.push(tsVal)
    }
    return this
  }

  // --------------------------------------------------------------------------
  // .ts RENDERING
  // --------------------------------------------------------------------------
  public override render(prefix: string = ''): string {
    const docBlock = this.renderDocs()

    if (this.items.length === 0) {
      // Empty array: "[]"
      return [docBlock, '[]', ''].filter(Boolean).join('\n')
    }

    // Increase indentation for items
    const childPrefix = prefix + '  '

    // Build each item line
    const lines = this.items.map(item => {
      // If item is a string, we can directly return it with quotes or just item
      // But in your design, everything is TsValue or TsArtifact anyway
      const rendered = item.render(childPrefix)
      // The rendered might be multiple lines, so handle indentation
      // Typically:
      //   childPrefixsomeValue,
      // We'll split lines if needed

      const splitLines = rendered.split('\n')
      const firstLine = splitLines[0]
      const restLines = splitLines.slice(1)

      // Put a comma on the end of the last line
      // We'll do it after we rejoin
      if (restLines.length > 0) {
        // Multi-line item
        return [firstLine, ...restLines].join('\n') + ','
      } else {
        // Single-line
        return firstLine + ','
      }
    })

    return [
      docBlock,
      '[',
      ...lines.map(line => line.replace(/^(\s*)/, '$1' + childPrefix)), // indent each line
      prefix + ']',
    ]
      .filter(Boolean)
      .join('\n')
  }

  // --------------------------------------------------------------------------
  // .d.ts RENDERING
  // --------------------------------------------------------------------------
  public override renderTypes(prefix: string = ''): string {
    const docBlock = this.renderDocs()

    if (this.items.length === 0) {
      // Empty array: "[]"
      return [docBlock, '[]'].filter(Boolean).join('\n')
    }

    const childPrefix = prefix + '  '

    const lines = this.items.map(item => {
      const rendered = item.renderTypes(childPrefix)
      const splitLines = rendered.split('\n')
      const firstLine = splitLines[0]
      const restLines = splitLines.slice(1)

      if (restLines.length > 0) {
        return [firstLine, ...restLines].join('\n') + ','
      } else {
        return firstLine + ','
      }
    })

    return [
      docBlock,
      '[',
      ...lines.map(line => line.replace(/^(\s*)/, '$1' + childPrefix)),
      prefix + ']',
    ]
      .filter(Boolean)
      .join('\n')
  }
}

import { TsArray } from './ts-array'
import { TsArtifact } from './ts-artifact'
import { TsValue } from './ts-value'

/**
 * Represents an object literal, e.g.:
 * {
 *   foo: "bar",
 *   nested: {
 *     a: 1
 *   }
 * }
 *
 * Each "entry" can be either a primitive/string value or another TsObject.
 *
 * Indentation is managed via the `prefix` parameter, which increments for nested structures.
 */
export class TsObject extends TsArtifact {
  protected entries: Array<{ key: string; value: TsValue | TsObject | TsArray }> = []

  constructor() {
    super('object-literal')
  }

  public addEntry(
    key: string,
    value:
      | TsObject
      | TsValue
      | TsArray
      | string
      | number
      | boolean
      | { render(prefix?: string): string }
  ): this {
    this.entries.push({
      key,
      value:
        value instanceof TsValue ||
        value instanceof TsObject ||
        value instanceof TsArray ||
        Object.hasOwn(value as object, 'render')
          ? (value as TsValue)
          : new TsValue(value.toString()).setType(typeof value),
    })
    return this
  }

  /**
   * Renders the object literal for .ts output (or runtime).
   */
  public override render(prefix: string = ''): string {
    const docBlock = this.renderDocs()

    if (this.entries.length === 0) {
      // Empty object
      return [docBlock, `{}`, ''].filter(Boolean).join('\n')
    }

    // Increase indentation for child lines
    const childPrefix = prefix + '  '

    // Build each entry line
    const lines = this.entries.map(({ key, value }) => {
      if (typeof value === 'string') {
        // e.g. `${childPrefix}foo: "bar",`
        return `${childPrefix}${key}: ${value},`
      } else {
        // e.g. nested TsObject
        // We call value.render(childPrefix + '  ') if we want further nesting
        const rendered = value.render(childPrefix)
        // The rendered string itself may be multi-line
        // We typically want:
        // childPrefix key: {
        //   ...
        // },
        // So let's split the nested lines.
        // But a simpler approach is to inline it as:
        //   key: <rendered-object>,
        // if the rendered starts with prefix { ...
        // We'll just output it line-by-line with correct indentation.
        const firstLine = `${childPrefix}${key}: `
        // Because the nested object includes the childPrefix, we can place it on a new line
        // and then strip away any trailing semicolon. We'll do a small adaptation:

        // If it's a single-line object, it might come back like:
        // childPrefix{
        //   ...
        // }

        // We'll place the "{" part right after the colon.
        const linesNested = rendered.split('\n')
        // For a multi-line object, we want:
        // childPrefixkey: {
        //   childPrefix  ...
        // },
        // So let's do:
        const joined = [linesNested[0].replace(childPrefix, ''), ...linesNested.slice(1)].join('\n')
        return `${firstLine}${joined},`
      }
    })

    // Wrap in braces
    return [docBlock, `{`, ...lines, `${prefix}}`].filter(Boolean).join('\n')
  }

  /**
   * Renders the object literal for .d.ts output.
   * Typically the same as runtime code for an object literal,
   * unless you have specialized behavior. We'll reuse `render()`.
   */
  public override renderTypes(prefix: string = ''): string {
    const docBlock = this.renderDocs()

    if (this.entries.length === 0) {
      // Empty object
      return [docBlock, `${prefix}{}`, ''].filter(Boolean).join('\n')
    }

    // Increase indentation for child lines
    const childPrefix = prefix + '  '

    // Build each entry line
    const lines = this.entries.map(({ key, value }) => {
      if (typeof value === 'string') {
        return `${childPrefix}${key}: ${value},`
      } else {
        const rendered = value.renderTypes(childPrefix)
        const firstLine = `${childPrefix}${key}: `
        const linesNested = rendered.split('\n')
        const joined = [linesNested[0].replace(childPrefix, ''), ...linesNested.slice(1)].join('\n')
        return `${firstLine}${joined},`
      }
    })

    // Wrap in braces
    return [docBlock, `${prefix}{`, ...lines, `${prefix}}`].filter(Boolean).join('\n')
  }
}

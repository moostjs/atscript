import { TsArtifact } from './ts-artifact'
import { TsType } from './ts-type'

/**
 * TsValue represents a runtime expression plus a separate type annotation for .d.ts files.
 *
 * Example:
 *   const val = new TsValue('myFn(123, "hello")', new TsType('string'));
 *   // .render() => "myFn(123, \"hello\")"
 *   // .renderTypes() => "string"
 */
export class TsValue extends TsArtifact {
  private expression: string
  private valueType: TsType | string | undefined

  /**
   *
   * @param expression - the runtime expression (e.g. "myFn(123)")
   * @param valueType - optional type for .d.ts, can be TsType or string
   */
  constructor(expression: string, valueType?: TsType | string) {
    super('value-artifact')
    this.expression = expression
    this.valueType = valueType
  }

  /**
   * Sets or changes the runtime expression string.
   */
  public setExpression(expr: string): this {
    this.expression = expr
    return this
  }

  /**
   * Sets or changes the type used in .d.ts (TsType or string).
   */
  public setType(type: TsType | string): this {
    this.valueType = type
    return this
  }

  /**
   * Renders the runtime expression (for .ts).
   */
  public override render(prefix: string = ''): string {
    // We can include doc lines if you want, but usually TsValue is inline.
    // If you want doc lines above an expression, you can incorporate them here.
    const docBlock = this.renderDocs()
    const code = `${prefix}${this.expression}`
    if (docBlock) {
      return `${docBlock}\n${code}`
    }
    return code
  }

  /**
   * Renders the type for .d.ts, or falls back to 'any' if none is provided.
   */
  public override renderTypes(prefix: string = ''): string {
    if (!this.valueType) {
      return `${prefix}any`
    }
    if (typeof this.valueType === 'string') {
      return `${prefix}${this.valueType}`
    }
    // If it's a TsType, we call .renderTypes (or just .render if identical)
    return this.valueType.renderTypes(prefix)
  }
}

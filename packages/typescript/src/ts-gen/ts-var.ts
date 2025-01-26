import { TsArtifact } from './ts-artifact'
import { TsValue } from './ts-value'

/**
 * Represents a variable declaration:
 *   const/let/var <name> = <value>;
 *
 * Where <value> is a TsValue, which knows how to render
 * runtime expression vs. .d.ts type.
 */
export class TsVar extends TsArtifact {
  private varKind: 'const' | 'let' | 'var' = 'const'
  private value: TsValue | undefined

  constructor(name: string) {
    super(name)
  }

  public asConst(): this {
    this.varKind = 'const'
    return this
  }

  public asLet(): this {
    this.varKind = 'let'
    return this
  }

  public asVar(): this {
    this.varKind = 'var'
    return this
  }

  /**
   * Sets a TsValue for this variable's initializer.
   */
  public setValue(value: TsValue): this {
    this.value = value
    return this
  }

  // .ts rendering
  public override render(prefix: string = ''): string {
    const docBlock = this.renderDocs()
    const exportPrefix = this.renderExportPrefix()

    // If no value is set, fallback to 'undefined'
    const rhs = this.value ? this.value.render() : 'undefined'

    // Combine everything
    // If the value (TsValue) produces multiple lines, we can place them below, but
    // typically an expression is a single line. If it’s a multi-line TsValue,
    // we might need to indent it. Example:
    //   export const myVar = (
    //     multi-line expression
    //   );

    // For simplicity, let's assume single-line usage.
    // If you want multi-line, you can do more advanced prefixing.

    const output = `${prefix}${exportPrefix}${this.varKind} ${this.name} = ${rhs};`
    return docBlock ? `${docBlock}\n${output}` : output
  }

  // .d.ts rendering
  public override renderTypes(prefix: string = ''): string {
    const docBlock = this.renderDocs()
    const exportPrefix = this.renderExportPrefix()

    // If we have a TsValue, we can call value.renderTypes() to get the declared type.
    // e.g. "declare const myVar: string[];"
    const declaredType = this.value ? this.value.renderTypes() : 'any'

    // For .d.ts, we typically do:
    //   export declare const myVar: <type>;
    // no initializer
    return [
      docBlock,
      `${prefix}${exportPrefix}declare ${this.varKind} ${this.name}: ${declaredType};`,
    ]
      .filter(Boolean)
      .join('\n')
  }
}

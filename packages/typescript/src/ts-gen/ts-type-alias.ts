import { TsArtifact } from './ts-artifact'
import { TsType } from './ts-type'

/**
 * Represents a top-level type alias.
 * E.g., "export type MyAlias = (string | number)[];"
 */
export class TsTypeAlias extends TsArtifact {
  // The actual type expression that goes after the '='
  private targetType: TsType

  constructor(aliasName: string, targetType: TsType) {
    super(aliasName)
    this.targetType = targetType
  }

  /**
   * Produce the .ts code, e.g.:
   *   /** docs * /
   *   export type MyAlias = string | number;
   */
  public override render(): string {
    const docBlock = this.renderDocs()
    const exportPrefix = this.renderExportPrefix()
    const typeString = this.targetType.render() // get the inline type expression

    return (
      '\n' +
      [docBlock, `${exportPrefix}type ${this.name} = ${typeString};`].filter(Boolean).join('\n') +
      '\n'
    )
  }

  /**
   * For .d.ts, we often do the same,
   * but you could customize if needed.
   */
  public override renderTypes(): string {
    const docBlock = this.renderDocs()
    const exportPrefix = this.renderExportPrefix() || 'declare '
    const typeString = this.targetType.renderTypes() // inline type expression for d.ts

    return (
      '\n' +
      [docBlock, `${exportPrefix}type ${this.name} = ${typeString};`].filter(Boolean).join('\n') +
      '\n'
    )
  }
}

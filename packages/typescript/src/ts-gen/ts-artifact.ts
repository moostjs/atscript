/**
 * The base class for all TypeScript code artifacts (classes, interfaces, functions, etc.).
 *
 * Each subclass must implement both `render()` for runtime `.ts` generation
 * and `renderTypes()` for declaration `.d.ts` generation.
 */
export abstract class TsArtifact {
  // Common name or identifier for the artifact (e.g., class name, interface name).
  protected name: string

  // Whether this artifact should be exported (and how).
  protected exportType: 'none' | 'named' | 'default' | 'declare' = 'none'

  // Optionally store JSDoc or in-code comment lines.
  protected docLines: string[] = []

  constructor(name: string) {
    this.name = name
  }

  public exportAs(exportType: 'none' | 'named' | 'default' | 'declare'): this {
    this.exportType = exportType
    return this
  }

  /**
   * Generates the .ts code.
   */
  public abstract render(prefix?: string): string

  /**
   * Generates the .d.ts code.
   */
  public abstract renderTypes(prefix?: string): string

  /**
   * Add a JSDoc or in-code comment line.
   */
  public addDocLine(line: string): this {
    this.docLines.push(line)
    return this
  }

  /**
   * Renders any accumulated doc lines as a valid TypeScript comment.
   */
  protected renderDocs(prefix: string = ''): string {
    if (this.docLines.length === 0) {
      return ''
    }
    const lines = this.docLines.map(line => `${prefix} * ${line}`).join('\n')
    return `${prefix}/**\n${lines}\n${prefix} */`
  }

  /**
   * Helper to build export keyword prefix if necessary.
   */
  protected renderExportPrefix(): string {
    switch (this.exportType) {
      case 'none':
        return ''
      case 'default':
        return 'export default '
      case 'declare':
        return 'export declare '
      case 'named':
      default:
        return 'export '
    }
  }
}

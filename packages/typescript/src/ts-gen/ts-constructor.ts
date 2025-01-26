/**
 * Constructor representation.
 * E.g., `constructor(private id: number) { ... }`.
 */
export class TsConstructor {
  private params: string[] = []
  private bodyLines: string[] = []

  constructor(...params: string[]) {
    this.params = params
  }

  public addBodyLine(line: string): this {
    this.bodyLines.push(line)
    return this
  }

  public render(): string {
    const params = this.params.join(', ')
    // Indent body lines by 2 spaces
    const indentedBody = this.bodyLines.map(line => `  ${line}`).join('\n')
    return `constructor(${params}) {\n${indentedBody}\n}`
  }

  public renderTypes(): string {
    // For .d.ts, we only need the signature
    const params = this.params.join(', ')
    return `constructor(${params});`
  }
}

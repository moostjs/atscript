import { TsType } from './ts-type'

/**
 * Method representation.
 * E.g., `public doSomething(a: string): void { ... }`.
 */
export class TsMethod {
  constructor(
    private name: string,
    private params: string[] = [],
    private returnType: string | TsType = 'void',
    private bodyLines: string[] = []
  ) {}

  public addBodyLine(line: string): this {
    this.bodyLines.push(line)
    return this
  }

  public render(): string {
    const params = this.params.join(', ')
    // Indent body lines by 2 spaces
    const indentedBody = this.bodyLines.map(line => `  ${line}`).join('\n')
    return `${this.name}(${params}): ${this.renderReturnType()} {\n${indentedBody}\n}`
  }

  protected renderReturnType() {
    return this.returnType instanceof TsType ? this.returnType.render() : this.returnType
  }

  public renderTypes(): string {
    const params = this.params.join(', ')
    return `${this.name}(${params}): ${this.returnType};`
  }
}

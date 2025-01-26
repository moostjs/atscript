import { TsType } from './ts-type'

/**
 * Property representation.
 * E.g., `private name: string = '';`
 */
export class TsProperty {
  constructor(
    private name: string,
    private type: string | TsType,
    private initializer?: string,
    private accessModifier: 'public' | 'private' | 'protected' | '' = ''
  ) {}

  private isOptional = false

  optional() {
    this.isOptional = true
  }

  public render(): string {
    const access = this.accessModifier ? `${this.accessModifier} ` : ''
    const init = this.initializer ? ` = ${this.initializer}` : ''
    const optional = this.isOptional ? '?' : '!'
    return `${access}${this.name}${optional}: ${this.renderType()}${init};`
  }

  protected renderType() {
    return this.type instanceof TsType ? this.type.render() : this.type
  }

  public renderTypes(): string {
    // For .d.ts we typically omit initializers
    const access = this.accessModifier ? `${this.accessModifier} ` : ''
    const optional = this.isOptional ? '?' : ''
    return `${access}${this.name}${optional}: ${this.renderType()};`
  }
}

import { TsType } from './ts-type'
import { wrapProp } from './utils'

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

  private isStatic = ''

  private isOptional = false

  static() {
    this.isStatic = 'static '
    return this
  }

  private _forceType = false

  forceType() {
    this._forceType = true
    return this
  }

  optional() {
    this.isOptional = true
    return this
  }

  public render(): string {
    const access = this.accessModifier ? `${this.accessModifier} ` : ''
    const init = this.initializer ? ` = ${this.initializer}` : ''
    const optional = this.isOptional ? '?' : this.initializer ? '' : '!'
    const typeLine = init && !this._forceType ? '' : `: ${this.renderType()}`
    return `${access}${this.isStatic}${wrapProp(this.name)}${optional}${typeLine}${init};`
  }

  protected renderType() {
    return this.type instanceof TsType ? this.type.render() : this.type
  }

  public renderTypes(): string {
    // For .d.ts we typically omit initializers
    const access = this.accessModifier ? `${this.accessModifier} ` : ''
    const optional = this.isOptional ? '?' : ''
    return `${access}${this.isStatic}${wrapProp(this.name)}${optional}: ${this.renderType()};`
  }
}

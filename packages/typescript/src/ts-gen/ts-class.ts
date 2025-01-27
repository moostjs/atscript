import { TsArtifact } from './ts-artifact'
import { TsConstructor } from './ts-constructor'
import { TsMethod } from './ts-method'
import { TsProperty } from './ts-prop'

/**
 * Represents a class in TypeScript code generation.
 */
export class TsClass extends TsArtifact {
  // Optional list of decorators (e.g., '@Injectable', '@Entity()').
  private decorators: string[] = []

  // The class can extend from a parent class.
  private extendsClass?: string

  // The class can implement interfaces.
  private implementsInterfaces: string[] = []

  // Store constructor body or parameter signatures
  private constructorFn?: TsConstructor

  // Collection of methods
  private methods: TsMethod[] = []

  // Collection of properties
  private properties: TsProperty[] = []

  constructor(name: string) {
    super(name)
  }

  /**
   * Add a decorator to this class.
   * E.g. `@Controller()`, `@Entity()`.
   */
  public addDecorator(decorator: string): this {
    this.decorators.push(decorator)
    return this
  }

  /**
   * Indicate which class this one extends.
   */
  public extends(className: string): this {
    this.extendsClass = className
    return this
  }

  /**
   * Indicate which interfaces this class implements.
   */
  public implement(...interfaces: string[]): this {
    this.implementsInterfaces.push(...interfaces)
    return this
  }

  /**
   * Add or replace the constructor definition.
   */
  public addConstructor(constructorFn: TsConstructor): this {
    this.constructorFn = constructorFn
    return this
  }

  /**
   * Add a method definition.
   */
  public addMethod(method: TsMethod): this {
    this.methods.push(method)
    return this
  }

  /**
   * Add a property definition.
   */
  public addProp(prop: TsProperty): this {
    this.properties.push(prop)
    return this
  }

  // --------------------------------------------------------------------------
  // RENDERING FOR .TS
  // --------------------------------------------------------------------------
  public render(): string {
    const docBlock = this.renderDocs()
    const decoratorsBlock = this.decorators.map(d => `${d}`).join('\n')
    const exportPrefix = this.renderExportPrefix()

    let heritageClause = ''
    if (this.extendsClass) {
      heritageClause += ` extends ${this.extendsClass}`
    }
    if (this.implementsInterfaces.length) {
      heritageClause += ` implements ${this.implementsInterfaces.join(', ')}`
    }

    // Build the class body (constructor, properties, methods)
    const classBody = [
      this.constructorFn ? this.constructorFn.render() : '',
      ...this.properties.map(prop => prop.render()),
      ...this.methods.map(method => method.render()),
    ]
      .filter(Boolean)
      .join('\n\n')

    // Indent each line by 2 spaces
    const indentedClassBody = classBody
      .split('\n')
      .map(line => `  ${line}`)
      .join('\n')

    return (
      '\n' +
      [
        docBlock,
        decoratorsBlock,
        `${exportPrefix}class ${this.name}${heritageClause} {`,
        indentedClassBody,
        '}',
      ]
        .filter(Boolean)
        .join('\n') +
      '\n'
    )
  }

  // --------------------------------------------------------------------------
  // RENDERING FOR .D.TS
  // --------------------------------------------------------------------------
  public renderTypes(): string {
    const docBlock = this.renderDocs()
    const exportPrefix = this.renderExportPrefix() || 'declare '

    let heritageClause = ''
    if (this.extendsClass) {
      heritageClause += ` extends ${this.extendsClass}`
    }
    if (this.implementsInterfaces.length) {
      heritageClause += ` implements ${this.implementsInterfaces.join(', ')}`
    }

    // Build the type-only class body (constructor signature, prop signatures, method signatures)
    const classBody = [
      this.constructorFn ? this.constructorFn.renderTypes() : '',
      ...this.properties.map(prop => prop.renderTypes()),
      ...this.methods.map(method => method.renderTypes()),
    ]
      .filter(Boolean)
      .join('\n\n')

    // Indent each line by 2 spaces
    const indentedClassBody = classBody
      .split('\n')
      .map(line => `  ${line}`)
      .join('\n')

    return (
      '\n' +
      [docBlock, `${exportPrefix}class ${this.name}${heritageClause} {`, indentedClassBody, '}']
        .filter(Boolean)
        .join('\n') +
      '\n'
    )
  }
}

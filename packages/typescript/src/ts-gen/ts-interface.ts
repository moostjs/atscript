import { TsArtifact } from './ts-artifact'
import { TsStructure } from './ts-structure'

/**
 * Represents a TypeScript interface artifact:
 *
 *   export interface MyInterface extends AnotherInterface {
 *     ...
 *   }
 *
 * The core shape is stored in a `TsStructure`.
 * We can also specify `extendsList` for inherited interfaces.
 */
export class TsInterface extends TsArtifact {
  private structure: TsStructure
  private extendsList: string[] = []

  constructor(name: string, structure: TsStructure) {
    super(name)
    this.structure = structure
  }

  /**
   * Add one or more interfaces to extend:
   * e.g. .extends('BaseA', 'BaseB')
   */
  public extends(...interfaces: string[]): this {
    this.extendsList.push(...interfaces)
    return this
  }

  // --------------------------------------------------------------------------
  // .ts RENDERING
  // --------------------------------------------------------------------------
  public override render(): string {
    const docBlock = this.renderDocs()
    const exportPrefix = this.renderExportPrefix()

    // e.g., "extends BaseA, BaseB"
    let extendsClause = ''
    if (this.extendsList.length > 0) {
      extendsClause = ` extends ${this.extendsList.join(', ')}`
    }

    // Build the structure as an object literal (or union, etc.)
    // but for an interface, we specifically want an object-literal style.
    // We'll forcibly treat the structure as an object literal
    // by ensuring we rely on structure's custom logic
    // (and ignoring union/intersection except possibly as object-literal combos).
    const structureString = this.structureAsInterfaceBody()

    return [docBlock, `${exportPrefix}interface ${this.name}${extendsClause} ${structureString}`]
      .filter(Boolean)
      .join('\n')
  }

  // --------------------------------------------------------------------------
  // .d.ts RENDERING (identical for interfaces in most cases)
  // --------------------------------------------------------------------------
  public override renderTypes(): string {
    return this.render()
  }

  // --------------------------------------------------------------------------
  // Internal: Convert structure into an interface body
  // --------------------------------------------------------------------------
  /**
   * If the structure is purely an object-literal, we produce the block:
   *   {
   *     prop: type;
   *     ...
   *   }
   * If the structure is a union or something else, it's not strictly valid
   * for an interface. You can decide how to handle that scenario.
   */
  private structureAsInterfaceBody(): string {
    // We'll rely on `TsStructure.render()` to produce the string.
    // If it includes union or intersection, it won't be valid
    // as an interface body.
    //
    // If you want to forcibly ignore unions,
    // you could do that by checking structure properties
    // or throwing an error.

    const raw = this.structure.render()
    // If `raw` starts with '{' and ends with '}',
    // we can use it directly. Otherwise, we might wrap it.
    if (raw.trim().startsWith('{') && raw.trim().endsWith('}')) {
      return raw
    }
    // If it's something else (like union?), you can decide to throw or fallback:
    // For demonstration, let's fallback to an empty block with a comment:
    return `{\n  // WARNING: structure is not a simple object literal.\n}`
  }
}

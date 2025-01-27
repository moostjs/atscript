import { TsArtifact } from './ts-artifact'

/**
 * Represents a single import statement:
 *
 * Examples:
 *  - import './side-effect';
 *  - import defaultName from './path';
 *  - import { A, B as BB } from './path';
 *  - import * as NS from './path';
 *  - import defaultName, { A, B as BB } from './path';
 *  - import defaultName, * as NS from './path';
 */
export class TsImport extends TsArtifact {
  private fromPath: string

  // e.g., "myDefault"
  private defaultImport?: string

  // e.g., "NS" for "* as NS"
  private namespaceImport?: string

  // e.g., [{ name: 'Foo', alias: 'Bar'}, { name: 'Baz' }]
  private namedImports: Array<{ name: string; alias?: string }> = []

  constructor(fromPath: string) {
    // We'll store the fromPath in a separate property (not .name).
    // In TsArtifact's constructor, we can pass something like 'import',
    // but it's not really used as a name. It's just to satisfy the base constructor.
    super('import-stmt')
    this.fromPath = fromPath
  }

  /**
   * Set a default import, e.g.:
   *  import MyDefault from '...';
   */
  public setDefaultImport(name: string): this {
    this.defaultImport = name
    return this
  }

  /**
   * Set a namespace import, e.g.:
   *  import * as NS from '...';
   *
   * Note: TypeScript doesn't allow mixing named imports and namespace
   * imports on the same statement. If you do, we'll still produce something,
   * but it may be invalid.
   */
  public setNamespaceImport(nsName: string): this {
    this.namespaceImport = nsName
    return this
  }

  /**
   * Add a named import, e.g.:
   *  import { Original as Alias } from '...';
   * If `alias` is undefined, it's just { Original }.
   */
  public addNamed(name: string, alias?: string): this {
    this.namedImports.push({ name, alias })
    return this
  }

  // --------------------------------------------------------------------------
  // .ts RENDERING
  // --------------------------------------------------------------------------
  public override render(): string {
    const docBlock = this.renderDocs() // From TsArtifact
    // TsImport is never "exported", so we won't do exportPrefix
    // (But you could do that if you have some custom scenario)

    // If user specified no default, no namespace, no named => side-effect import
    const hasDefault = !!this.defaultImport
    const hasNamespace = !!this.namespaceImport
    const hasNamed = this.namedImports.length > 0

    // 1. Side-effect only
    if (!hasDefault && !hasNamespace && !hasNamed) {
      return [docBlock, `import '${this.fromPath}';`].filter(Boolean).join('\n')
    }

    // 2. Start building "import ..."
    let statement = 'import '

    // 3. If we have default import, add it first
    //    "import myDefault"
    let parts: string[] = []
    if (hasDefault) {
      parts.push(this.defaultImport as string)
    }

    // 4. If we have namespace import, e.g. "* as NS"
    //    If there's already a default import, separate with comma
    if (hasNamespace) {
      const nsFragment = `* as ${this.namespaceImport}`
      if (parts.length > 0) {
        parts.push(nsFragment)
      } else {
        parts = [nsFragment]
      }
    }

    // 5. If we have named imports, e.g. "{ A, B as BB }"
    if (hasNamed) {
      const named = this.namedImports
        .map(({ name, alias }) => (alias ? `${name} as ${alias}` : name))
        .join(', ')
      const namedBlock = `{ ${named} }`

      // If we already have a default or namespace, separate with comma
      if (parts.length > 0) {
        parts.push(namedBlock)
      } else {
        parts = [namedBlock]
      }
    }

    // Join any combination of default/namespace/named with ", "
    statement += parts.join(', ')

    // 6. Append " from '...' "
    statement += ` from '${this.fromPath}';`

    return [docBlock, statement].filter(Boolean).join('\n') + '\n'
  }

  // --------------------------------------------------------------------------
  // .d.ts RENDERING
  // --------------------------------------------------------------------------
  public override renderTypes(): string {
    // Typically identical. If you want different logic for .d.ts imports,
    // customize it. We'll just reuse render() here.
    return this.render()
  }
}

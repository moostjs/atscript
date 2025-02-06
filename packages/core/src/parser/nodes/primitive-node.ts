import { SemanticNode } from './node'
import type { TPrimitiveConfig } from './types'

export class SemanticPrimitiveNode extends SemanticNode {
  constructor(
    private readonly _id: string,
    public readonly config: TPrimitiveConfig,
    private readonly parentKey: string = ''
  ) {
    super('primitive')
    this.props = new Map()
    this.flags = new Set([_id, ...(config?.flags || [])])
    for (const [ext, def] of Object.entries(config.extensions || {})) {
      const node = new SemanticPrimitiveNode(
        ext,
        {
          type: def.type ?? config.type,
          documentation: def.documentation ?? config.documentation,
          extensions: def.extensions,
          flags: Array.from(new Set([...(def.flags || []), ...Array.from(this.flags)])),
        },
        this.key
      )
      this.props.set(ext, node)
    }
  }

  get key() {
    return this.parentKey ? `${this.parentKey}.${this._id}` : this._id
  }

  getAllFlags(_processed?: Set<SemanticPrimitiveNode>): string[] {
    const allFlags = [this._id]
    const processed = _processed || new Set<SemanticPrimitiveNode>()
    processed.add(this)
    for (const [, node] of this.props) {
      if (processed.has(node)) continue
      processed.add(node)
      allFlags.push(...node.getAllFlags(processed))
    }
    return allFlags
  }

  get id() {
    return this._id
  }

  get documentation() {
    return this.config.documentation
      ? `**${this.key}** - ${this.config.documentation}`
      : `**${this.key}**`
  }

  public readonly props: Map<string, SemanticPrimitiveNode>
  public readonly flags: Set<string>

  toString(level = 0, prefix = '●') {
    const indent = ' '.repeat(level * 2)
    let s = `${this.renderAnnotations()}${prefix} [${this.entity}] ${JSON.stringify(
      this.config.type
    )}`
    s += this.renderChildren()
    return indent + s.split('\n').join(`\n${indent}`)
  }
}

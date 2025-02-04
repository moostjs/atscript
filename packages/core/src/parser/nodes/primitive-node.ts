import { SemanticNode } from './node'
import type { TPrimitiveConfig } from './types'

export class SemanticPrimitiveNode extends SemanticNode {
  constructor(
    private readonly _id: string,
    public readonly config: TPrimitiveConfig
  ) {
    super('primitive')
    this.props = new Map()
    this.flags = new Set([_id, ...(config?.flags || [])])
    for (const [ext, def] of Object.entries(config.extensions || {})) {
      const node = new SemanticPrimitiveNode(ext, {
        type: def.type ?? config.type,
        documentation: def.documentation ?? config.documentation,
        extensions: def.extensions,
        flags: Array.from(new Set([...(def.flags || []), ...Array.from(this.flags)])),
      })
      this.props.set(ext, node)
    }
  }

  get id() {
    return this._id
  }

  get documentation() {
    return this.config.documentation
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

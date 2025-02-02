import { SemanticNode } from './node'
import type { TPrimitiveConfig } from './types'

export class SemanticPrimitiveNode extends SemanticNode {
  constructor(
    private readonly _id: string,
    public readonly config: TPrimitiveConfig
  ) {
    super('primitive')
    this.props = new Map()
    this.flags = new Set([_id, ...Array.from(config.flags || [])])
    for (const [ext, def] of Object.entries(config.extensions || {})) {
      const node = new SemanticPrimitiveNode(ext, {
        base: def.base ?? config.base,
        lang: def.lang ? { ...config.lang, ...def.lang } : config.lang,
        documentation: def.documentation ?? config.documentation,
        extensions: def.extensions,
        flags: new Set([...Array.from(def.flags || []), ...Array.from(this.flags)]),
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
}

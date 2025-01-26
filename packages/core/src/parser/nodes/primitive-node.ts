import { SemanticNode } from './node'
import type { TPrimitiveConfig } from './types'

export class SemanticPrimitiveNode extends SemanticNode {
  constructor(
    private readonly _id: string,
    public readonly config?: TPrimitiveConfig
  ) {
    super('primitive')
  }

  get id() {
    return this._id
  }
}

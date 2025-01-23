import { SemanticNode } from './node'

export class SemanticPrimitiveNode extends SemanticNode {
  constructor(private readonly _id: string) {
    super('primitive')
  }

  get id() {
    return this._id
  }
}

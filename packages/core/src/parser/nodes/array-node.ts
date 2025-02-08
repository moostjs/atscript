import { isStructure } from '.'
import { SemanticNode } from './semantic-node'

export class SemanticArrayNode extends SemanticNode {
  constructor() {
    super('array')
  }

  get props() {
    if (this.definition) {
      return isStructure(this.definition) ? this.definition.props : new Map<string, SemanticNode>()
    }
    return new Map<string, SemanticNode>()
  }
}

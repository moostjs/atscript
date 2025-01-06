import { isGroup } from '.'
import { SemanticGroup } from './group-node'
import type { SemanticNode } from './node'

export class SemanticStructureNode extends SemanticGroup {
  constructor() {
    super()
    this.entity = 'structure'
  }
}

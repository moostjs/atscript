import type { Token } from '../token'
import { SemanticNode } from './node'

export class SemanticPropNode extends SemanticNode {
  constructor() {
    super('prop')
  }
}

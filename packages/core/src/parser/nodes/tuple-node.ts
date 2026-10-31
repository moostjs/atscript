import { SemanticGroup } from './group-node'
import type { SemanticNode } from './semantic-node'

export class SemanticTupleNode extends SemanticGroup {
  constructor() {
    super()
    this.entity = 'tuple'
  }

  /**
   * The item list is a comma-separated (or operator-less) plain group (`[a, b]`, `[(a)]`);
   * anything else is the single item (`[{ n: string }]`, `[[a, b]]`, `[a | b]`).
   */
  protected override adoptsMembers(node: SemanticNode): node is SemanticGroup {
    return super.adoptsMembers(node) && (!node.op || node.op === ',')
  }
}

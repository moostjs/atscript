import type { Token } from '../token'
import { SemanticNode } from './node'

export class SemanticRefNode extends SemanticNode {
  constructor() {
    super('ref')
  }

  get referredIdentifiers(): Token[] {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return [this.token('identifier')!]
  }
}

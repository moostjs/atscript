import { ParserNodeBase } from './node-base'
import { ParserNodeContext } from './node-context'
import type { TParserNodeOptions } from './types'

export { ParserNodeContext } from './node-context'

export class ParserNode extends ParserNodeBase {
  constructor(opts: TParserNodeOptions) {
    super()
    this.opts = opts
  }

  public parse(src: string) {
    const ctx = new ParserNodeContext(this)
    return ctx.parse(src)
  }

  protected _recognizes: ParserNode[] = []

  public recognizes(...nodes: ParserNode[]) {
    this._recognizes = nodes
    return this
  }
}

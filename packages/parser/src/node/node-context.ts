import { ParseContext } from '../context'
import type { ParserNode } from '.'
import { ParserNodeBase } from './node-base'

export class ParserNodeContext extends ParserNodeBase {
  protected context: ParseContext

  constructor(
    protected _node: ParserNode,
    protected state = {
      index: 0,
      level: 0,
    },
    context?: ParseContext
  ) {
    super()
    this.context = context || new ParseContext(this._node)
  }

  parse(src: string) {
    return this.context.parse(src)
  }
}

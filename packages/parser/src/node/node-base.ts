import type { TParserNodeOptions } from './types'

export class ParserNodeBase {
  protected opts: TParserNodeOptions = {}

  get endToken() {}
}

import type { ParserNode } from './node'

export class ParseContext {
  constructor(protected node: ParserNode) {}

  public pos = 0

  public index = 0

  public behind = ''

  public here = ''

  public src = ''

  protected l = 0

  protected readonly stack: ParserNode[] = []

  public parse(src: string) {
    this.src = src
    this.here = src
    this.l = src.length
    const cache: Record<string, RegExpExecArray | null> = {}

    while (this.pos < this.l) {}

    return ''
  }
}

import { tokenize } from '../../tokenizer'
import { NodeIterator } from '../iterator'
import type { TPipe } from './core.pipe'
import { runPipes } from './core.pipe'
import { pipes } from './pipes'

export { pipes } from './pipes'

export function parseAtscript(
  source: string,
  _pipes: TPipe[] = [pipes.importPipe, pipes.type, pipes.interfaceType],
  debug = false
) {
  const rawTokens = tokenize(source, debug)
  const ni = new NodeIterator(rawTokens, []).move()
  return {
    nodes: runPipes(_pipes, ni),
    messages: ni.getErrors(),
    toString() {
      return this.nodes.map(a => a.toString()).join('\n')
    },
  }
}

import { tokenize } from '../../tokenizer'
import { NodeIterator } from '../iterator'
import type { TPipe } from './core.pipe'
import { runPipes } from './core.pipe'
import { pipes } from './pipes'

export function parseItn(
  source: string,
  _pipes: TPipe[] = [pipes.type, pipes.structure],
  debug = false
) {
  const rawTokens = tokenize(source, debug)
  const ni = new NodeIterator(rawTokens, []).move()
  return {
    ast: runPipes(_pipes, ni),
    messages: ni.getErrors(),
  }
}

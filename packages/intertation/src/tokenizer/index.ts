import { mapContent, rootNode } from './nodes'

export function tokenize(source: string, debug = false) {
  const tokens = rootNode.parse(source)
  if (debug) {
    console.log(tokens.toTree())
  }
  return mapContent(tokens.content)
}

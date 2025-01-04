import { mapContent, rootNode } from './nodes'

export function tokenize(source: string) {
  const tokens = rootNode.parse(source)
  return mapContent(tokens.content)
}

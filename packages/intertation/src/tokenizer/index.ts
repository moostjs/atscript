import { mapContent, root } from './tokens'

export function tokenize(source: string, debug = false) {
  const tokens = root.parse(source)
  if (debug) {
    console.log(tokens.toTree())
  }
  return mapContent(tokens.content)
}

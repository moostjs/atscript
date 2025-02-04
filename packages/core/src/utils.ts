import { TAnnotationTokens } from './parser/nodes'

export function mergeAnnotations(left?: TAnnotationTokens[], right?: TAnnotationTokens[]) {
  const annotations = [] as TAnnotationTokens[]
  const savedAnnotations = new Set<string>()
  for (const a of right || []) {
    annotations.push(a)
    savedAnnotations.add(a.token.text!)
  }
  for (const a of left || []) {
    if (!savedAnnotations.has(a.token.text!)) {
      annotations.push(a)
    }
  }
  return annotations
}

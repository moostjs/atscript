import { AnnotationSpec } from '../annotations'
import type { TAnnotationsTree } from '../config'

export const emitAnnotations: TAnnotationsTree = {
  jsonSchema: new AnnotationSpec({
    nodeType: ['interface', 'type', 'annotate'],
    description:
      'Pre-compute and embed JSON Schema at build time for this interface, regardless of the global jsonSchema plugin option.',
  }),
}

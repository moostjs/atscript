import type { AnnotationSpec } from '../annotations/annotation-spec'
import type { TPrimitiveConfig } from '../parser/nodes'

export interface TINtertationConfig {
  primitives?: Record<string, TPrimitiveConfig>
  annotations?: TAnnotationsTree
}

export interface TAnnotationsTree {
  [key: string]: TAnnotationsTree | AnnotationSpec
}

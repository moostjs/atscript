import type { AnnotationSpec } from '../annotations/annotation-spec'
import type { TPrimitiveConfig } from '../parser/nodes'

export interface TAnscriptConfig {
  primitives?: Record<string, TPrimitiveConfig>
  annotations?: TAnnotationsTree
}

export interface TAnnotationsTree {
  [key: string]: TAnnotationsTree | AnnotationSpec
}

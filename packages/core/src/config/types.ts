import type { AnnotationSpec } from '../annotations/annotation-spec'
import type { TPrimitiveConfig } from '../parser/nodes'
import type { TAtscriptPlugin, TAtscriptRenderFormat } from '../plugin/types'

export interface TAtscriptConfigInput {
  rootDir: string
  entries?: string[]
  primitives?: Record<string, TPrimitiveConfig>
  annotations?: TAnnotationsTree
  unknownAnnotation?: 'allow' | 'warn' | 'error'
  plugins?: TAtscriptPlugin[]
  include?: string[]
  exclude?: string[]
}

export interface TAtscriptConfigOutput {
  format: TAtscriptRenderFormat
  outDir?: string
}

export type TAtscriptConfig = Partial<TAtscriptConfigInput & TAtscriptConfigOutput>

export interface TAnnotationsTree {
  [key: string]: AnnotationSpec | TAnnotationsTree
}

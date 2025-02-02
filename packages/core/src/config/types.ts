import type { AnnotationSpec } from '../annotations/annotation-spec'
import type { TPrimitiveConfig } from '../parser/nodes'
import { TAnscriptPlugin, TAnscriptRenderFormat } from '../plugin/types'

export interface TAnscriptConfigInput {
  rootDir: string
  entries?: string[]
  primitives?: Record<string, TPrimitiveConfig>
  annotations?: TAnnotationsTree
  unknownAnnotation?: 'allow' | 'warn' | 'error'
  plugins?: TAnscriptPlugin[]
  include?: string[]
  exclude?: string[]
}

export interface TAnscriptConfigOutput {
  format: TAnscriptRenderFormat
  outDir?: string
}

export type TAnscriptConfig = Partial<TAnscriptConfigInput & TAnscriptConfigOutput>

export interface TAnnotationsTree {
  [key: string]: AnnotationSpec | TAnnotationsTree
}

import type { AnnotationSpec } from '../annotations/annotation-spec'
import type { TPrimitiveConfig } from '../parser/nodes'
import { TAnscriptPlugin, TAnscriptRenderContext } from '../plugin/types'

export interface TAnscriptConfigInput {
  rootDir?: string
  entries?: string[]
  primitives?: Record<string, TPrimitiveConfig>
  annotations?: TAnnotationsTree
  unknownAnnotation?: 'allow' | 'warn' | 'error'
  plugins?: TAnscriptPlugin[]
  include?: string[]
  exclude?: string[]
}

export interface TAnscriptConfigOutput {
  context: TAnscriptRenderContext
  outDir?: string
}

export type TAnscriptConfig = TAnscriptConfigInput & Omit<TAnscriptConfigOutput, 'context'>

export interface TAnnotationsTree {
  [key: string]: TAnnotationsTree | AnnotationSpec
}

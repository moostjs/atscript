import type { AnnotationSpec } from '../annotations/annotation-spec'
import type { TPrimitiveConfig } from '../parser/nodes'
import type { TAtscriptPlugin, TAtscriptRenderFormat } from '../plugin/types'

export interface TDbConfigDeclarative {
  adapter: string
  connection: string | (() => string | Promise<string>)
  options?: Record<string, unknown>
  include?: string[]
  exclude?: string[]
}

export type TDbConfig =
  | (() => unknown | Promise<unknown>)
  | TDbConfigDeclarative

export interface TAtscriptConfigInput {
  rootDir: string
  entries?: string[]
  primitives?: Record<string, TPrimitiveConfig>
  annotations?: TAnnotationsTree
  unknownAnnotation?: 'allow' | 'warn' | 'error'
  plugins?: TAtscriptPlugin[]
  include?: string[]
  exclude?: string[]
  db?: TDbConfig
}

export interface TAtscriptConfigOutput {
  format: TAtscriptRenderFormat
  outDir?: string
}

export type TAtscriptConfig = Partial<TAtscriptConfigInput & TAtscriptConfigOutput>

export interface TAnnotationsTree {
  $self?: AnnotationSpec
  [key: string]: AnnotationSpec | TAnnotationsTree | undefined
}

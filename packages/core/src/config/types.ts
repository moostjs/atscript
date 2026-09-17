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

export type TDbConfig = (() => unknown | Promise<unknown>) | TDbConfigDeclarative

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
  /**
   * Extra Atscript models to include in `asc db sync` on top of the compiled
   * `.as` files — typically models shipped by packages.
   *
   * The callback may return an array of annotated types, a module namespace
   * object (`models: () => import('some-package/models')`), or a nested
   * combination of both. Every export that `isAnnotatedType()` accepts and
   * that carries `@db.table` or `@db.view` metadata is included, deduplicated
   * by identity.
   *
   * Declared at the top level so it works with both the declarative and the
   * function form of `db`.
   */
  models?: () => unknown | Promise<unknown>
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

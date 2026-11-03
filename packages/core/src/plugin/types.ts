import type { TOutput } from '../build'
import type { TAtscriptConfig } from '../config'
import type { AtscriptDoc } from '../document'
import type { AtscriptRepo } from '../repo'

export interface TPluginOutput {
  fileName: string
  content: string
}

export type TAtscriptRenderFormat = string

/**
 * Well-known render format for a plugin's primary output.
 *
 * When a `.as` file is saved in an editor (VSCode, etc.), the editor
 * passes this format to `render()` and `buildEnd()`. Plugins should
 * check for this value alongside their own format strings to produce
 * output that is essential for the development experience — typically
 * type declarations for the host language.
 *
 * @example
 * ```ts
 * render(doc, format) {
 *   if (format === 'dts' || format === DEFAULT_FORMAT) {
 *     return [{ fileName: `${doc.name}.d.ts`, content: renderTypes(doc) }]
 *   }
 * }
 * ```
 */
export const DEFAULT_FORMAT: TAtscriptRenderFormat = '__default__'

/** What the caller says about one render (see `TAtscriptPlugin.render`). */
export interface TAtscriptRenderOptions {
  /**
   * Whether the render is checked as a real build's: the TypeScript plugin loads the generated
   * modules and fails when one does not load (a one-shot bundler build, the CLI build). `true`:
   * checked, `false`: not; unset: the plugin's default (`withLoadCheck` of `@atscript/typescript`).
   */
  loadCheck?: boolean
}

export interface TAtscriptPlugin {
  name: string

  config?: (
    config: TAtscriptConfig
  ) => Promise<TAtscriptConfig | undefined> | TAtscriptConfig | undefined

  resolve?: (id: string) => Promise<string | undefined> | string | undefined

  load?: (id: string) => Promise<string | undefined> | string | undefined

  onDocument?: (doc: AtscriptDoc) => Promise<void> | void

  render?: (
    doc: AtscriptDoc,
    format: TAtscriptRenderFormat,
    options?: TAtscriptRenderOptions
  ) => Promise<TPluginOutput[]> | TPluginOutput[]

  buildEnd?: (
    output: TOutput[],
    format: TAtscriptRenderFormat,
    repo: AtscriptRepo
  ) => Promise<void> | void
}

export const createAtscriptPlugin = (plugin: TAtscriptPlugin) => plugin

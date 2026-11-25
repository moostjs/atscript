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

  /**
   * The start of a build: runs after every plugin's `config`, before any `.as` file is
   * discovered or read — the place to write `.as` files (and other files) generated from
   * another source.
   *
   * `config` is the final config; its `rootDir` is absolute. Called by `build()` (the `asc` CLI)
   * and by the bundler plugin (each build, each watch rebuild, the dev server's start), so it may
   * run several times per process, and several runs may overlap (parallel builds, test projects
   * sharing a plugin instance): write each file atomically (a temp file renamed over it), and only
   * when its content changes. The language server never calls it (it reads what a build left on
   * disk).
   */
  buildStart?: (config: TAtscriptConfig & { rootDir: string }) => Promise<void> | void

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

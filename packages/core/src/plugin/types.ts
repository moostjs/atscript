import { TOutput } from '../build'
import { TAtscriptConfig } from '../config'
import { AtscriptDoc } from '../document'
import { AtscriptRepo } from '../repo'

export interface TPluginOutput {
  fileName: string
  content: string
}

export type TAtscriptRenderFormat = string

export interface TAtscriptPlugin {
  name: string

  config?: (
    config: TAtscriptConfig
  ) => Promise<TAtscriptConfig | undefined> | TAtscriptConfig | undefined

  resolve?: (id: string) => Promise<string | undefined> | string | undefined

  load?: (id: string) => Promise<string | undefined> | string | undefined

  onDocumnet?: (doc: AtscriptDoc) => Promise<void> | void

  render?: (
    doc: AtscriptDoc,
    format: TAtscriptRenderFormat
  ) => Promise<TPluginOutput[]> | TPluginOutput[]

  buildEnd?: (
    output: TOutput[],
    format: TAtscriptRenderFormat,
    repo: AtscriptRepo
  ) => Promise<void> | void
}

export const createAtscriptPlugin = (plugin: TAtscriptPlugin) => plugin

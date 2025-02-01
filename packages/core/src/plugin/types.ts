import { TOutput } from '../build'
import { TAnscriptConfig } from '../config'
import { AnscriptDoc } from '../document'
import { AnscriptRepo } from '../repo'

export interface TPluginOutput {
  fileName: string
  content: string
}

export type TAnscriptRenderFormat = string

export interface TAnscriptPlugin {
  name: string

  config?: (
    config: TAnscriptConfig
  ) => Promise<TAnscriptConfig | undefined> | TAnscriptConfig | undefined

  resolve?: (id: string) => Promise<string | undefined> | string | undefined

  load?: (id: string) => Promise<string | undefined> | string | undefined

  onDocumnet?: (doc: AnscriptDoc) => Promise<void> | void

  render?: (
    doc: AnscriptDoc,
    format: TAnscriptRenderFormat
  ) => Promise<TPluginOutput[]> | TPluginOutput[]

  buildEnd?: (
    output: TOutput[],
    format: TAnscriptRenderFormat,
    repo: AnscriptRepo
  ) => Promise<void> | void
}

export const createAnscriptPlugin = (plugin: TAnscriptPlugin) => plugin

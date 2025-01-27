import { TAnscriptConfigInput } from '../config'
import { AnscriptDoc } from '../document'

export interface TOutput {
  name: string
  content: string
}

export type TAnscriptRenderContext = 'prepare' | 'build'

export interface TAnscriptPlugin {
  name: string

  config?: (
    config: TAnscriptConfigInput
  ) => Promise<TAnscriptConfigInput | undefined> | TAnscriptConfigInput | undefined

  resolve?: (id: string) => Promise<string | undefined> | string | undefined

  load?: (id: string) => Promise<string | undefined> | string | undefined

  onDocumnet?: (doc: AnscriptDoc) => Promise<void> | void

  render?: (doc: AnscriptDoc, context: TAnscriptRenderContext) => Promise<TOutput[]> | TOutput[]
}

export const createAnscriptPlugin = (plugin: TAnscriptPlugin) => plugin

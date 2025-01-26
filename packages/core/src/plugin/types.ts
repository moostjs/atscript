import { TAnscriptConfig } from '../config'
import { AnscriptDoc } from '../document'

export interface TOutput {
  name: string
  content: string
}

export interface TAnscriptRenderContext {
  action: 'build' | 'extension'
}

export interface TAnscriptPlugin {
  name: string

  config?: (
    config: TAnscriptConfig
  ) => Promise<TAnscriptConfig | undefined> | TAnscriptConfig | undefined

  resolve?: (id: string) => Promise<string | undefined> | string | undefined

  load?: (id: string) => Promise<string | undefined> | string | undefined

  onDocumnet?: (doc: AnscriptDoc) => Promise<void> | void

  render?: (doc: AnscriptDoc, context: TAnscriptRenderContext) => Promise<TOutput[]> | TOutput[]
}

export const createAnscriptPlugin = (plugin: TAnscriptPlugin) => plugin

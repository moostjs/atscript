import { AsMongo } from './as-mongo'

export * from './mongo-adapter'
export * from './mongo-filter'
export * from './collection-patcher'
export * from './as-mongo'
export * from './validate-plugins'

export function createAdapter(connection: string, _options?: Record<string, unknown>): AsMongo {
  return new AsMongo(connection)
}

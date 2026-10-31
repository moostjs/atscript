// The runtime of a build-time realm (see `codegen/realm.ts`): bundled as one IIFE
// (`dist/realm-runtime.js`, global name `__atscriptRealm`) that each realm evaluates afresh, so
// every realm has its own runtime instance (registries, WeakMaps, epochs).
export * from './utils'
export { compiledCheckRegistrations } from './codegen/validation-model'

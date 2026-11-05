import type { TAtscriptAnnotatedType } from './annotated-type'
import { appliedBlockModules } from './blocks'
import { metadataWriteCount } from './compiled-check/tracking'
import { buildJsonSchema } from './json-schema'
import type { TJsonSchema, TJsonSchemaOptions } from './json-schema'

/** The lazy JSON schema of each type, with the metadata write count it was built at. */
const lazy = new WeakMap<object, { writes: number; schema: TJsonSchema }>()

/**
 * The JSON schema of `type` built by the runtime (`jsonSchema: 'lazy'`): built once, again after
 * a metadata write (a block, a runtime edit: see `metadataWrites`). Called by generated code
 * (`static toJsonSchema()`), with the `jsonSchemaOptions` of the build (the same for every call
 * of a type).
 */
export function lazyJsonSchema(
  type: TAtscriptAnnotatedType,
  opts?: TJsonSchemaOptions
): TJsonSchema {
  const known = lazy.get(type)
  const writes = metadataWriteCount()
  if (known?.writes === writes) {
    return known.schema
  }
  const schema = buildJsonSchema(type, opts)
  lazy.set(type, { writes, schema })
  return schema
}

/** The bundled schemas of the generated types (see {@link bundledSchemaOf}). */
const bundled = new WeakMap<
  object,
  { size: number; schema: TJsonSchema; source: 'bundled' | 'runtime' }
>()

/**
 * Where the schema `type.toJsonSchema()` last returned came from: its bundled literal, or the
 * runtime (`buildJsonSchema`, see {@link bundledSchemaOf}); `undefined` before any call.
 */
export function bundledSchemaSource(type: object): 'bundled' | 'runtime' | undefined {
  return bundled.get(type)?.source
}

/**
 * The JSON schema of `type` (`jsonSchema: 'bundle'`): the
 * bundled `literal` while the modules whose blocks applied are exactly those the build accounted
 * (`modules`, the realm's applied block modules), else the runtime's (`buildJsonSchema`). Raw
 * metadata writes are not seen (as in 0.1.110). Called by generated code, with the
 * `jsonSchemaOptions` of the build (the literal was built with them).
 */
export function bundledSchemaOf(
  type: TAtscriptAnnotatedType,
  literal: () => TJsonSchema,
  modules: readonly string[] = [],
  opts?: TJsonSchemaOptions
): TJsonSchema {
  const applied = appliedBlockModules()
  const known = bundled.get(type)
  if (known?.size === applied.size) {
    return known.schema
  }
  // (the literal only when the applied blocks are exactly those it accounted for —
  // a block module of the build not loaded, or one from elsewhere: built at runtime)
  const accounted = new Set(modules)
  const same = applied.size === accounted.size && [...applied].every(m => accounted.has(m))
  const schema = same ? literal() : buildJsonSchema(type, opts)
  bundled.set(type, { size: applied.size, schema, source: same ? 'bundled' : 'runtime' })
  return schema
}

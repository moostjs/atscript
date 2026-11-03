import type { TAtscriptAnnotatedType, TAtscriptDataType } from './runtime/annotated-type'

export {
  annotate,
  createAnnotatedTypeNode,
  defineAnnotatedType,
  isAnnotatedType,
  isAnnotatedTypeOfPrimitive,
  isPhantomType,
} from './runtime/annotated-type'
export type {
  TAnnotatedTypeHandle,
  TAtscriptAnnotatedType,
  TAtscriptAnnotatedTypeConstructor,
  TAtscriptTypeArray,
  TAtscriptTypeComplex,
  TAtscriptTypeFinal,
  TAtscriptTypeObject,
  TMetadataMap,
  TAtscriptTypeDef,
  InferDataType,
  TAtscriptDataType,
} from './runtime/annotated-type'

/**
 * Extracts the flat dot-notation type map from an Atscript annotated type.
 * If the type has a `__flat` static property (emitted for `@db.table` interfaces),
 * returns that flat map. Otherwise falls back to `TAtscriptDataType<T>`.
 *
 * Use this for type-safe filters and selects with dot-notation field paths.
 */
export type FlatOf<T> = T extends { __flat: infer F }
  ? F
  : T extends TAtscriptAnnotatedType
    ? TAtscriptDataType<T>
    : unknown

/**
 * The type of field `K` of `T`: one step of a type path (`T.a.b`) in generated `.d.ts` files.
 * Each object branch of `T` that declares `K` gives its field (an optional field:
 * `| undefined`); other branches (`null`, scalars, arrays, objects without `K` — a key only
 * pattern props match is not a field) give nothing. A path through a union names the union of
 * the fields, as in the `.as` file.
 */
export type TAtscriptField<T, K extends PropertyKey> = T extends readonly unknown[]
  ? never
  : T extends object
    ? string extends keyof T
      ? TDeclaredField<T, K>
      : number extends keyof T
        ? TDeclaredField<T, K>
        : K extends keyof T
          ? T[K]
          : never
    : never

/** {@link TAtscriptField} of `T` with an index signature: its declared keys only. */
type TDeclaredField<T, K extends PropertyKey> = K extends keyof {
  [P in keyof T as string extends P ? never : number extends P ? never : P]: 0
}
  ? T[K & keyof T]
  : never

/**
 * Extracts the primary key type from an Atscript annotated type.
 * If the type has a `__pk` static property (emitted for `@db.table` interfaces
 * with `@meta.id` fields), returns that type. Otherwise falls back to `unknown`.
 *
 * - Single `@meta.id` field → scalar type (e.g., `string`, `number`)
 * - Multiple `@meta.id` fields → object type (e.g., `{ userId: string; orderId: number }`)
 * - No `@meta.id` fields → `unknown`
 */
export type PrimaryKeyOf<T> = T extends { __pk: infer PK } ? PK : unknown

/**
 * Extracts the own-props flat map from an Atscript annotated type.
 * `__ownProps` contains only table-owned fields (no navigation property descendants).
 * Falls back to `FlatOf<T>` for types generated before this feature was added.
 */
export type OwnPropsOf<T> = T extends { __ownProps: infer O } ? O : FlatOf<T>

/**
 * Extracts the navigation property map from an Atscript annotated type.
 * `__navProps` maps nav prop names to their declared types (e.g., `{ author: Author, comments: Comment[] }`).
 * Returns `Record<string, never>` when no `__navProps` exists (no nav props or pre-feature type).
 */
export type NavPropsOf<T> = T extends { __navProps: infer N extends Record<string, unknown> }
  ? N
  : Record<string, never>

export * from './runtime/validator'
export {
  formatValidatorMessage,
  localizeErrors,
  messagesTranslator,
  VALIDATOR_ERROR_CODES,
  VALIDATOR_MESSAGES,
} from './runtime/validator-messages'
export type { TError, TValidatorErrorCode, TValidatorTranslate } from './runtime/validator-messages'

export { coerceForType, coerceScalar } from './runtime/coerce'

export { buildJsonSchema, fromJsonSchema, mergeJsonSchemas } from './runtime/json-schema'
export type { TJsonSchema } from './runtime/json-schema'
export { detectDiscriminator } from './runtime/discriminator'
export type { TUnionDiscriminator } from './runtime/discriminator'

export { forAnnotatedType } from './runtime/traverse'

export { createDataFromAnnotatedType } from './runtime/default-value'
export type { TCreateDataOptions, TValueResolver } from './runtime/default-value'

export { throwFeatureDisabled } from './runtime/throw-disabled'

export { lazyJsonSchema } from './runtime/bundled-schema'

export { registerCompiledCheck } from './runtime/compiled-check/registry'
export { invalidateCompiledValidators } from './runtime/compiled-check/tracking'

export { flattenAnnotatedType } from './runtime/flatten'
export type { TFlattenOptions } from './runtime/flatten'

export type {
  AtscriptRef,
  AtscriptQueryNode,
  AtscriptQueryFieldRef,
  AtscriptQueryComparison,
  AtscriptExprNode,
  AtscriptOrderItem,
} from './runtime/query-types'

export {
  serializeAnnotatedType,
  deserializeAnnotatedType,
  SERIALIZE_VERSION,
} from './runtime/serialize'
export type {
  TSerializedAnnotatedType,
  TSerializedAnnotatedTypeInner,
  TSerializedTypeDef,
  TSerializedTypeFinal,
  TSerializedTypeObject,
  TSerializedTypeArray,
  TSerializedTypeComplex,
  TSerializeOptions,
  TProcessAnnotationContext,
} from './runtime/serialize'

// The generated structure (`runtime/blocks.ts`, `runtime/layers.ts`): metadata layers, shells,
// blocks with static ranks, the import-cycle queue.
export { LayerMap, metaEmpty, watchLayer, $ak, $nr } from './runtime/layers'
export {
  $f,
  $ft,
  $fc,
  $alias,
  $sh,
  $ps,
  $blk,
  $q,
  $end,
  appliedBlockModules,
  pendingStatements,
} from './runtime/blocks'
export { bundledSchemaOf } from './runtime/bundled-schema'

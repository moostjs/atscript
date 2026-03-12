import type {
  TAtscriptAnnotatedType,
  TAtscriptTypeArray,
  TAtscriptTypeComplex,
  TAtscriptTypeFinal,
  TAtscriptTypeObject,
} from './annotated-type'

/**
 * Type-safe dispatch over `TAtscriptAnnotatedType` by its `type.kind`.
 *
 * Provides the common `switch (def.type.kind)` pattern used by
 * the validator, JSON-schema builder, and serializer.
 * Each caller supplies its own handlers that control recursion.
 *
 * When a `phantom` handler is provided, phantom types (`designType === 'phantom'`)
 * are dispatched to it instead of `final`. This allows consumers to skip or
 * handle phantom props without polluting their `final` handler.
 */
export function forAnnotatedType<R>(
  def: TAtscriptAnnotatedType,
  handlers: {
    final: (def: TAtscriptAnnotatedType<TAtscriptTypeFinal>) => R
    object: (def: TAtscriptAnnotatedType<TAtscriptTypeObject<string>>) => R
    array: (def: TAtscriptAnnotatedType<TAtscriptTypeArray>) => R
    union: (def: TAtscriptAnnotatedType<TAtscriptTypeComplex>) => R
    intersection: (def: TAtscriptAnnotatedType<TAtscriptTypeComplex>) => R
    tuple: (def: TAtscriptAnnotatedType<TAtscriptTypeComplex>) => R
    phantom?: (def: TAtscriptAnnotatedType<TAtscriptTypeFinal>) => R
  }
): R {
  switch (def.type.kind) {
    case '': {
      const typed = def as TAtscriptAnnotatedType<TAtscriptTypeFinal>
      if (handlers.phantom && typed.type.designType === 'phantom') {
        return handlers.phantom(typed)
      }
      return handlers.final(typed)
    }
    case 'object': {
      return handlers.object(def as TAtscriptAnnotatedType<TAtscriptTypeObject<string>>)
    }
    case 'array': {
      return handlers.array(def as TAtscriptAnnotatedType<TAtscriptTypeArray>)
    }
    case 'union': {
      return handlers.union(def as TAtscriptAnnotatedType<TAtscriptTypeComplex>)
    }
    case 'intersection': {
      return handlers.intersection(def as TAtscriptAnnotatedType<TAtscriptTypeComplex>)
    }
    case 'tuple': {
      return handlers.tuple(def as TAtscriptAnnotatedType<TAtscriptTypeComplex>)
    }
    default: {
      throw new Error(`Unknown type kind "${(def.type as { kind: string }).kind}"`)
    }
  }
}

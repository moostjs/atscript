/**
 * The runtime of the generated modules, with `refTo` recorded (declaration-order tests): which
 * type each reference read, and what its type was then — so a test can tell that no reference
 * read a class's type before its chain built it (an empty placeholder), or kept a type a later
 * chain replaced (an alias's `.refTo(…)` replaces its class's type).
 */
import { defineAnnotatedType as define, type TAnnotatedTypeHandle } from '../runtime/annotated-type'

// oxlint-disable-next-line import/export
export * from '../utils'

export interface TProbedRef {
  target: { type: unknown; id?: string }
  /** The target's type object when the reference was made. */
  typeAtRef: unknown
  /** Its kind then (`undefined`: not built yet). */
  kindAtRef: unknown
  /** A class's own chain (`$("", X).refTo(…)`, which copies the target's type). */
  copies: boolean
  chain?: string[]
}

export const probedRefs: TProbedRef[] = []

// oxlint-disable-next-line import/export
export function defineAnnotatedType(kind?: any, base?: any): TAnnotatedTypeHandle {
  const handle = define(kind, base)
  const refTo = handle.refTo
  handle.refTo = function (
    this: TAnnotatedTypeHandle,
    type: any,
    chain?: string[],
    ownFirst?: boolean
  ) {
    // (a type resolved lazily — an alias of another module's type — is not read here: reading
    // it resolves it)
    const own = typeof type === 'function' ? undefined : ownType(type)
    if (own && type.__is_atscript_annotated_type) {
      probedRefs.push({
        target: type,
        typeAtRef: own.value,
        kindAtRef: (own.value as { kind?: unknown } | undefined)?.kind,
        copies: base !== undefined,
        chain,
      })
    }
    // (all its arguments: an `annotate … as` alias's `ownFirst` too)
    return refTo.call(this, type, chain, ownFirst)
  } as typeof handle.refTo
  return handle
}

/** The type a type holds as a plain value (`undefined`: none, or one resolved lazily). */
function ownType(type: object): { value: unknown } | undefined {
  const d = Object.getOwnPropertyDescriptor(type, 'type')
  return d && 'value' in d ? { value: d.value } : undefined
}

/**
 * The references that read a type not built yet: a copy of a placeholder (no kind), or a type its
 * class replaced afterwards (the reference kept the old one).
 */
export function placeholderReads(): string[] {
  return probedRefs
    .filter(
      r =>
        (r.copies && r.kindAtRef === undefined) ||
        (ownType(r.target) !== undefined && ownType(r.target)!.value !== r.typeAtRef)
    )
    .map(
      r =>
        `${r.copies ? 'copy of' : 'reference to'} ${r.target.id ?? '?'}${r.chain ? `.${r.chain.join('.')}` : ''} ${
          r.kindAtRef === undefined ? '(not built)' : '(replaced afterwards)'
        }`
    )
}

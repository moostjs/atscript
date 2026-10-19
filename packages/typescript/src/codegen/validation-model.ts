import {
  annotate,
  cloneRefProp,
  defineAnnotatedType,
  type TAnnotatedTypeHandle,
  type TAtscriptAnnotatedType,
  type TAtscriptTypeDef,
} from '../runtime/annotated-type'
import { buildLayout, layoutSource } from '../runtime/compiled-check/build-layout'
import { emitCheckFactory } from '../runtime/compiled-check/emit'
import { D_UNKNOWN, INTERP, LAYOUT_VERSION } from '../runtime/compiled-check/layout'
import { isValidatorKey } from '../runtime/compiled-check/tracking'
import { getRegex } from '../runtime/validator-fast-check'

/** One step of a mutating-annotate accessor path (see `JsRenderer.buildMutatingAccessors`). */
export type TAccessorStep = 'type' | ['props', string] | ['items', number]

/** Kinds of the opaque types standing for another module's types (see {@link classifyType}). */
const EXT_KIND = '#ext'
const INTERP_KIND = '#interp'

/**
 * How the layout treats a model type: `'ext'` — another module's type referenced as a
 * whole (also an alias / prop clone of one: `cloneTypeDef` keeps the kind); `'interp'` — a
 * chained reference into another module's type, only known at runtime.
 */
function classifyType(type: unknown): 'ext' | 'interp' | undefined {
  const kind = (type as { kind?: unknown } | null | undefined)?.kind
  return kind === EXT_KIND ? 'ext' : kind === INTERP_KIND ? 'interp' : undefined
}

/**
 * Build-time model of the runtime type trees a generated `.as.js` module builds, used to
 * compile validator checks (`compileValidators`).
 *
 * The renderer drives it in lockstep with the builder chains it emits, through the real
 * runtime builder (`defineAnnotatedType`, `annotate`, `cloneRefProp`), so the model has
 * the same structure, the same type-def sharing (by identity) and the same validator
 * annotations as the module after its initialisation. Only the annotations the validator
 * pre-check reads are recorded. Types of other modules are opaque markers: a reference to
 * one (also an alias or a cloned prop of one) compiles to a cross-module site, bound at
 * runtime to the referenced class's own compiled check (see compiled-check/registry.ts).
 *
 * Anything the model cannot follow marks it broken; nothing is compiled then. A model that
 * nevertheless diverges from the runtime only costs speed: the runtime bind detects it and
 * the interpreted pre-check runs.
 */
export class ValidationModel {
  /** The model could not follow the emitted code: compile nothing. */
  broken = false
  /** Handle of the chain being emitted (the target of `.annotate(…)` lines). */
  current: TAnnotatedTypeHandle | undefined
  private readonly classes = new Map<string, TAtscriptAnnotatedType>()
  private readonly markers = new Map<string, TAtscriptAnnotatedType>()

  /** Runs a model step; a throw marks the model broken. */
  run<T>(step: () => T): T | undefined {
    if (this.broken) {
      return undefined
    }
    try {
      return step()
    } catch {
      this.broken = true
      return undefined
    }
  }

  /** Declares a generated class (`static type = {}; static metadata = new Map()`). */
  declare(name: string): void {
    this.classes.set(name, {
      __is_atscript_annotated_type: true,
      type: {},
      metadata: new Map(),
      name,
    } as any)
  }

  /** The model of a class declared in this module (anything else: the emitted code throws). */
  private classBase(name: string): TAtscriptAnnotatedType {
    const cls = this.classes.get(name)
    if (!cls) {
      throw new Error(`${name} is not a class of this module`)
    }
    return cls
  }

  /** `$(kind, name?)`. */
  handle(kind: string, name?: string): TAnnotatedTypeHandle | undefined {
    return this.run(() =>
      defineAnnotatedType(kind as any, name === undefined ? undefined : this.classBase(name))
    )
  }

  /** `.refTo(Local)` / `.refTo(() => Imported)` (with an optional chain). */
  refTo(
    handle: TAnnotatedTypeHandle | undefined,
    name: string,
    imported: boolean,
    chain?: string[]
  ) {
    this.run(() => {
      if (!handle) {
        throw new Error('no chain')
      }
      if (imported) {
        // A chained import resolves to a nested type only the runtime knows.
        const marker = this.marker(name, chain ? INTERP_KIND : EXT_KIND)
        handle.refTo(() => marker as any, chain)
      } else {
        handle.refTo(this.classBase(name) as any, chain)
      }
    })
  }

  /** The opaque stand-in of another module's type `name`. */
  private marker(name: string, kind: string): TAtscriptAnnotatedType {
    const key = `${name}${kind}`
    let marker = this.markers.get(key)
    if (!marker) {
      marker = { __is_atscript_annotated_type: true, type: { kind }, metadata: new Map() } as any
      this.markers.set(key, marker!)
    }
    return marker!
  }

  /** `.annotate(key, value, multiple)` on the current chain (validator keys only). */
  annotate(key: string, value: unknown, multiple: boolean) {
    if (!isValidatorKey(key)) {
      return
    }
    this.run(() => {
      if (!this.current) {
        throw new Error('no chain')
      }
      this.current.annotate(key as any, value, multiple)
    })
  }

  /** The node a mutating-annotate accessor (`Name.type.props.get("a")?…`) points at. */
  private resolve(name: string, steps: TAccessorStep[]): any {
    let cur: any = this.classes.get(name)
    for (const step of steps) {
      if (cur === undefined || cur === null) {
        return undefined
      }
      if (step === 'type') {
        cur = cur.type
        // Opaque (another module's) types are mutated by their own module's model.
        if (classifyType(cur) !== undefined) {
          return undefined
        }
      } else if (step[0] === 'props') {
        cur = cur.props?.get(step[1])
      } else {
        cur = cur.items?.[step[1]]
      }
    }
    return cur
  }

  /** `$c(<accessor>, "prop")`. */
  cloneProp(name: string, steps: TAccessorStep[], prop: string) {
    this.run(() => {
      const parent = this.resolve(name, steps) as TAtscriptTypeDef | undefined
      if (parent) {
        cloneRefProp(parent, prop)
      }
    })
  }

  /** `<accessor>.metadata.delete(key)`. */
  deleteAnnotation(name: string, steps: TAccessorStep[], key: string) {
    this.run(() => {
      this.resolve(name, steps)?.metadata?.delete(key)
    })
  }

  /** `$a(<accessor>.metadata, key, value, multiple)`. */
  mutateAnnotation(
    name: string,
    steps: TAccessorStep[],
    key: string,
    value: unknown,
    multiple: boolean
  ) {
    if (!isValidatorKey(key)) {
      return
    }
    this.run(() => {
      annotate(this.resolve(name, steps)?.metadata, key as any, value as any, multiple)
    })
  }

  /**
   * `$cv(Name, version, layout, factory)` for class `name`, or `undefined` when it cannot be
   * compiled (its root type is only known at runtime, or the model is broken).
   */
  registration(name: string): string | undefined {
    if (this.broken) {
      return undefined
    }
    const cls = this.classes.get(name)
    if (!cls) {
      return undefined
    }
    let layout
    try {
      layout = buildLayout(cls, { regex: getRegex }, classifyType)
    } catch {
      return undefined
    }
    const root = layout[1][2]
    // A root only known at runtime, or one the module never builds (a forward alias).
    if (root === INTERP || (root >= 0 && layout[0][root][0] === D_UNKNOWN)) {
      return undefined
    }
    return `$cv(${name}, ${LAYOUT_VERSION}, ${layoutSource(layout)}, ${emitCheckFactory(layout)})`
  }
}

/**
 * Runtime value of an annotation argument the emitted code writes as a raw expression
 * (`true`, `5`, `-1.5`, …). Anything else is opaque (truthy and not a number): the bind
 * compares only presence / truthiness and reads the real values at runtime.
 */
export function rawLiteralValue(text: string): unknown {
  switch (text) {
    case 'true': {
      return true
    }
    case 'false': {
      return false
    }
    case 'null': {
      return null
    }
    case 'undefined': {
      return undefined
    }
    default: {
      const n = Number(text)
      return text.trim() !== '' && !Number.isNaN(n) ? n : { opaque: text }
    }
  }
}

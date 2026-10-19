/**
 * Runtime registry and binder of build-time compiled validator checks.
 *
 * Generated `.as.js` modules (built with `tsPlugin({ compileValidators: true })`) call
 * {@link registerCompiledCheck} once per class with the class's layout and a factory of
 * its check. On first use, and again after each mutation epoch (see tracking.ts), the
 * entry is bound: `bindLayout` verifies the live type tree against the layout and collects
 * the constraint values into `K`; the factory turns `K` into the check function. A tree
 * that no longer matches leaves the entry unbound for that epoch, so the interpreted
 * pre-check runs instead — always correct, never stale.
 *
 * A registered entry is also a template: a node referencing a class of another module
 * (an `EXT` site) binds that class's layout against itself — its own annotations feed `K`
 * — so cross-module references, aliases of imported types and cloned imported props run
 * compiled code whenever their tree matches the referenced type's structure.
 *
 * The registry is module-local: classes registered with another copy of this runtime
 * (dual ESM / CJS loads, duplicate installs) and subclasses of registered classes are
 * simply validated by the interpreted pre-check.
 */
import { isPhantomType, type TAtscriptAnnotatedType } from '../annotated-type'
import type { TValidatorOptions } from '../validator'
import {
  D_ARRAY,
  D_FINAL,
  D_INTERSECTION,
  D_OBJECT,
  D_OBJECT_PATTERNS,
  D_TUPLE,
  D_UNION,
  D_UNKNOWN,
  EXT,
  F_ERROR,
  F_PARTIAL_DEEP,
  F_PARTIAL_TOP,
  F_STRIP,
  hasRejectSlot,
  INTERP,
  ITEMS_KIND_NAMES,
  LAYOUT_VERSION,
  readKeys,
  siteBits,
  type TDef,
  type TKeyReader,
  type TLayout,
  type TSite,
} from './layout'
import { AnnotationMap, currentEpoch, PropsMap, watch } from './tracking'

/**
 * A compiled check: `(value, flags, opts) → 0 FAIL | 1 PASS | 2 BAIL` (the pre-check
 * contract; `flags` carries the TOP / IN_UNION bits and the option bits, see
 * {@link optionFlags}).
 */
export type TCompiledCheck = (value: unknown, flags: number, opts: TValidatorOptions) => number

/** Factory emitted per class: builds the check from the bound annotation values. */
export type TCompiledFactory = (K: unknown[], H: TCompiledHelpers) => TCompiledCheck

/** Runtime helpers the emitted factories use. */
export interface TCompiledHelpers {
  /** Pending top-level strips (shared with the interpreted pre-check). */
  pk: string[]
  /** `Object.prototype.hasOwnProperty`. */
  ho: (this: object, key: PropertyKey) => boolean
  /** Decimal-string regex. */
  dec: RegExp
  /** `rejectsNullAsRequired` (read live: it depends on the node's whole subtree). */
  rn: (def: TAtscriptAnnotatedType) => boolean
}

/** What the binder needs from the interpreted pre-check. */
export interface TCompiledEnv extends TCompiledHelpers, TKeyReader {
  /** The interpreted pre-check of one node. */
  interp: (
    def: TAtscriptAnnotatedType,
    value: unknown,
    flags: number,
    opts: TValidatorOptions
  ) => number
}

/** A check bound to a node for one epoch. */
interface TBinding {
  /** Epoch `fn` was bound in (`-1`: never). */
  epoch: number
  /** The bound check; `null`: the live tree does not match the layout in this epoch. */
  fn: TCompiledCheck | null
  /** A bind is in progress (recursion through cross-module references). */
  binding: boolean
}

/** A registered class: its own binding plus the template others bind against. */
interface TCompiledEntry extends TBinding {
  layout: TLayout
  factory: TCompiledFactory
}

/** A registered class's layout bound against a node referencing it. */
interface TTemplateBinding extends TBinding {
  entry: TCompiledEntry
}

/** Entries by class (own registrations only: a subclass is not registered). */
const entries = new WeakMap<object, TCompiledEntry>()

/** Template bindings by referring node. */
const templates = new WeakMap<object, TTemplateBinding>()

/** Some compiled check is registered (until then lookups return at once). */
let anyCompiled = false

/** The option bits of `opts` for a compiled check's `flags` argument. */
export function optionFlags(opts: TValidatorOptions): number {
  const unknownProps = opts.unknownProps
  const partial = opts.partial
  return (
    (unknownProps === 'error' ? F_ERROR : unknownProps === 'strip' ? F_STRIP : 0) |
    (partial === 'deep' ? F_PARTIAL_DEEP : partial === true ? F_PARTIAL_TOP : 0)
  )
}

/**
 * Registers the build-time compiled validator check of a generated class (emitted into
 * `.as.js` by `tsPlugin({ compileValidators: true })`; not meant to be called by hand).
 * A layout of another format version is ignored, so the class stays interpreted.
 */
export function registerCompiledCheck(
  cls: TAtscriptAnnotatedType,
  version: number,
  layout: TLayout,
  factory: TCompiledFactory
): void {
  if (version !== LAYOUT_VERSION) {
    return
  }
  entries.set(cls, { layout, factory, epoch: -1, fn: null, binding: false })
  anyCompiled = true
}

let autoCompile: ((def: TAtscriptAnnotatedType) => void) | null = null

/**
 * @internal Test hook: compiles (and registers) every validated type that has no compiled
 * check yet. Shipped builds never set it.
 */
export function __setAutoCompile(fn: ((def: TAtscriptAnnotatedType) => void) | null): void {
  autoCompile = fn
  anyCompiled ||= fn !== null
}

/** The compiled check to run for `def` in this call, or `null` (interpreted). */
export function compiledCheckFor(
  def: TAtscriptAnnotatedType,
  env: TCompiledEnv
): TCompiledCheck | null {
  if (!anyCompiled) {
    return null
  }
  let entry = entries.get(def)
  if (entry === undefined) {
    if (autoCompile === null) {
      return null
    }
    autoCompile(def)
    entry = entries.get(def)
    if (entry === undefined) {
      return null
    }
  }
  return entry.epoch === currentEpoch() ? entry.fn : bind(entry, entry, def, env, false)
}

/** (Re)binds `entry`'s layout against `node` for the current epoch. */
function bind(
  binding: TBinding,
  entry: TCompiledEntry,
  node: TAtscriptAnnotatedType,
  env: TCompiledEnv,
  template: boolean
): TCompiledCheck | null {
  binding.epoch = currentEpoch()
  binding.fn = null
  binding.binding = true
  try {
    const K = bindLayout(entry.layout, node, env, template)
    if (K !== undefined) {
      binding.fn = entry.factory(K, env)
    }
  } catch {
    // An annotation value the pre-check would throw on: interpreted for this epoch.
  } finally {
    binding.binding = false
  }
  return binding.fn
}

/**
 * Verifies the live tree of `node` against `layout` and collects the K slots; `undefined`
 * when anything differs. A `template` bind (a node referring to the layout's class) leaves
 * the root's `optional` to the referring site.
 */
function bindLayout(
  layout: TLayout,
  node: TAtscriptAnnotatedType,
  env: TCompiledEnv,
  template: boolean
): unknown[] | undefined {
  const [defs, root, slotCount] = layout
  const bound: unknown[] = []
  const K: unknown[] = []
  K.length = slotCount

  /** An EXT / INTERP site: its check, then whether its type is a literal. */
  const bindRuntimeSite = (n: TAtscriptAnnotatedType, at: number, ext: boolean): boolean => {
    const type = n.type as any
    // A phantom type is an unknown key of a parent object, which the compiled code cannot
    // know: such trees stay interpreted.
    if (typeof type !== 'object' || type === null || isPhantomType(n)) {
      return false
    }
    watch(n)
    watch(type)
    // oxlint-disable-next-line no-use-before-define
    K[at] = ext ? externalCheck(n, env) : interpreted(n, env)
    K[at + 1] = type.value !== undefined
    return true
  }

  const bindSite = (site: TSite, n: TAtscriptAnnotatedType): boolean => {
    const [optional, mask, d, shape, at] = site
    if (d === INTERP) {
      // Handles `optional` itself.
      return bindRuntimeSite(n, at, false)
    }
    if (template && site === root ? optional !== 0 : !!n.optional !== (optional === 1)) {
      return false
    }
    watch(n)
    const metadata = n.metadata
    // Untracked (plain `Map`) metadata could change unseen: leave such trees interpreted.
    if (!(metadata instanceof AnnotationMap)) {
      return false
    }
    watch(metadata)
    let k = at
    if (hasRejectSlot(site)) {
      K[k++] = n
    }
    if (d === EXT) {
      return (
        readKeys(metadata as any, siteBits(undefined, optional === 1), env).mask === mask &&
        bindRuntimeSite(n, k, true)
      )
    }
    const type = n.type as any
    if (bound[d] === undefined) {
      if (typeof type !== 'object' || type === null) {
        return false
      }
      bound[d] = type
      // oxlint-disable-next-line no-use-before-define
      if (!bindDef(defs[d], type)) {
        return false
      }
    } else if (bound[d] !== type) {
      return false
    }
    const read = readKeys(metadata as any, siteBits(type, optional === 1), env, K, k)
    return read.mask === mask && read.shape === shape
  }

  const bindSites = (sites: TSite[], nodes: unknown): boolean => {
    if (!Array.isArray(nodes) || nodes.length !== sites.length) {
      return false
    }
    for (let i = 0; i < sites.length; i++) {
      if (!bindSite(sites[i], nodes[i])) {
        return false
      }
    }
    return true
  }

  const bindDef = (def: TDef, type: any): boolean => {
    watch(type)
    switch (def[0]) {
      case D_FINAL: {
        return (
          type.kind === '' &&
          type.designType === def[1] &&
          (def.length === 2 ? type.value === undefined : type.value === def[2])
        )
      }
      case D_OBJECT: {
        const props = type.props
        if (
          type.kind !== 'object' ||
          !(props instanceof PropsMap) ||
          !Array.isArray(type.propsPatterns) ||
          type.propsPatterns.length > 0
        ) {
          return false
        }
        watch(props)
        const keys = def[1] as string[]
        const sites = def[2] as TSite[]
        if (props.size !== keys.length) {
          return false
        }
        let i = 0
        for (const [key, prop] of props as Map<string, TAtscriptAnnotatedType>) {
          if (key !== keys[i] || !bindSite(sites[i], prop)) {
            return false
          }
          i++
        }
        return true
      }
      case D_OBJECT_PATTERNS: {
        return (
          type.kind === 'object' &&
          Array.isArray(type.propsPatterns) &&
          type.propsPatterns.length > 0
        )
      }
      case D_ARRAY: {
        return type.kind === 'array' && bindSite(def[1] as TSite, type.of)
      }
      case D_UNION:
      case D_INTERSECTION:
      case D_TUPLE: {
        return type.kind === ITEMS_KIND_NAMES[def[0]] && bindSites(def[1] as TSite[], type.items)
      }
      case D_UNKNOWN: {
        return type.kind === def[1]
      }
      default: {
        return false
      }
    }
  }

  return bindSite(root, node) ? K : undefined
}

/** The interpreted pre-check of `node` (its subtree is read live on every call). */
function interpreted(node: TAtscriptAnnotatedType, env: TCompiledEnv): TCompiledCheck {
  const interp = env.interp
  return (value, flags, opts) => interp(node, value, flags, opts)
}

/**
 * The check of a node referencing another module's type (called for a non-nullish value
 * when the node is optional; the referring site handles `optional`): the referenced class's
 * layout bound against the node when it matches, else the interpreted pre-check.
 */
function externalCheck(node: TAtscriptAnnotatedType, env: TCompiledEnv): TCompiledCheck {
  const entry = templateOf(node)
  if (entry !== undefined) {
    let binding = templates.get(node)
    if (binding === undefined || binding.entry !== entry) {
      binding = { entry, epoch: -1, fn: null, binding: false }
      templates.set(node, binding)
    }
    if (binding.binding) {
      // A reference cycle across modules: use the binding once it completes.
      const pending = binding
      const fallback = interpreted(node, env)
      return (value, flags, opts) => (pending.fn ?? fallback)(value, flags, opts)
    }
    const fn = binding.epoch === currentEpoch() ? binding.fn : bind(binding, entry, node, env, true)
    if (fn !== null) {
      return fn
    }
  }
  return interpreted(node, env)
}

/**
 * The registered class whose layout a referring node binds against: the target of its
 * (unchained) reference, through aliases of other modules' types.
 */
function templateOf(node: TAtscriptAnnotatedType): TCompiledEntry | undefined {
  let ref = node.ref
  for (let hops = 0; hops < 16 && ref !== undefined && ref.field === ''; hops++) {
    let target: TAtscriptAnnotatedType
    try {
      target = ref.type()
    } catch {
      return undefined
    }
    const entry = entries.get(target)
    if (entry === undefined || entry.layout[1][2] !== EXT) {
      return entry
    }
    ref = target.ref
  }
  return undefined
}

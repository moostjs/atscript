import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import type { AtscriptDoc } from '@atscript/core'
import { connectedDocuments, documentsEpoch, moduleId } from '@atscript/core'

import type * as TRealmRuntime from '../realm-runtime'

/**
 * The build-time realm: a fresh runtime instance that evaluates the phase-1 generated modules
 * (the generated text without view payloads, see `JsRenderer.renderModule`) of a build's
 * documents, so build-time views (the bundled JSON schema) run the runtime's own readers on the
 * runtime's own objects: they are what the generated code builds, by construction.
 *
 * - The runtime is `realm-runtime.js` (an IIFE of `utils`, see `src/realm-runtime.ts`),
 *   evaluated afresh per realm: its registries and WeakMaps are the realm's own.
 * - The loader is ESM-faithful: each module's imports are getters reading the exporter's live
 *   bindings (a class read before its declaration ran throws, as in ESM), modules are evaluated
 *   depth-first after their imports (a module being evaluated is not entered again: an import
 *   cycle), the roots in module-id order.
 * - A realm holds the documents connected to the rendered one (imports and importers, directly
 *   or not): the modules of the build the rendered module's types can be changed by.
 */

/** A generated module as the realm evaluates it (see `JsRenderer.renderModule`). */
export interface TRealmModule {
  /** The module's text (phase 1: view payloads are placeholders). */
  text: string
  /**
   * Its import statements, as written (`line`): of `doc`'s generated module, or of the runtime
   * helpers (`doc` undefined); `names` are `[imported, local]`.
   */
  imports: Array<{ line: string; doc?: AtscriptDoc; names: Array<[string, string]> }>
  /** The classes it exports. */
  exports: string[]
  /** Every class it declares. */
  classes: string[]
  /** Exported bindings of other classes (`export { T as P }`: a bare alias is its target). */
  aliases?: Array<{ line: string; name: string; local: string }>
}

type TNamespace = Record<string, unknown>
/** What a module's function hands its loader before its body runs (see {@link moduleFunction}). */
type TModuleHook = (exported: TNamespace, classes: TNamespace) => void
type TModuleFunction = (scope: object, hook: TModuleHook) => void

let runtimeSource: string | undefined

/** This module's directory (dist: where `realm-runtime.js` is). */
function moduleDir(): string | undefined {
  if (typeof __dirname === 'string') {
    return __dirname
  }
  try {
    return path.dirname(fileURLToPath(import.meta.url))
  } catch {
    return undefined
  }
}

/**
 * The text of the realm runtime: `$ATSCRIPT_REALM_RUNTIME` (a file: the test suite and tools
 * running the sources build it), else `realm-runtime.js` next to this module (the package's
 * `dist`).
 */
function realmRuntimeSource(): string {
  if (runtimeSource === undefined) {
    const dir = moduleDir()
    const tried = [process.env.ATSCRIPT_REALM_RUNTIME, dir && path.join(dir, 'realm-runtime.js')]
    for (const file of tried) {
      if (file) {
        try {
          runtimeSource = readFileSync(file, 'utf8')
          break
        } catch {}
      }
    }
    if (runtimeSource === undefined) {
      throw new Error(
        `@atscript/typescript: the build-time runtime (realm-runtime.js) was not found (${tried.filter(Boolean).join(', ')})`
      )
    }
  }
  return runtimeSource
}

let runtimeFactory: (() => typeof TRealmRuntime) | undefined

/**
 * A fresh instance of the runtime (see {@link realmRuntimeSource}): its IIFE run again (compiled
 * once), so the instance's module state is new.
 */
function freshRuntime(): typeof TRealmRuntime {
  // oxlint-disable-next-line no-new-func
  runtimeFactory ??= new Function(
    `${realmRuntimeSource()}\n;return __atscriptRealm`
  ) as () => typeof TRealmRuntime
  return runtimeFactory()
}

/** Getters of `names` (`[name, local]`) reading `read(name)`, on a null-prototype object. */
function getters(names: Array<[string, string]>, read: (name: string) => unknown): object {
  const out = Object.create(null) as object
  for (const [name, local] of names) {
    Object.defineProperty(out, local, { get: () => read(name), enumerable: true })
  }
  return out
}

/** An object literal of getters of `names` (source). */
const gettersSource = (names: Array<string | [string, string]>) =>
  `{ ${names
    .map(n => (typeof n === 'string' ? [n, n] : n))
    .map(([n, local]) => `get ${n}() { return ${local} }`)
    .join(', ')} }`

/**
 * The function evaluating module `m`: `__scope` holds its imports, `__module(exports, classes)`
 * gets getters of its exported classes and of all its classes before its body runs.
 */
function moduleFunction(m: TRealmModule): TModuleFunction {
  let body = m.text
  for (const { line } of m.imports) {
    body = body.replace(`${line}\n`, () => '')
  }
  for (const name of m.exports) {
    body = body.replace(`export class ${name} `, () => `class ${name} `)
  }
  const aliases = (m.aliases ?? []).map(a => [a.name, a.local] as [string, string])
  for (const { line } of m.aliases ?? []) {
    body = body.replace(`${line}\n`, () => '')
  }
  // oxlint-disable-next-line no-new-func
  return new Function(
    '__scope',
    '__module',
    `with (__scope) { return (function () { "use strict";\n__module(${gettersSource([...m.exports, ...aliases])}, ${gettersSource([...m.classes, ...aliases])});\n${body}\n})() }`
  ) as TModuleFunction
}

export class Realm {
  /** The realm's runtime instance. */
  readonly rt = freshRuntime()
  private readonly loaded = new Map<
    AtscriptDoc,
    { exports?: TNamespace; classes?: TNamespace; error?: unknown }
  >()

  constructor(private readonly modules: Map<AtscriptDoc, TRealmModule>) {}

  /**
   * Evaluates every module (roots by module id; see the file comment). A module that throws
   * fails, and so do the modules importing it (as in ESM); the others are evaluated.
   */
  load(): this {
    const roots = [...this.modules.keys()]
      .map(doc => ({ doc, id: moduleId(doc) }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    for (const { doc } of roots) {
      try {
        this.evaluate(doc)
      } catch {
        // (recorded on the failed modules: see `classOf`)
      }
    }
    return this
  }

  /** Class `name` of `doc`'s module (evaluated). */
  classOf(doc: AtscriptDoc, name: string): unknown {
    const state = this.loaded.get(doc)
    // (a module that threw has no usable bindings, as in ESM)
    if (!state?.classes || state.error) {
      throw state?.error ?? new Error(`realm: ${doc.id} was not evaluated`)
    }
    return state.classes[name]
  }

  /** The classes of `doc`'s module (evaluated), by name. */
  classesOf(doc: AtscriptDoc): Map<string, unknown> {
    const names = this.modules.get(doc)?.classes ?? []
    return new Map(names.map(name => [name, this.classOf(doc, name)]))
  }

  private _classTypes?: Set<unknown>

  /** The types of every class of the realm's modules (evaluated). */
  classTypes(): Set<unknown> {
    if (!this._classTypes) {
      this._classTypes = new Set()
      for (const [doc, m] of this.modules) {
        for (const name of m.classes) {
          try {
            this._classTypes.add((this.classOf(doc, name) as { type?: unknown } | undefined)?.type)
          } catch {
            // (a module that threw: none of its classes)
          }
        }
      }
    }
    return this._classTypes
  }

  private evaluate(doc: AtscriptDoc) {
    if (this.loaded.has(doc)) {
      return
    }
    const state: { exports?: TNamespace; classes?: TNamespace; error?: unknown } = {}
    this.loaded.set(doc, state)
    const m = this.modules.get(doc)
    if (!m) {
      state.error = new Error(`realm: ${doc.id} was not rendered`)
      throw state.error
    }
    for (const { doc: from } of m.imports) {
      if (from) {
        try {
          this.evaluate(from)
        } catch (error) {
          state.error = error
          throw error
        }
        // (an import that failed before: this module fails too)
        const failed = this.loaded.get(from)?.error
        if (failed) {
          state.error = failed
          throw failed
        }
      }
    }
    const scope = Object.create(null) as object
    for (const { doc: from, names } of m.imports) {
      const read = from
        ? (name: string) => {
            const exported = this.loaded.get(from)?.exports
            if (!exported) {
              throw new ReferenceError(`Cannot access '${name}' before initialization`)
            }
            return exported[name]
          }
        : (name: string) => (this.rt as unknown as TNamespace)[name]
      Object.defineProperties(scope, Object.getOwnPropertyDescriptors(getters(names, read)))
    }
    try {
      moduleFunction(m)(scope, (exported: TNamespace, classes: TNamespace) => {
        state.exports = exported
        state.classes = classes
      })
    } catch (error) {
      state.error = error
      throw error
    }
  }
}

/** The realms of the current documents' epoch, by render options and component. */
const realms = new Map<string, Realm>()
/** The component of each document (see `connectedDocuments`) of the current documents' epoch. */
const components = new Map<AtscriptDoc, { docs: AtscriptDoc[]; key: string }>()
let realmsEpoch = -1

/**
 * The realm of `doc`'s component (see `connectedDocuments`) for the render options `key`, loaded:
 * one per component and options until a document changes (see `documentsEpoch`).
 * `moduleOf` renders a document's phase-1 module (a module that failed to evaluate throws on
 * `classOf`).
 */
export function realmOf(
  doc: AtscriptDoc,
  key: string,
  moduleOf: (doc: AtscriptDoc) => TRealmModule
): Realm {
  if (realmsEpoch !== documentsEpoch()) {
    realmsEpoch = documentsEpoch()
    realms.clear()
    components.clear()
  }
  let component = components.get(doc)
  if (!component) {
    const all = connectedDocuments(doc)
    const first = all.reduce((a, b) => (b.id < a.id ? b : a))
    component = { docs: all, key: `${first.id}\n${all.length}` }
    for (const d of all) {
      components.set(d, component)
    }
  }
  const docs = component.docs
  const id = `${key}\n${component.key}`
  let realm = realms.get(id)
  if (!realm) {
    const modules = new Map<AtscriptDoc, TRealmModule>()
    for (const d of docs) {
      try {
        modules.set(d, moduleOf(d))
      } catch {
        // (not rendered: it fails, and so do the modules importing it, see `Realm.load`)
      }
    }
    realm = new Realm(modules).load()
    realms.set(id, realm)
  }
  return realm
}

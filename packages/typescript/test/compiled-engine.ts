// Test-only compiled-validator engine: compiles any validated type at runtime with
// `new Function` (shipped code never does — generated modules carry their checks), so the
// validator specs can run unchanged against compiled checks. Installed for the `compiled`
// vitest project by compiled-engine.setup.ts.
import type { TAtscriptAnnotatedType } from '../src/runtime/annotated-type'
import { buildLayout, type TClassifyType } from '../src/runtime/compiled-check/build-layout'
import { emitCheckFactory } from '../src/runtime/compiled-check/emit'
import { LAYOUT_VERSION } from '../src/runtime/compiled-check/layout'
import {
  __setAutoCompile,
  compiledCheckFor,
  registerCompiledCheck,
  type TCompiledFactory,
} from '../src/runtime/compiled-check/registry'
import { invalidateCompiledValidators } from '../src/runtime/compiled-check/tracking'
import { COMPILED_ENV, getRegex } from '../src/runtime/validator-fast-check'

/** `true` when the specs run against compiled checks. */
export const COMPILED_ENGINE = process.env.ATSCRIPT_VALIDATOR_ENGINE === 'compiled'

/** Turns factory source into a factory (test code only). */
export function factoryFromSource(src: string): TCompiledFactory {
  // oxlint-disable-next-line no-new-func
  return new Function(`return ${src}`)() as TCompiledFactory
}

const attempted = new WeakSet<object>()

/**
 * Compiles and registers a compiled check for `def` from its live tree (`classify` marks
 * nodes compiled as cross-module / interpreted sites, like a generated module's model).
 */
export function compileType(def: TAtscriptAnnotatedType, classify?: TClassifyType): void {
  if (attempted.has(def)) {
    return
  }
  attempted.add(def)
  const layout = buildLayout(def, { regex: getRegex }, classify)
  registerCompiledCheck(def, LAYOUT_VERSION, layout, factoryFromSource(emitCheckFactory(layout)))
}

/** Installs the auto-compile hook (every validated type gets a compiled check). */
export function installCompiledEngine(): void {
  __setAutoCompile(def => {
    try {
      compileType(def)
    } catch {
      // not compilable (e.g. an invalid pattern): stays interpreted
    }
  })
}

/** The bound compiled check of `def` (`null`: not compiled or not bound). */
export function boundCheck(def: TAtscriptAnnotatedType) {
  return compiledCheckFor(def, COMPILED_ENV)
}

/**
 * After a raw (untracked) write to a type tree: compiled checks must be told (see
 * `invalidateCompiledValidators`). A no-op for the interpreted engine.
 */
export function afterRawWrite(): void {
  if (COMPILED_ENGINE) {
    invalidateCompiledValidators()
  }
}

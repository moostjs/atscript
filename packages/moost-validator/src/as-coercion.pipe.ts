import { coerceForType, coerceScalar, isAnnotatedType } from '@atscript/typescript/utils'
import { definePipeFn, Pipe, TPipePriority } from 'moost'

/**
 * Param sources that arrive as strings over the wire and are safe to coerce
 * by default. `BODY` is deliberately excluded — coercing JSON bodies silently
 * loosens the API contract; opt in via {@link TCoercionOptions.sources}.
 */
const DEFAULT_SOURCES = ['ROUTE', 'QUERY', 'QUERY_ITEM']

/** Options for configuring {@link coercionPipe} behavior. */
export interface TCoercionOptions {
  /**
   * Param sources (`paramSource` metadata stamped by Moost resolvers) the
   * pipe coerces. Defaults to `['ROUTE', 'QUERY', 'QUERY_ITEM']` — the
   * string-transport sources. Add `'BODY'` to opt in to body coercion.
   */
  sources?: string[]
}

/**
 * **coercionPipe** ─ Creates a Moost *pipe* that coerces string-transport
 * input (route params, query strings) toward the parameter's declared type
 * before validation runs.
 *
 * For atscript-annotated types it delegates to `coerceForType` from
 * `@atscript/typescript/utils` (scalars, unions, `@Query()` DTOs, arrays).
 * For plain design types (`offset: number`, `flag: boolean`, `since: Date`)
 * it falls back to direct constructor-based coercion — this also covers
 * scalar `.as` aliases under tsc's `emitDecoratorMetadata`, where the alias
 * identity collapses to `Number`.
 *
 * Coercion never throws and never validates — unparsable input passes
 * through unchanged for {@link validatorPipe} to report. The pipe is
 * registered at {@link TPipePriority.TRANSFORM}, so it composes ahead of
 * `validatorPipe` (VALIDATE):
 *
 * @example
 * ```ts
 * const app = new Moost()
 * app.applyGlobalPipes(coercionPipe(), validatorPipe())
 *
 * // KafkaOffset: @expect.int @expect.min 0 → export type KafkaOffset = number
 * ‎@Get('topics/:topic')
 * read(@Param('offset') offset: KafkaOffset) {
 *   // offset is a validated number — no manual Number.parseInt
 * }
 * ```
 *
 * @param opts {@link TCoercionOptions}.
 * @returns A ready‑to‑use `PipeFn` instance.
 */
export const coercionPipe = (opts?: TCoercionOptions) => {
  const sources = new Set(opts?.sources ?? DEFAULT_SOURCES)
  return definePipeFn<any>((value, metas) => {
    const source = metas?.targetMeta?.paramSource
    if (!source || !sources.has(source)) {
      return value
    }
    const t = metas?.targetMeta?.type
    if (isAnnotatedType(t)) {
      return coerceForType(t, value)
    }
    if (t === Number) {
      return coerceScalar('number', value)
    }
    if (t === Boolean) {
      return coerceScalar('boolean', value)
    }
    if (t === Date) {
      return coerceDate(value)
    }
    return value
  }, TPipePriority.TRANSFORM)
}

/**
 * Syntactic sugar decorator that applies {@link coercionPipe} to a handler or
 * an entire controller class.
 *
 * @param opts {@link TCoercionOptions}.
 *
 * @example
 * ```ts
 * ‎@Get('items')
 * ‎@UseCoercionPipe()
 * list(@Query() query: SearchQuery) {}
 * ```
 */
export const UseCoercionPipe = (opts?: TCoercionOptions) => Pipe(coercionPipe(opts))

// Date has no atscript designType, so its parse rule lives here rather than
// in the runtime's coerceScalar.
function coerceDate(value: unknown): unknown {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return value
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed
}

import type { TAtscriptAnnotatedType } from './annotated-type'
import { forAnnotatedType } from './traverse'

/** A JSON Schema object (draft-compatible). */
export type TJsonSchema = Record<string, any>

/**
 * Builds a JSON Schema from an {@link TAtscriptAnnotatedType}.
 *
 * Translates the atscript type structure and validation metadata
 * (min/max, patterns, integer constraints, etc.) into a standard JSON Schema.
 *
 * @example
 * ```ts
 * import { buildJsonSchema } from '@atscript/typescript'
 *
 * const schema = buildJsonSchema(MyInterface)
 * // { type: 'object', properties: { ... }, required: [...] }
 * ```
 *
 * @param type - The annotated type to convert.
 * @returns A JSON Schema object.
 */
export function buildJsonSchema(type: TAtscriptAnnotatedType): TJsonSchema {
  const build = (def: TAtscriptAnnotatedType): TJsonSchema => {
    const meta = def.metadata
    return forAnnotatedType(def, {
      object(d) {
        const properties: Record<string, TJsonSchema> = {}
        const required: string[] = []
        for (const [key, val] of d.type.props.entries()) {
          properties[key] = build(val)
          if (!val.optional) {
            required.push(key)
          }
        }
        const schema: TJsonSchema = { type: 'object', properties }
        if (required.length) {
          schema.required = required
        }
        return schema
      },
      array(d) {
        const schema: TJsonSchema = { type: 'array', items: build(d.type.of) }
        const minLength = meta.get('expect.minLength')
        if (typeof minLength === 'number') {
          schema.minItems = minLength
        }
        const maxLength = meta.get('expect.maxLength')
        if (typeof maxLength === 'number') {
          schema.maxItems = maxLength
        }
        return schema
      },
      union(d) {
        return { anyOf: d.type.items.map(build) }
      },
      intersection(d) {
        return { allOf: d.type.items.map(build) }
      },
      tuple(d) {
        return { type: 'array', items: d.type.items.map(build), additionalItems: false }
      },
      final(d) {
        const schema: TJsonSchema = {}
        if (d.type.value !== undefined) {
          schema.const = d.type.value
        }
        if (d.type.designType && d.type.designType !== 'any') {
          schema.type = d.type.designType === 'undefined' ? 'null' : d.type.designType
          if (schema.type === 'number' && meta.get('expect.int')) {
            schema.type = 'integer'
          }
        }
        if (schema.type === 'string') {
          const minLength = meta.get('expect.minLength')
          if (typeof minLength === 'number') {
            schema.minLength = minLength
          }
          const maxLength = meta.get('expect.maxLength')
          if (typeof maxLength === 'number') {
            schema.maxLength = maxLength
          }
          const patterns = meta.get('expect.pattern') as Array<{ pattern: string }> | undefined
          if (patterns?.length) {
            if (patterns.length === 1) {
              schema.pattern = patterns[0].pattern
            } else {
              schema.allOf = (schema.allOf || []).concat(patterns.map(p => ({ pattern: p.pattern })))
            }
          }
        }
        if (schema.type === 'number' || schema.type === 'integer') {
          const min = meta.get('expect.min')
          if (typeof min === 'number') {
            schema.minimum = min
          }
          const max = meta.get('expect.max')
          if (typeof max === 'number') {
            schema.maximum = max
          }
        }
        return schema
      },
    })
  }
  return build(type)
}

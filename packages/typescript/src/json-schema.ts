import {
  TAtscriptAnnotatedType,
  TAtscriptTypeArray,
  TAtscriptTypeComplex,
  TAtscriptTypeFinal,
  TAtscriptTypeObject,
} from './annotated-type'

export type TJsonSchema = Record<string, any>

export function buildJsonSchema(type: TAtscriptAnnotatedType): TJsonSchema {
  const build = (def: TAtscriptAnnotatedType): TJsonSchema => {
    const t = def.type as any
    const meta = def.metadata
    switch (t.kind) {
      case 'object': {
        const obj = t as TAtscriptTypeObject<string>
        const properties: Record<string, TJsonSchema> = {}
        const required: string[] = []
        for (const [key, val] of obj.props.entries()) {
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
      }
      case 'array': {
        const arr = t as TAtscriptTypeArray
        const schema: TJsonSchema = { type: 'array', items: build(arr.of) }
        const minLength = meta.get('expect.minLength')
        if (typeof minLength === 'number') {
          schema.minItems = minLength
        }
        const maxLength = meta.get('expect.maxLength')
        if (typeof maxLength === 'number') {
          schema.maxItems = maxLength
        }
        return schema
      }
      case 'union': {
        const grp = t as TAtscriptTypeComplex
        return { anyOf: grp.items.map(build) }
      }
      case 'intersection': {
        const grp = t as TAtscriptTypeComplex
        return { allOf: grp.items.map(build) }
      }
      case 'tuple': {
        const grp = t as TAtscriptTypeComplex
        return { type: 'array', items: grp.items.map(build), additionalItems: false }
      }
      case '': {
        const fin = t as TAtscriptTypeFinal
        const schema: TJsonSchema = {}
        if (fin.value !== undefined) {
          schema.const = fin.value
        }
        if (fin.designType && fin.designType !== 'any') {
          schema.type = fin.designType === 'undefined' ? 'null' : fin.designType
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
      }
      default:
        return {}
    }
  }
  return build(type)
}

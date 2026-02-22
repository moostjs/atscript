import {
  defineAnnotatedType,
  isPhantomType,
  type TAtscriptAnnotatedType,
  type TAtscriptTypeFinal,
  type TAtscriptTypeObject,
} from './annotated-type'
import { forAnnotatedType } from './traverse'

/** A JSON Schema object (draft-compatible). */
export type TJsonSchema = Record<string, any>

/**
 * Detects a discriminator property across union items.
 *
 * Scans all items for object-typed members that share a common property
 * with distinct const/literal values. If exactly one such property exists,
 * it is returned as the discriminator.
 */
function detectDiscriminator(
  items: TAtscriptAnnotatedType[]
): { propertyName: string; mapping: Record<string, string> } | null {
  if (items.length < 2) {
    return null
  }

  // All items must be objects
  for (const item of items) {
    if (item.type.kind !== 'object') {
      return null
    }
  }

  // Collect candidate prop names: props that have a const value in the first item
  const firstObj = items[0].type as TAtscriptTypeObject<string>
  const candidates: string[] = []
  for (const [propName, propType] of firstObj.props.entries()) {
    if (propType.type.kind === '' && (propType.type as TAtscriptTypeFinal).value !== undefined) {
      candidates.push(propName)
    }
  }

  // Filter candidates: must exist with a const value in ALL items, all values must be distinct
  const validCandidates: Array<{ propertyName: string; mapping: Record<string, string> }> = []

  for (const candidate of candidates) {
    const values = new Set<string | number | boolean>()
    const mapping: Record<string, string> = {}
    let valid = true

    for (let i = 0; i < items.length; i++) {
      const obj = items[i].type as TAtscriptTypeObject<string>
      const prop = obj.props.get(candidate)
      if (!prop || prop.type.kind !== '' || (prop.type as TAtscriptTypeFinal).value === undefined) {
        valid = false
        break
      }
      const val = (prop.type as TAtscriptTypeFinal).value!
      if (values.has(val)) {
        valid = false
        break
      }
      values.add(val)
      mapping[String(val)] = `#/oneOf/${i}`
    }

    if (valid) {
      validCandidates.push({ propertyName: candidate, mapping })
    }
  }

  // Exactly one qualifying prop → use it as discriminator
  if (validCandidates.length === 1) {
    return validCandidates[0]
  }

  return null
}

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
      phantom() {
        return {}
      },
      object(d) {
        const properties: Record<string, TJsonSchema> = {}
        const required: string[] = []
        for (const [key, val] of d.type.props.entries()) {
          if (isPhantomType(val)) {
            continue
          }
          properties[key] = build(val)
          if (!val.optional) {
            required.push(key)
          }
        }
        const schema: TJsonSchema = { type: 'object', properties }
        if (required.length > 0) {
          schema.required = required
        }
        return schema
      },
      array(d) {
        const schema: TJsonSchema = { type: 'array', items: build(d.type.of) }
        const minLength = meta.get('expect.minLength')
        if (minLength) {
          schema.minItems = typeof minLength === 'number' ? minLength : minLength.length
        }
        const maxLength = meta.get('expect.maxLength')
        if (maxLength) {
          schema.maxItems = typeof maxLength === 'number' ? maxLength : maxLength.length
        }
        return schema
      },
      union(d) {
        const disc = detectDiscriminator(d.type.items)
        if (disc) {
          return {
            oneOf: d.type.items.map(build),
            discriminator: {
              propertyName: disc.propertyName,
              mapping: disc.mapping,
            },
          }
        }
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
          if (meta.get('meta.required')) {
            schema.minLength = 1
          }
          const minLength = meta.get('expect.minLength')
          if (minLength) {
            schema.minLength = typeof minLength === 'number' ? minLength : minLength.length
          }
          const maxLength = meta.get('expect.maxLength')
          if (maxLength) {
            schema.maxLength = typeof maxLength === 'number' ? maxLength : maxLength.length
          }
          const patterns = meta.get('expect.pattern') as Array<{ pattern: string }> | undefined
          if (patterns?.length) {
            if (patterns.length === 1) {
              schema.pattern = patterns[0].pattern
            } else {
              schema.allOf = (schema.allOf || []).concat(
                patterns.map(p => ({ pattern: p.pattern }))
              )
            }
          }
        }
        if (schema.type === 'number' || schema.type === 'integer') {
          const min = meta.get('expect.min')
          if (min) {
            schema.minimum = typeof min === 'number' ? min : min.minValue
          }
          const max = meta.get('expect.max')
          if (max) {
            schema.maximum = typeof max === 'number' ? max : max.maxValue
          }
        }
        return schema
      },
    })
  }
  return build(type)
}

/**
 * Converts a JSON Schema object into a {@link TAtscriptAnnotatedType}.
 *
 * This is the inverse of {@link buildJsonSchema}. A round-trip
 * `buildJsonSchema(fromJsonSchema(schema))` preserves structure and constraints.
 *
 * Supports the JSON Schema subset produced by `buildJsonSchema` plus
 * common extensions like `oneOf` (treated as union) and `enum` (union of literals).
 *
 * @example
 * ```ts
 * import { fromJsonSchema } from '@atscript/typescript'
 *
 * const type = fromJsonSchema({ type: 'object', properties: { name: { type: 'string' } }, required: ['name'] })
 * type.validator().validate({ name: 'Alice' }) // passes
 * ```
 *
 * @param schema - A JSON Schema object.
 * @returns An annotated type with full validator support.
 */
export function fromJsonSchema(schema: TJsonSchema): TAtscriptAnnotatedType {
  const convert = (s: TJsonSchema): TAtscriptAnnotatedType => {
    if (!s || Object.keys(s).length === 0) {
      return defineAnnotatedType().designType('any').$type
    }

    if (s.$ref) {
      throw new Error('$ref is not supported by fromJsonSchema. Dereference the schema first.')
    }

    if ('const' in s) {
      const val = s.const
      const dt = val === null ? 'null' : (typeof val as TAtscriptTypeFinal['designType'])
      return defineAnnotatedType().designType(dt).value(val).$type
    }

    if (s.enum) {
      const handle = defineAnnotatedType('union')
      for (const val of s.enum) {
        const dt = val === null ? 'null' : (typeof val as TAtscriptTypeFinal['designType'])
        handle.item(defineAnnotatedType().designType(dt).value(val).$type)
      }
      return handle.$type
    }

    if (s.anyOf) {
      const handle = defineAnnotatedType('union')
      for (const item of s.anyOf) {
        handle.item(convert(item))
      }
      return handle.$type
    }

    if (s.oneOf) {
      const handle = defineAnnotatedType('union')
      for (const item of s.oneOf) {
        handle.item(convert(item))
      }
      return handle.$type
    }

    if (s.allOf && !s.type) {
      const handle = defineAnnotatedType('intersection')
      for (const item of s.allOf) {
        handle.item(convert(item))
      }
      return handle.$type
    }

    if (Array.isArray(s.type)) {
      const handle = defineAnnotatedType('union')
      for (const t of s.type) {
        handle.item(convert({ ...s, type: t }))
      }
      return handle.$type
    }

    if (s.type === 'object') {
      const handle = defineAnnotatedType('object')
      const required = new Set<string>(s.required || [])
      if (s.properties) {
        for (const [key, propSchema] of Object.entries(s.properties)) {
          const propType = convert(propSchema as TJsonSchema)
          if (!required.has(key)) {
            propType.optional = true
          }
          handle.prop(key, propType)
        }
      }
      return handle.$type
    }

    if (s.type === 'array') {
      if (Array.isArray(s.items)) {
        const handle = defineAnnotatedType('tuple')
        for (const item of s.items) {
          handle.item(convert(item))
        }
        return handle.$type
      }
      const itemType = s.items ? convert(s.items) : defineAnnotatedType().designType('any').$type
      const handle = defineAnnotatedType('array').of(itemType)
      if (typeof s.minItems === 'number') {
        handle.annotate('expect.minLength', { length: s.minItems })
      }
      if (typeof s.maxItems === 'number') {
        handle.annotate('expect.maxLength', { length: s.maxItems })
      }
      return handle.$type
    }

    if (s.type === 'string') {
      const handle = defineAnnotatedType().designType('string').tags('string')
      if (typeof s.minLength === 'number') {
        handle.annotate('expect.minLength', { length: s.minLength })
      }
      if (typeof s.maxLength === 'number') {
        handle.annotate('expect.maxLength', { length: s.maxLength })
      }
      if (s.pattern) {
        handle.annotate('expect.pattern', { pattern: s.pattern }, true)
      }
      if (s.allOf) {
        for (const item of s.allOf) {
          if (item.pattern) {
            handle.annotate('expect.pattern', { pattern: item.pattern }, true)
          }
        }
      }
      return handle.$type
    }

    if (s.type === 'integer') {
      const handle = defineAnnotatedType().designType('number').tags('number')
      handle.annotate('expect.int', true)
      if (typeof s.minimum === 'number') {
        handle.annotate('expect.min', { minValue: s.minimum })
      }
      if (typeof s.maximum === 'number') {
        handle.annotate('expect.max', { maxValue: s.maximum })
      }
      return handle.$type
    }

    if (s.type === 'number') {
      const handle = defineAnnotatedType().designType('number').tags('number')
      if (typeof s.minimum === 'number') {
        handle.annotate('expect.min', { minValue: s.minimum })
      }
      if (typeof s.maximum === 'number') {
        handle.annotate('expect.max', { maxValue: s.maximum })
      }
      return handle.$type
    }

    if (s.type === 'boolean') {
      return defineAnnotatedType().designType('boolean').tags('boolean').$type
    }

    if (s.type === 'null') {
      return defineAnnotatedType().designType('null').tags('null').$type
    }

    return defineAnnotatedType().designType('any').$type
  }

  return convert(schema)
}

import {
  defineAnnotatedType,
  isAnnotatedType,
  isPhantomType,
  propAtChain,
  type TAnnotatedTypeHandle,
  type TAtscriptAnnotatedType,
  type TAtscriptTypeArray,
  type TAtscriptTypeComplex,
  type TAtscriptTypeFinal,
  type TAtscriptTypeObject,
} from './annotated-type'
import { metaEmpty } from './layers'
import { jsonSchemaPattern } from './stateless-regex'
import { forAnnotatedType, runWalk, type TWalk } from './traverse'
import { uniqueName } from './unique-name'
import { arrayKeyProps, boundOf, DECIMAL_RE, VALIDATOR_KEYS } from './validator-keys'

/** A JSON Schema object (draft-compatible). */
export type TJsonSchema = Record<string, any>

/**
 * Describes a discriminator property shared by all variants of a union.
 *
 * Returned by {@link detectDiscriminator} when a union qualifies as a
 * discriminated (a.k.a. tagged) union — every variant is an object that
 * carries the same literal-valued property with a distinct value.
 */
export type TUnionDiscriminator = {
  /** Name of the discriminator property shared by all variants. */
  propertyName: string
  /** Maps the literal value of `propertyName` → variant index in `items`. */
  indexMapping: Record<string, number>
}

/**
 * Detects a discriminator property across union items.
 *
 * Scans all items for object-typed members that share a common property
 * with distinct const/literal values. If exactly one such property exists,
 * it is returned as the discriminator. Returns `null` when no qualifying
 * property exists, or when more than one does (ambiguous).
 */
export function detectDiscriminator(items: TAtscriptAnnotatedType[]): TUnionDiscriminator | null {
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
  let result: TUnionDiscriminator | null = null

  for (const candidate of candidates) {
    const values = new Set<string | number | boolean>()
    const indexMapping: Record<string, number> = {}
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
      indexMapping[String(val)] = i
    }

    if (valid) {
      // More than one qualifying prop → ambiguous, no discriminator
      if (result) {
        return null
      }
      result = { propertyName: candidate, indexMapping }
    }
  }

  return result
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
  /**
   * `$defs` entries by type def (identity): named objects (always extracted) and types found
   * recursive (`type Json = string | Json[]`), with the name each asks for (its id). Names are
   * given once all are known (see `nameDefs`), so references are filled in at the end.
   */
  const defs = new Map<object, { base: string; schema: TJsonSchema; named?: boolean }>()
  /** References to `$defs` entries, filled in by `nameDefs`: `[holder, key, type def]`. */
  const refs: Array<[Record<string, unknown>, string, object]> = []
  /** A `$ref` to the `$defs` entry of `typeDef`. */
  /** The `$ref` schemas (filled in at the end: empty until then). */
  const refSchemas = new WeakSet<TJsonSchema>()
  const ref = (typeDef: object): TJsonSchema => {
    const schema: TJsonSchema = {}
    refs.push([schema, '$ref', typeDef])
    refSchemas.add(schema)
    return schema
  }
  /**
   * An optional prop's schema: the validator accepts `null` for an optional prop (like a
   * missing one), so its schema accepts `null` too — `type: [t, 'null']` for a schema of one
   * `type` (its other keywords apply to that type only), else `anyOf: [schema, null]`.
   */
  const nullable = (schema: TJsonSchema): TJsonSchema => {
    if (acceptsNull(schema, refSchemas)) {
      return schema
    }
    if (typeof schema.type === 'string' && !('const' in schema) && !schema.enum) {
      return { ...schema, type: [schema.type, 'null'] }
    }
    if (Object.keys(schema).length === 1 && Array.isArray(schema.anyOf)) {
      return { anyOf: [...schema.anyOf, { type: 'null' }] }
    }
    return { anyOf: [schema, { type: 'null' }] }
  }
  /**
   * Non-primitive type defs being built: `true` once re-entered (recursive). A named object
   * starts afresh: recursion through it ends at its `$ref`.
   */
  let building = new Map<object, boolean>()
  /**
   * Per type def, a node without metadata standing in for a declaration no reference leads
   * to (see `ownDef`).
   */
  const standIns = new Map<object, TAtscriptAnnotatedType>()
  const standIn = (def: TAtscriptAnnotatedType): TAtscriptAnnotatedType => {
    let node = standIns.get(def.type)
    if (!node) {
      node = { ...def, metadata: new Map(), optional: undefined } as TAtscriptAnnotatedType
      standIns.set(def.type, node)
    }
    return node
  }
  /** References being inlined with their own constraints (see `refTo`). */
  const inlining = new Set<TAtscriptAnnotatedType>()
  /** The types without an id the tree holds in several places (see `sharedDefs`). */
  const shared = sharedDefs(type)

  /** Reserves a `$defs` entry for `typeDef`, asking for name `base` (`named`: a type's id). */
  const reserve = (typeDef: object, base: string, named = false): object => {
    defs.set(typeDef, { base, schema: {}, named })
    return typeDef
  }

  /**
   * A reference to `$defs[name]`, built from `own` (the type's own metadata, see `ownDef`).
   * A reference whose constraints differ (`@expect.maxLength 3 a: Json`) is inlined with
   * them instead, its recursion referring to the shared definition.
   */
  function* refTo(
    typeDef: object,
    def: TAtscriptAnnotatedType,
    own: TAtscriptAnnotatedType
  ): TWalk<TJsonSchema> {
    if (def === own || inlining.has(def) || sameConstraints(def, own)) {
      return ref(typeDef)
    }
    inlining.add(def)
    const schema = (yield buildDef(def)) as TJsonSchema
    inlining.delete(def)
    return schema
  }

  function* buildObject(d: TAtscriptAnnotatedType): TWalk<TJsonSchema> {
    const properties: Record<string, TJsonSchema> = {}
    const required: string[] = []
    for (const [key, val] of (d.type as TAtscriptTypeObject<string>).props.entries()) {
      if (isPhantomType(val)) {
        continue
      }
      if (val.optional) {
        // (`@meta.required` on an optional prop: omitting it is fine, `null` is not)
        const schema = (yield build(val)) as TJsonSchema
        properties[key] = val.metadata.get('meta.required') ? schema : nullable(schema)
      } else {
        properties[key] = (yield build(val)) as TJsonSchema
        required.push(key)
      }
    }
    const schema: TJsonSchema = { type: 'object', properties }
    if (required.length > 0) {
      schema.required = required
    }
    const patterns = (d.type as TAtscriptTypeObject<string>).propsPatterns
    if (patterns.length > 0) {
      const built: Array<[RegExp, TJsonSchema]> = []
      for (const p of patterns) {
        built.push([p.pattern, (yield build(p.def)) as TJsonSchema])
      }
      schema.patternProperties = patternProperties(built, Object.keys(properties))
    }
    return schema
  }

  /** Whether the root is being built (its own node met again below it is a reference). */
  let rootEntered = false
  /** The schema of `def` (an explicit-stack walk, see `runWalk`: no recursion per level). */
  function* build(def: TAtscriptAnnotatedType): TWalk<TJsonSchema> {
    const typeDef = def.type
    // A primitive never recurses.
    if (typeDef.kind === '') {
      return (yield buildDef(def)) as TJsonSchema
    }
    // (the root itself — not a reference to it below it, the same node in a deserialized copy)
    const atRoot = def === type && !rootEntered
    rootEntered = true
    // Extract named object types into $defs (unless root level)
    if (def.id && typeDef.kind === 'object' && !atRoot) {
      if (!defs.has(typeDef)) {
        reserve(typeDef, def.id, true)
        const outer = building
        building = new Map()
        defs.get(typeDef)!.schema = (yield buildObject(def)) as TJsonSchema
        building = outer
      }
      return ref(typeDef)
    }
    if (defs.has(typeDef)) {
      return (yield refTo(typeDef, def, shared.get(typeDef)?.first ?? ownOf(def))) as TJsonSchema
    }
    // A type without an id held in several places (references, not copies): built
    // once, into $defs.
    const repeated = atRoot ? undefined : shared.get(typeDef)
    if (repeated && repeated.count > 1) {
      reserve(typeDef, repeated.key)
      const outer = building
      building = new Map()
      inlining.add(repeated.first)
      defs.get(typeDef)!.schema = (yield buildDef(repeated.first)) as TJsonSchema
      inlining.delete(repeated.first)
      building = outer
      return (yield refTo(typeDef, def, repeated.first)) as TJsonSchema
    }
    if (building.has(typeDef)) {
      // Re-entered: a recursive type, built into $defs (once its first build returns).
      building.set(typeDef, true)
      const own = ownOf(def)
      return (yield refTo(
        reserve(typeDef, own.id ?? 'Recursive', own.id !== undefined),
        def,
        own
      )) as TJsonSchema
    }
    building.set(typeDef, false)
    inlining.add(def)
    const schema = (yield buildDef(def)) as TJsonSchema
    inlining.delete(def)
    const recursive = building.get(typeDef)
    building.delete(typeDef)
    if (!recursive) {
      return schema
    }
    // Recursive: the shared body comes from the type's own metadata (built again only when
    // this use's constraints differ); the root stays inline (like a named object).
    const own = ownOf(def)
    const same = def === own || sameConstraints(def, own)
    defs.get(typeDef)!.schema = same ? schema : ((yield buildDef(own)) as TJsonSchema)
    return def === type || !same ? schema : ref(typeDef)
  }

  /** The node carrying `def`'s type's own metadata (see `ownDef`), memoized per node. */
  const owners = new Map<TAtscriptAnnotatedType, TAtscriptAnnotatedType>()
  const ownOf = (def: TAtscriptAnnotatedType) => {
    let own = owners.get(def)
    if (!own) {
      own = ownDef(def, type) ?? standIn(def)
      owners.set(def, own)
    }
    return own
  }

  /** The schema of `def`'s own type (see {@link build}). */
  function* buildDef(def: TAtscriptAnnotatedType): TWalk<TJsonSchema> {
    const meta = def.metadata
    const all = function* (items: TAtscriptAnnotatedType[]): TWalk<TJsonSchema[]> {
      const out: TJsonSchema[] = []
      for (const item of items) {
        out.push((yield build(item)) as TJsonSchema)
      }
      return out
    }
    const kind = def.type.kind
    if (kind === 'object') {
      return (yield buildObject(def)) as TJsonSchema
    }
    if (kind === 'array') {
      const d = def as TAtscriptAnnotatedType<TAtscriptTypeArray>
      const schema: TJsonSchema = { type: 'array', items: (yield build(d.type.of)) as TJsonSchema }
      applyArrayConstraints(schema, meta, d.type.of)
      return schema
    }
    if (kind === 'union' || kind === 'intersection' || kind === 'tuple') {
      const items = (def as TAtscriptAnnotatedType<TAtscriptTypeComplex>).type.items
      const built = (yield all(items)) as TJsonSchema[]
      if (kind === 'intersection') {
        return { allOf: built }
      }
      if (kind === 'tuple') {
        // (the validator wants exactly as many items)
        return {
          type: 'array',
          items: built,
          additionalItems: false,
          minItems: items.length,
          maxItems: items.length,
        }
      }
      const disc = detectDiscriminator(items)
      if (disc) {
        const mapping: Record<string, string> = {}
        for (const [val, idx] of Object.entries(disc.indexMapping)) {
          const itemType = items[idx].type
          if (defs.has(itemType)) {
            refs.push([mapping, val, itemType])
          } else {
            mapping[val] = `#/oneOf/${idx}`
          }
        }
        return {
          oneOf: built,
          discriminator: {
            propertyName: disc.propertyName,
            mapping,
          },
        }
      }
      if (!metaEmpty(meta)) {
        // Constraints annotated on the union itself (`@expect.min 0` on `number | null`)
        // go onto the members they apply to.
        applyUnionConstraints(built, meta, items)
      }
      return { anyOf: built }
    }
    return forAnnotatedType(def, {
      phantom() {
        return {}
      },
      final(d) {
        // (an impossible type: no value matches)
        if (d.type.designType === 'never') {
          return { not: {} }
        }
        const schema: TJsonSchema = {}
        if (d.type.value !== undefined) {
          schema.const = d.type.value
        }
        if (d.type.designType && d.type.designType !== 'any') {
          const dt = d.type.designType
          schema.type = dt === 'undefined' ? 'null' : dt === 'decimal' ? 'string' : dt
        }
        if (d.type.designType === 'decimal' && d.type.value === undefined) {
          // (the validator's decimal format)
          schema.pattern = DECIMAL_RE.source
        }
        applyScalarConstraints(schema, meta)
        return schema
      },
      object: unreachable,
      array: unreachable,
      union: unreachable,
      intersection: unreachable,
      tuple: unreachable,
    })
  }

  const schema = runWalk(build(type))
  if (defs.size === 0) {
    return schema
  }
  const same = sameDefs(defs, refs)
  for (const typeDef of defs.keys()) {
    if (same.get(typeDef) !== typeDef) {
      defs.delete(typeDef)
    }
  }
  const names = nameDefs(defs)
  for (const [holder, key, typeDef] of refs) {
    holder[key] = `#/$defs/${names.get(same.get(typeDef)!)}`
  }
  return {
    ...schema,
    $defs: Object.fromEntries([...defs].map(([typeDef, d]) => [names.get(typeDef)!, d.schema])),
  }
}

/**
 * The `$defs` entry each one is the same as (itself, or an earlier one): entries without a name
 * of their own (a merge reached at several places, a recursion of types without an id) whose
 * schemas are the same once their references are — the coarsest such partition (refined from
 * one class until stable), so a recursion written out at several places is one entry. A named
 * entry is only itself. `refs` are the references the schemas hold (filled in afterwards).
 */
function sameDefs(
  defs: Map<object, { schema: TJsonSchema; named?: boolean }>,
  refs: Array<[Record<string, unknown>, string, object]>
): Map<object, object> {
  const entries = [...defs.keys()]
  const index = new Map(entries.map((typeDef, i) => [typeDef, i]))
  /** The references each holder holds, by key: their entries' numbers. */
  const held = new Map<object, Map<string, number>>()
  for (const [holder, key, typeDef] of refs) {
    let keys = held.get(holder)
    if (!keys) {
      keys = new Map()
      held.set(holder, keys)
    }
    keys.set(key, index.get(typeDef)!)
  }
  let classes = entries.map((typeDef, i) => (defs.get(typeDef)!.named ? i + 1 : 0))
  // Each entry's schema written once, its references left as slots (`targets`: their entries,
  // in the order written): an entry's signature is its class, that text and its slots' classes.
  // (an object's keys and the `required` names in any order — a merge of the same members in
  // another order is the same schema —, so sorted)
  const targets: number[][] = entries.map(() => [])
  const texts = entries.map((typeDef, i) =>
    JSON.stringify(defs.get(typeDef)!.schema, (key, value: unknown) => {
      if (!value || typeof value !== 'object') {
        return value
      }
      if (Array.isArray(value)) {
        return key === 'required' ? [...(value as string[])].sort() : value
      }
      const keys = held.get(value)
      const out: Record<string, unknown> = keys
        ? { ...value, '\u0000': [...keys.keys()] }
        : (value as Record<string, unknown>)
      if (keys) {
        targets[i].push(...keys.values())
      }
      return Object.fromEntries(
        Object.keys(out)
          .sort()
          .map(k => [k, out[k]])
      )
    })
  )
  const textIds = new Map<string, number>()
  const shapes = texts.map(text => {
    let id = textIds.get(text)
    if (id === undefined) {
      id = textIds.size
      textIds.set(text, id)
    }
    return id
  })
  const signature = (i: number) =>
    `${classes[i]}:${shapes[i]}:${targets[i].map(j => classes[j]).join(',')}`
  for (let count = new Set(classes).size; ; ) {
    const signatures = new Map<string, number>()
    const next = entries.map((_, i) => {
      const s = signature(i)
      let c = signatures.get(s)
      if (c === undefined) {
        c = signatures.size
        signatures.set(s, c)
      }
      return c
    })
    classes = next
    if (signatures.size === count) {
      break
    }
    count = signatures.size
  }
  const first = new Map<number, object>()
  const out = new Map<object, object>()
  entries.forEach((typeDef, i) => {
    if (!first.has(classes[i])) {
      first.set(classes[i], typeDef)
    }
    out.set(typeDef, first.get(classes[i])!)
  })
  return out
}

/**
 * `$defs` names: the name each entry asks for, unless an earlier entry asks for it too — then
 * the first free `<name>_<n>` that no entry asks for (a type named `Helper_1` keeps its name).
 */
function nameDefs(defs: Map<object, { base: string }>): Map<object, string> {
  const asked = new Set([...defs.values()].map(d => d.base))
  const taken = new Set<string>()
  const names = new Map<object, string>()
  for (const [typeDef, { base }] of defs) {
    const name = uniqueName(base, n => taken.has(n) || (n !== base && asked.has(n)), '_')
    taken.add(name)
    names.set(typeDef, name)
  }
  return names
}

/**
 * The node carrying a type's own metadata: following references (a chained one through the
 * props it names) to the declaration that shares the type def — a reference also carries its
 * own annotations. `def` itself for the root; `undefined` when `def` is a use whose declaration
 * is unknown (no `ref`, e.g. a deserialized type): its metadata may be the use's own.
 */
function ownDef(
  def: TAtscriptAnnotatedType,
  root: TAtscriptAnnotatedType
): TAtscriptAnnotatedType | undefined {
  if (def === root) {
    return def
  }
  let own = def
  for (
    const seen = new Set<TAtscriptAnnotatedType>();
    own !== root && own.ref && !seen.has(own);
  ) {
    seen.add(own)
    const ref = own.ref.type()
    const target = isAnnotatedType(ref)
      ? propAtChain(ref, own.ref.field ? own.ref.field.split('.') : [])
      : undefined
    if (!isAnnotatedType(target) || target.type !== def.type) {
      break
    }
    own = target
  }
  return own === def && !def.ref ? undefined : own
}

/**
 * The non-primitive types without an id `root`'s tree holds in more than one place (by type
 * def), with the first node holding each and the prop it was found under (the `$defs` name it
 * asks for). Named objects are extracted anyway (their bodies counted once).
 */
function sharedDefs(
  root: TAtscriptAnnotatedType
): Map<object, { count: number; first: TAtscriptAnnotatedType; key: string }> {
  const out = new Map<object, { count: number; first: TAtscriptAnnotatedType; key: string }>()
  const walked = new Set<object>()
  /** The types being walked (a type met again among them is recursive: named so). */
  const walking = new Set<object>()
  /** Pending visits, last first (`leave`: a type's children are done). */
  const stack: Array<
    { node: TAtscriptAnnotatedType | undefined; key: string } | { leave: object }
  > = [{ node: root, key: 'Shared' }]
  for (let step = stack.pop(); step; step = stack.pop()) {
    if ('leave' in step) {
      walking.delete(step.leave)
      continue
    }
    const { node, key } = step
    const type = node?.type
    if (!node || !type || type.kind === '') {
      continue
    }
    if (!node.id && node !== root) {
      const known = out.get(type)
      if (known) {
        known.count++
        if (walking.has(type)) {
          known.key = 'Recursive'
        }
        continue
      }
      out.set(type, { count: 1, first: node, key })
    }
    if (walked.has(type)) {
      continue
    }
    walked.add(type)
    walking.add(type)
    const children: Array<{ node: TAtscriptAnnotatedType; key: string }> = []
    if (type.kind === 'object') {
      for (const [k, prop] of (type as TAtscriptTypeObject<string>).props) {
        children.push({ node: prop, key: k })
      }
      for (const { def } of (type as TAtscriptTypeObject<string>).propsPatterns) {
        children.push({ node: def, key })
      }
    } else if (type.kind === 'array') {
      children.push({ node: (type as TAtscriptTypeArray).of, key })
    } else {
      for (const item of (type as TAtscriptTypeComplex).items) {
        children.push({ node: item, key })
      }
    }
    stack.push({ leave: type })
    for (let c = children.length - 1; c >= 0; c--) {
      stack.push(children[c])
    }
  }
  return out
}

/** A `forAnnotatedType` handler for kinds handled before it. */
function unreachable(): never {
  throw new Error('unreachable')
}

function withoutUniqueItems(meta: TMetadata): TMetadata {
  if (!meta.get('expect.array.uniqueItems')) {
    return meta
  }
  const copy = new Map(meta) as TMetadata
  copy.delete('expect.array.uniqueItems')
  return copy
}

/**
 * The `patternProperties` of an object's pattern props (`[/^k/]: T`): the validator checks a key
 * against them when the object declares no prop of that name, so each pattern excludes the
 * declared names (`^(?!(?:a|b)$)[\s\S]*?(?:pattern)`); a pattern written twice accepts what
 * either prop accepts. (A key matching several different patterns passes one of them in the
 * validator, all of them in JSON Schema: see the JSON Schema guide.)
 */
function patternProperties(
  patterns: Array<[RegExp, TJsonSchema]>,
  declared: string[]
): Record<string, TJsonSchema> {
  const exclude =
    declared.length > 0
      ? `^(?!(?:${declared.map(n => n.replaceAll(/[\\^$.*+?()[\]{}|/]/g, '\\$&')).join('|')})$)[\\s\\S]*?`
      : ''
  const out: Record<string, TJsonSchema> = {}
  for (const [regex, schema] of patterns) {
    const pattern = jsonSchemaPattern(regex.source, regex.flags)
    const key = exclude ? `${exclude}(?:${pattern})` : pattern
    const taken = out[key]
    out[key] = taken
      ? {
          anyOf: [
            ...(Object.keys(taken).length === 1 && taken.anyOf ? taken.anyOf : [taken]),
            schema,
          ],
        }
      : schema
  }
  return out
}

/** Whether `schema` accepts `null` as it is (`{}`, a `null` type or value, a union with one). */
function acceptsNull(schema: TJsonSchema, refs: WeakSet<TJsonSchema>): boolean {
  if (refs.has(schema)) {
    // (a `$ref`, filled in later: what it refers to is a named object or a recursive type)
    return false
  }
  if (Object.keys(schema).length === 0) {
    return true
  }
  if ('const' in schema) {
    return schema.const === null
  }
  if (schema.enum) {
    return schema.enum.includes(null)
  }
  if (schema.type !== undefined) {
    return schema.type === 'null' || (Array.isArray(schema.type) && schema.type.includes('null'))
  }
  return Array.isArray(schema.anyOf) && schema.anyOf.some(s => acceptsNull(s, refs))
}

/** `a` and `b` carry the same schema constraints. */
function sameConstraints(a: TAtscriptAnnotatedType, b: TAtscriptAnnotatedType): boolean {
  return (
    a.metadata === b.metadata ||
    VALIDATOR_KEYS.every(key => {
      const x = a.metadata.get(key)
      const y = b.metadata.get(key)
      return x === y || JSON.stringify(x) === JSON.stringify(y)
    })
  )
}

type TMetadata = TAtscriptAnnotatedType['metadata']

/**
 * `@expect.minLength` / `maxLength` → `minItems` / `maxItems` on an array schema, and
 * `@expect.array.uniqueItems` → `uniqueItems` unless the items are objects with
 * `@expect.array.key` props (unique by those props: JSON Schema compares whole items).
 */
function applyArrayConstraints(
  schema: TJsonSchema,
  meta: TMetadata,
  of?: TAtscriptAnnotatedType
): void {
  if (meta.get('expect.array.uniqueItems') && arrayKeyProps(of).length === 0) {
    schema.uniqueItems = true
  }
  const minLength = meta.get('expect.minLength')
  if (minLength !== undefined) {
    schema.minItems = boundOf(minLength, 'length')
  }
  const maxLength = meta.get('expect.maxLength')
  if (maxLength !== undefined) {
    schema.maxItems = boundOf(maxLength, 'length')
  }
}

/** String / number constraints on a scalar schema whose `type` is already set. */
function applyScalarConstraints(schema: TJsonSchema, meta: TMetadata): void {
  if (schema.type === 'number' && meta.get('expect.int')) {
    schema.type = 'integer'
  }
  if (schema.type === 'string') {
    if (meta.get('meta.required')) {
      schema.minLength = 1
    }
    const minLength = meta.get('expect.minLength')
    if (minLength !== undefined) {
      schema.minLength = boundOf(minLength, 'length')
    }
    const maxLength = meta.get('expect.maxLength')
    if (maxLength !== undefined) {
      schema.maxLength = boundOf(maxLength, 'length')
    }
    const patterns = (
      (meta.get('expect.pattern') as Array<{ pattern: string; flags?: string }> | undefined) ?? []
    ).map(p => jsonSchemaPattern(p.pattern, p.flags))
    if (meta.get('meta.required')) {
      // (the validator wants a character other than whitespace)
      patterns.push('\\S')
    }
    if (schema.pattern !== undefined) {
      // (a decimal's format)
      patterns.unshift(schema.pattern)
      delete schema.pattern
    }
    if (patterns.length === 1 && !schema.allOf) {
      schema.pattern = patterns[0]
    } else if (patterns.length > 0) {
      schema.allOf = (schema.allOf || []).concat(patterns.map(pattern => ({ pattern })))
    }
  }
  if (schema.type === 'boolean' && meta.get('meta.required')) {
    // (the validator wants `true`)
    schema.const = true
  }
  if (schema.type === 'number' || schema.type === 'integer') {
    const min = meta.get('expect.min')
    if (min !== undefined) {
      schema.minimum = boundOf(min, 'minValue')
    }
    const max = meta.get('expect.max')
    if (max !== undefined) {
      schema.maximum = boundOf(max, 'maxValue')
    }
    const exMin = meta.get('expect.exclusiveMin')
    if (exMin !== undefined) {
      schema.exclusiveMinimum = boundOf(exMin, 'exclusiveMinValue')
    }
    const exMax = meta.get('expect.exclusiveMax')
    if (exMax !== undefined) {
      schema.exclusiveMaximum = boundOf(exMax, 'exclusiveMaxValue')
    }
  }
}

const LOWER_BOUNDS = new Set(['minimum', 'exclusiveMinimum', 'minLength', 'minItems'])
const UPPER_BOUNDS = new Set(['maximum', 'exclusiveMaximum', 'maxLength', 'maxItems'])

/**
 * Puts union-level constraints onto the matching `anyOf` members (numbers, strings,
 * arrays; nested `anyOf` members recursively). When a member already has the same
 * bound, the stricter one wins; patterns accumulate.
 */
function applyUnionConstraints(
  members: TJsonSchema[],
  meta: TMetadata,
  /** the member types (`members[i]` built from `types[i]`), when known */
  types?: TAtscriptAnnotatedType[]
): void {
  for (const [i, member] of members.entries()) {
    const memberType = types?.[i]
    if (Array.isArray(member.anyOf)) {
      applyUnionConstraints(
        member.anyOf,
        meta,
        memberType?.type.kind === 'union' ? memberType.type.items : undefined
      )
      continue
    }
    // A literal member is exempt, as in the validator: its value is fixed.
    if (member.const !== undefined) {
      continue
    }
    const type = member.type
    const extra: TJsonSchema = { type }
    if (type === 'array') {
      // (`uniqueItems` only when the item type is known: unique by key props otherwise)
      const of = memberType?.type.kind === 'array' ? memberType.type.of : undefined
      applyArrayConstraints(extra, of ? meta : withoutUniqueItems(meta), of)
    } else if (type === 'string' || type === 'number' || type === 'integer') {
      applyScalarConstraints(extra, meta)
    } else {
      continue
    }
    if (extra.type === 'integer') {
      member.type = 'integer'
    }
    for (const [key, value] of Object.entries(extra)) {
      if (key === 'type') {
        continue
      }
      if (key === 'pattern' || key === 'allOf') {
        const patterns = key === 'pattern' ? [{ pattern: value }] : (value as TJsonSchema[])
        if (member.pattern === undefined && key === 'pattern' && !member.allOf) {
          member.pattern = value
        } else {
          member.allOf = (member.allOf || []).concat(patterns)
        }
      } else if (member[key] === undefined) {
        member[key] = value
      } else if (LOWER_BOUNDS.has(key)) {
        member[key] = Math.max(member[key], value)
      } else if (UPPER_BOUNDS.has(key)) {
        member[key] = Math.min(member[key], value)
      }
    }
  }
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
  const defsSource = schema.$defs || schema.definitions || {}
  const resolved = new Map<string, TAtscriptAnnotatedType>()

  const convert = (s: TJsonSchema): TAtscriptAnnotatedType => {
    if (!s || Object.keys(s).length === 0) {
      return defineAnnotatedType().designType('any').$type
    }

    if (s.$ref) {
      const refName = s.$ref.replace(/^#\/(\$defs|definitions)\//, '')
      if (resolved.has(refName)) {
        return resolved.get(refName)!
      }
      if (defsSource[refName]) {
        // Insert placeholder before recursion to handle circular $refs
        const placeholder = defineAnnotatedType().designType('any').$type
        resolved.set(refName, placeholder)
        const type = convert(defsSource[refName])
        resolved.set(refName, type)
        return type
      }
      throw new Error(`Unresolvable $ref: ${s.$ref}`)
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
          const optional = !required.has(key)
          const propType = convert(
            optional ? withoutNullType(propSchema as TJsonSchema) : (propSchema as TJsonSchema)
          )
          if (optional) {
            propType.optional = true
          }
          handle.prop(key, propType)
        }
      }
      for (const [pattern, propSchema] of Object.entries(s.patternProperties ?? {})) {
        handle.propPattern(compilePattern(pattern), convert(propSchema as TJsonSchema))
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
      annotateNumberBounds(handle, s)
      return handle.$type
    }

    if (s.type === 'number') {
      const handle = defineAnnotatedType().designType('number').tags('number')
      annotateNumberBounds(handle, s)
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

/** A JSON Schema pattern as a regex (compiled with `u`, like ajv; without when it must). */
function compilePattern(pattern: string): RegExp {
  try {
    return new RegExp(pattern, 'u')
  } catch {
    return new RegExp(pattern)
  }
}

/**
 * An optional prop's schema without the `null` its `type` lists (`buildJsonSchema` adds it: an
 * optional prop passes `null`), so the prop round-trips as `p?: T`.
 */
function withoutNullType(s: TJsonSchema): TJsonSchema {
  if (!Array.isArray(s.type) || !s.type.includes('null') || s.type.length < 2) {
    return s
  }
  const types = s.type.filter((t: string) => t !== 'null')
  return { ...s, type: types.length === 1 ? types[0] : types }
}

/**
 * Maps `minimum` / `maximum` / `exclusiveMinimum` / `exclusiveMaximum` onto
 * `@expect.min` / `max` / `exclusiveMin` / `exclusiveMax`. Also reads the draft-4 form,
 * where `exclusiveMinimum: true` makes `minimum` exclusive.
 */
function annotateNumberBounds(handle: TAnnotatedTypeHandle, s: TJsonSchema): void {
  if (typeof s.minimum === 'number') {
    if (s.exclusiveMinimum === true) {
      handle.annotate('expect.exclusiveMin', { exclusiveMinValue: s.minimum })
    } else {
      handle.annotate('expect.min', { minValue: s.minimum })
    }
  }
  if (typeof s.maximum === 'number') {
    if (s.exclusiveMaximum === true) {
      handle.annotate('expect.exclusiveMax', { exclusiveMaxValue: s.maximum })
    } else {
      handle.annotate('expect.max', { maxValue: s.maximum })
    }
  }
  if (typeof s.exclusiveMinimum === 'number') {
    handle.annotate('expect.exclusiveMin', { exclusiveMinValue: s.exclusiveMinimum })
  }
  if (typeof s.exclusiveMaximum === 'number') {
    handle.annotate('expect.exclusiveMax', { exclusiveMaxValue: s.exclusiveMaximum })
  }
}

/**
 * Merges multiple annotated types into a combined schema map with shared `$defs`.
 *
 * Each type must have an `id`. The returned `schemas` object contains individual
 * schemas keyed by type id, and `$defs` contains all shared type definitions
 * deduplicated across schemas: a definition equal to one already merged (the same schema,
 * its references leading to equal definitions) is shared; a different one asking for a name
 * already taken (two types named alike) gets the next free `<name>_<n>`, and the references
 * to it are renamed.
 *
 * @param types - Array of annotated types, each with an `id`.
 * @returns An object with `schemas` (keyed by id) and shared `$defs`.
 */
export function mergeJsonSchemas(types: TAtscriptAnnotatedType[]): {
  schemas: Record<string, TJsonSchema>
  $defs: Record<string, TJsonSchema>
} {
  const mergedDefs: Record<string, TJsonSchema> = {}
  const schemas: Record<string, TJsonSchema> = {}

  for (const type of types) {
    const name = type.id
    if (!name) {
      throw new Error('mergeJsonSchemas: all types must have an id')
    }
    const { $defs: defs, ...schema } = buildJsonSchema(type)
    if (!defs) {
      schemas[name] = schema
      continue
    }
    const local = defs as Record<string, TJsonSchema>
    /** The merged name of each of this schema's `$defs` entries. */
    const renamed = new Map<string, string>()
    for (const defName of Object.keys(local)) {
      const family = defName.replace(/_\d+$/, '')
      const same = Object.keys(mergedDefs).find(
        merged =>
          merged.replace(/_\d+$/, '') === family &&
          sameSchema(local[defName], local, mergedDefs[merged], mergedDefs, new Set())
      )
      renamed.set(
        defName,
        same ??
          (defName in mergedDefs || [...renamed.values()].includes(defName)
            ? uniqueName(family, n => n in mergedDefs || [...renamed.values()].includes(n), '_')
            : defName)
      )
    }
    for (const [defName, merged] of renamed) {
      if (!(merged in mergedDefs)) {
        mergedDefs[merged] = renameRefs(local[defName], renamed)
      }
    }
    schemas[name] = renameRefs(schema, renamed)
  }

  return { schemas, $defs: mergedDefs }
}

const DEF_REF = /^#\/\$defs\/(.+)$/

/** The `$defs` entry a reference string names (`#/$defs/<name>`), if it is one. */
function defRef(value: unknown): string | undefined {
  return typeof value === 'string' ? DEF_REF.exec(value)?.[1] : undefined
}

/**
 * What a value of a schema is: a schema (or any other value), a discriminator, its mapping, or a
 * reference (`$ref`, a mapping value).
 */
type TSchemaPart = 'schema' | 'discriminator' | 'mapping' | 'ref'

/** What `holder[key]` is, `holder` being a `part`. */
function partOf(part: TSchemaPart, key: string): TSchemaPart {
  if (part === 'mapping' || key === '$ref') {
    return 'ref'
  }
  if (part === 'discriminator' && key === 'mapping') {
    return 'mapping'
  }
  return key === 'discriminator' ? 'discriminator' : 'schema'
}

/**
 * Whether `a` (in a schema with `$defs` `defsA`) and `b` (with `defsB`) are the same schema:
 * equal, their references (`$ref`, discriminator mappings) leading to the same schemas.
 * `assumed`: the pairs of entries being compared (a recursive one is the same unless shown
 * otherwise).
 */
function sameSchema(
  a: unknown,
  defsA: Record<string, TJsonSchema>,
  b: unknown,
  defsB: Record<string, TJsonSchema>,
  assumed: Set<string>,
  part: TSchemaPart = 'schema'
): boolean {
  const refA = part === 'ref' ? defRef(a) : undefined
  const refB = part === 'ref' ? defRef(b) : undefined
  if (refA !== undefined || refB !== undefined) {
    if (refA === undefined || refB === undefined) {
      return false
    }
    const pair = `${refA}\u0000${refB}`
    if (assumed.has(pair)) {
      return true
    }
    assumed.add(pair)
    return sameSchema(defsA[refA], defsA, defsB[refB], defsB, assumed)
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, i) => sameSchema(item, defsA, b[i], defsB, assumed))
    )
  }
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') {
    return a === b
  }
  const keysA = Object.keys(a)
  return (
    keysA.length === Object.keys(b).length &&
    keysA.every(
      key =>
        Object.hasOwn(b, key) &&
        sameSchema(
          (a as Record<string, unknown>)[key],
          defsA,
          (b as Record<string, unknown>)[key],
          defsB,
          assumed,
          partOf(part, key)
        )
    )
  )
}

/** `schema` with its references to `$defs` entries renamed by `renamed` (a copy). */
function renameRefs<T>(schema: T, renamed: Map<string, string>, part: TSchemaPart = 'schema'): T {
  const target = part === 'ref' ? defRef(schema) : undefined
  if (target !== undefined) {
    return `#/$defs/${renamed.get(target) ?? target}` as T
  }
  if (Array.isArray(schema)) {
    return schema.map(item => renameRefs(item, renamed)) as T
  }
  if (!schema || typeof schema !== 'object') {
    return schema
  }
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(schema)) {
    out[key] = renameRefs(value, renamed, partOf(part, key))
  }
  return out as T
}

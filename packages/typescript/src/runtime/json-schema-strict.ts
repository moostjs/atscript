import type { TJsonSchema } from './json-schema'

/**
 * What a strict tool / structured-output schema of an LLM provider accepts (the `strict` option
 * of {@link buildJsonSchema}): the schema is built closed (`additionalProperties: false` on every
 * object), then rewritten to the profile. Constraints the profile drops are not enforced by the
 * provider: validate the model's output with the atscript validator.
 */
export interface TStrictProfile {
  /** The provider's name, in the errors of a shape it can't take. */
  name: string
  /**
   * The keywords the provider accepts (an allow-list): `true`, or a check of the keyword's value
   * (`false`: the keyword is dropped there). Every other keyword is dropped.
   */
  keywords: Readonly<Record<string, true | ((value: unknown) => boolean)>>
  /**
   * Every property in `required`, the optional ones nullable: the model sends `null` for an
   * optional field it leaves out. The validator rejects `null` on an optional `@meta.required`
   * field: drop those values first (see `dropOptionalNulls`).
   */
  requireAll: boolean
  /**
   * Rewrites the `allOf` the schema builder writes: a `$ref` with notes beside it (a field's
   * title, description, key counts) → the referenced schema inlined with them; several patterns
   * → the first one (the rest dropped) when `allOf` itself is not allowed. Any other `allOf`
   * (an intersection) throws, whatever the profile allows.
   */
  collapseAllOf: boolean
  /** Appends each dropped constraint to the schema's `description`, in plain words. */
  describeDropped: boolean
  /** Recursive types (a `$defs` entry that refers to itself); `false`: throws. */
  allowRecursion: boolean
  /** The root must be an object schema; else throws. */
  objectRoot: boolean
}

/** The keywords every provider takes: the shape of the schema, its notes and literals. */
const BASE_KEYWORDS = {
  type: true,
  properties: true,
  required: true,
  additionalProperties: true,
  items: true,
  anyOf: true,
  $ref: true,
  $defs: true,
  enum: true,
  const: true,
  title: true,
  description: true,
} as const

/** The string formats both providers list. */
const FORMATS = new Set([
  'date-time',
  'time',
  'date',
  'duration',
  'email',
  'hostname',
  'ipv4',
  'ipv6',
  'uuid',
])

/**
 * OpenAI Structured Outputs / `strict: true` function calling: every property required
 * (optional ones nullable), objects closed, an object root, no `allOf`; patterns without
 * lookaround, backreferences or modifier groups, numeric bounds and `minItems` / `maxItems`
 * kept; string lengths, `uniqueItems` and key counts dropped. Recursion is allowed.
 */
export const OPENAI_STRICT: TStrictProfile = {
  name: 'openai',
  keywords: {
    ...BASE_KEYWORDS,
    pattern: value => decodablePattern(value as string),
    format: value => FORMATS.has(value as string),
    minimum: true,
    maximum: true,
    exclusiveMinimum: true,
    exclusiveMaximum: true,
    multipleOf: true,
    minItems: true,
    maxItems: true,
  },
  requireAll: true,
  collapseAllOf: true,
  describeDropped: true,
  allowRecursion: true,
  objectRoot: true,
}

/**
 * Anthropic strict tool use / structured outputs: objects closed, an object root (a tool's
 * `input_schema`), no recursion; simple patterns kept (no lookaround, backreferences, word
 * boundaries or large `{n,m}`), `minItems` only `0` / `1`; numeric bounds, string lengths,
 * `maxItems`, `uniqueItems` and key counts dropped. `allOf` is allowed for several patterns
 * only (a `$ref` with notes is collapsed; an intersection throws). Optional properties stay
 * optional.
 */
export const ANTHROPIC_STRICT: TStrictProfile = {
  name: 'anthropic',
  keywords: {
    ...BASE_KEYWORDS,
    allOf: true,
    pattern: value => simplePattern(value as string),
    format: value => FORMATS.has(value as string) || value === 'uri',
    minItems: value => value === 0 || value === 1,
  },
  requireAll: false,
  collapseAllOf: true,
  describeDropped: true,
  allowRecursion: false,
  objectRoot: true,
}

/** The largest `{n,m}` bound a simple pattern has (see {@link simplePattern}). */
const SIMPLE_BOUND = 100

/**
 * A pattern without lookaround, backreferences, word boundaries, Unicode property escapes,
 * modifier groups or `{n,m}` bounds above {@link SIMPLE_BOUND} (Anthropic's simple patterns).
 * Named groups are fine; `\b` in a class is a backspace.
 */
export function simplePattern(pattern: string): boolean {
  return scanPattern(pattern, true)
}

/** A pattern without lookaround, backreferences or modifier groups (OpenAI). */
export function decodablePattern(pattern: string): boolean {
  return scanPattern(pattern, false)
}

/** {@link simplePattern} (`simple`), else {@link decodablePattern}. */
function scanPattern(pattern: string, simple: boolean): boolean {
  let inClass = false
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '\\') {
      const next = pattern[++i]
      if (next === undefined || /[1-9k]/.test(next)) {
        return false
      }
      if (simple && (/[pPB]/.test(next) || (next === 'b' && !inClass))) {
        return false
      }
    } else if (inClass) {
      inClass = c !== ']'
    } else if (c === '[') {
      inClass = true
    } else if (c === '(' && pattern[i + 1] === '?') {
      // (`(?:…)` and a named group `(?<n>…)` only)
      const kind = pattern[i + 2]
      const named = kind === '<' && pattern[i + 3] !== '=' && pattern[i + 3] !== '!'
      if (kind !== ':' && !named) {
        return false
      }
    } else if (simple && c === '{') {
      const bounds = /^\{(\d+)(?:,(\d*))?\}/.exec(pattern.slice(i))
      if (bounds && (Number(bounds[1]) > SIMPLE_BOUND || Number(bounds[2] || 0) > SIMPLE_BOUND)) {
        return false
      }
    }
  }
  return true
}

/** The `$defs` name a `$ref` this builder writes points to. */
function refName(ref: string): string {
  return ref.slice('#/$defs/'.length)
}

/** The `$defs` names `schema` refers to (through any keyword but `$defs`). */
function refsOf(schema: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(schema)) {
    for (const item of schema) {
      refsOf(item, out)
    }
  } else if (schema && typeof schema === 'object') {
    for (const [key, value] of Object.entries(schema)) {
      if (key === '$ref' && typeof value === 'string') {
        out.add(refName(value))
      } else if (key !== '$defs') {
        refsOf(value, out)
      }
    }
  }
  return out
}

/** The refs of each `$defs` entry, by name. */
function edgesOf(defs: Record<string, TJsonSchema>): Map<string, Set<string>> {
  return new Map(Object.entries(defs).map(([name, def]) => [name, refsOf(def)]))
}

/** The `$defs` names reachable from `from` through `edges`. */
function reachable(from: Iterable<string>, edges: Map<string, Set<string>>): Set<string> {
  const seen = new Set<string>()
  const stack = [...from]
  for (let name = stack.pop(); name !== undefined; name = stack.pop()) {
    if (!seen.has(name)) {
      seen.add(name)
      stack.push(...(edges.get(name) ?? []))
    }
  }
  return seen
}

/** The first `$defs` entry that refers to itself, through any others; `undefined`: none. */
function recursiveDef(defs: Record<string, TJsonSchema>): string | undefined {
  const edges = edgesOf(defs)
  return [...edges.keys()].find(name => reachable(edges.get(name)!, edges).has(name))
}

/** Whether `key` is the only key of `item`. */
function hasOnly(item: TJsonSchema, key: string): boolean {
  const keys = Object.keys(item)
  return keys.length === 1 && keys[0] === key
}

/** An `allOf` the schema builder writes besides an intersection: one `$ref`, or patterns only. */
function isNoteOrPatterns(allOf: TJsonSchema[]): boolean {
  return (
    (allOf.length === 1 && hasOnly(allOf[0], '$ref')) ||
    allOf.every(item => hasOnly(item, 'pattern'))
  )
}

/** `n` `one`(s): `1 item`, `2 items`. */
function count(n: unknown, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/** A dropped keyword in plain words (`pattern` `\S`: the `@meta.required` check). */
function describe(keyword: string, value: unknown): string {
  switch (keyword) {
    case 'minLength': {
      return `At least ${count(value, 'character')}.`
    }
    case 'maxLength': {
      return `At most ${count(value, 'character')}.`
    }
    case 'pattern': {
      return value === '\\S'
        ? 'Must not be blank.'
        : `Must match the pattern ${JSON.stringify(value)}.`
    }
    case 'format': {
      return `Format: ${value}.`
    }
    case 'minimum': {
      return `Minimum ${value}.`
    }
    case 'maximum': {
      return `Maximum ${value}.`
    }
    case 'exclusiveMinimum': {
      return `Greater than ${value}.`
    }
    case 'exclusiveMaximum': {
      return `Less than ${value}.`
    }
    case 'multipleOf': {
      return `A multiple of ${value}.`
    }
    case 'minItems': {
      return `At least ${count(value, 'item')}.`
    }
    case 'maxItems': {
      return `At most ${count(value, 'item')}.`
    }
    case 'uniqueItems': {
      return value ? 'Items must be unique.' : ''
    }
    case 'minProperties': {
      return `At least ${count(value, 'property', 'properties')}.`
    }
    case 'maxProperties': {
      return `At most ${count(value, 'property', 'properties')}.`
    }
    default: {
      return `${keyword}: ${JSON.stringify(value)}.`
    }
  }
}

/** A schema `type` of objects (`'object'`, or a type list with it: an optional object). */
function isObjectType(type: unknown): boolean {
  return type === 'object' || (Array.isArray(type) && type.includes('object'))
}

/** Whether `schema` accepts `null` as it is (a `null` type, value or `anyOf` member). */
function acceptsNull(schema: TJsonSchema): boolean {
  if ('const' in schema) {
    return schema.const === null
  }
  if (Array.isArray(schema.enum)) {
    return schema.enum.includes(null)
  }
  if (schema.type !== undefined) {
    return schema.type === 'null' || (Array.isArray(schema.type) && schema.type.includes('null'))
  }
  return Array.isArray(schema.anyOf) && schema.anyOf.some(acceptsNull)
}

/**
 * `schema` also accepting `null`: `type: [t, 'null']` for a plain typed schema, else an `anyOf`
 * with a `null` member (the title / description stay beside it).
 */
function orNull(schema: TJsonSchema): TJsonSchema {
  if (acceptsNull(schema)) {
    return schema
  }
  if (schema.type !== undefined && !('const' in schema) && schema.enum === undefined) {
    return { ...schema, type: [schema.type, 'null'].flat() }
  }
  const { title, description, ...body } = schema
  const notes: TJsonSchema = {}
  if (title !== undefined) {
    notes.title = title
  }
  if (description !== undefined) {
    notes.description = description
  }
  const members = Object.keys(body).length === 1 && Array.isArray(body.anyOf) ? body.anyOf : [body]
  return { anyOf: [...members, { type: 'null' }], ...notes }
}

/**
 * Object schema `out` with every property required (`requireAll`): those not in `required`
 * (optional) made nullable.
 */
function requireAll(out: TJsonSchema, required: string[] | undefined): void {
  const properties = (out.properties ?? {}) as Record<string, TJsonSchema>
  const keys = Object.keys(properties)
  const requiredKeys = new Set(required)
  for (const key of keys) {
    if (!requiredKeys.has(key)) {
      properties[key] = orNull(properties[key])
    }
  }
  if (keys.length > 0) {
    out.required = keys
  } else {
    delete out.required
  }
}

/** Whether `schema` carries the `@meta.required` check of a string (the pattern `\S`). */
function hasBlankCheck(schema: TJsonSchema): boolean {
  return (
    schema.pattern === '\\S' ||
    (Array.isArray(schema.allOf) && schema.allOf.some(item => item.pattern === '\\S'))
  )
}

/**
 * `out` with the `dropped` keywords described in its `description` (`blank`: it has the
 * `@meta.required` check, kept or described, which says what its `minLength: 1` would). A lone
 * `$ref` takes no keywords beside it: it moves into an `anyOf` of its own.
 */
function described(
  out: TJsonSchema,
  dropped: Array<[string, unknown]>,
  blank: boolean
): TJsonSchema {
  const notes = dropped
    .filter(([key, value]) => !(blank && key === 'minLength' && value === 1))
    .map(([key, value]) => describe(key, value))
    .filter(Boolean)
    .join(' ')
  if (!notes) {
    return out
  }
  let schema = out
  if (schema.$ref !== undefined) {
    const { $ref, ...rest } = schema
    schema = { anyOf: [{ $ref }], ...rest }
  }
  schema.description = schema.description ? `${schema.description}\n\n${notes}` : notes
  return schema
}

/**
 * `schema` (built closed by {@link buildJsonSchema}) rewritten to `profile` (see
 * {@link TStrictProfile}). Throws for a shape the profile can't take.
 */
export function strictSchema(schema: TJsonSchema, profile: TStrictProfile): TJsonSchema {
  const fail = (what: string): never => {
    throw new Error(`buildJsonSchema (strict: ${profile.name}): ${what}`)
  }
  const defs = (schema.$defs ?? {}) as Record<string, TJsonSchema>
  if (!profile.allowRecursion) {
    const recursive = recursiveDef(defs)
    if (recursive !== undefined) {
      fail(`recursive type "${recursive}" is not supported`)
    }
  }
  if (profile.objectRoot && schema.type !== 'object') {
    fail('the root must be an object type')
  }
  const allowed = (keyword: string, value: unknown): boolean => {
    const rule = profile.keywords[keyword]
    return rule === true || (rule !== undefined && rule(value))
  }
  /** `$defs` entries being inlined (a use of an entry inside itself stays a reference). */
  const inlining = new Set<string>()

  /**
   * `s` rewritten; the constraints it drops are described on it. `part`: a subschema of an
   * `allOf` (a constraint of the schema it sits in, no type of its own).
   */
  const rewrite = (s: TJsonSchema, at: string, part = false): TJsonSchema => {
    /** The dropped keywords and their values (described at the end). */
    const dropped: Array<[string, unknown]> = []
    /** The `$defs` entries inlined here (see `collapse`). */
    const entered: string[] = []
    let source = profile.collapseAllOf ? collapse(s, dropped, entered) : s
    if (source.oneOf && !profile.keywords.oneOf) {
      // (a discriminated union: its branches differ by their literal, `anyOf` takes the same)
      const { oneOf, discriminator: _, ...rest } = source
      source = { ...rest, anyOf: oneOf }
    }
    const where = at || 'the root'
    if (Array.isArray(source.allOf) && !isNoteOrPatterns(source.allOf)) {
      // (a real intersection: closed, its parts could never both hold)
      fail(`an intersection (at ${where}) has no strict schema`)
    }
    if (Array.isArray(source.items)) {
      fail(`a tuple (at ${where}) has no strict schema`)
    }
    if (source.patternProperties !== undefined) {
      // (closed, it could only be `{}`)
      fail(`a record (at ${where}) has no strict schema; use an array of key/value objects`)
    }
    if (
      !part &&
      source.type === undefined &&
      source.anyOf === undefined &&
      source.allOf === undefined &&
      source.$ref === undefined &&
      source.not === undefined &&
      !('const' in source) &&
      source.enum === undefined
    ) {
      fail(`a value of any type (at ${where}) has no strict schema`)
    }
    const out: TJsonSchema = {}
    for (const [key, value] of Object.entries(source)) {
      if (key === 'discriminator' && !profile.keywords.discriminator) {
        continue
      }
      if (!allowed(key, value)) {
        if (key === 'allOf' || key === 'not') {
          fail(
            `${key === 'allOf' ? 'an intersection' : 'an impossible type'} (at ${where}) has no strict schema`
          )
        }
        dropped.push([key, value])
        continue
      }
      out[key] = rewriteValue(key, value, at)
    }
    for (const name of entered) {
      inlining.delete(name)
    }
    if (isObjectType(out.type)) {
      out.additionalProperties = false
      if (profile.requireAll) {
        requireAll(out, source.required as string[] | undefined)
      }
    }
    return profile.describeDropped && dropped.length > 0
      ? described(out, dropped, hasBlankCheck(s) || hasBlankCheck(source))
      : out
  }

  /** The value of keyword `key` rewritten (its subschemas). */
  const rewriteValue = (key: string, value: unknown, at: string): unknown => {
    switch (key) {
      case 'properties': {
        return Object.fromEntries(
          Object.entries(value as Record<string, TJsonSchema>).map(([name, p]) => [
            name,
            rewrite(p, at ? `${at}.${name}` : name),
          ])
        )
      }
      case 'items': {
        return rewrite(value as TJsonSchema, `${at}[]`)
      }
      case 'anyOf': {
        return (value as TJsonSchema[]).map(item => rewrite(item, at))
      }
      case 'allOf': {
        return (value as TJsonSchema[]).map(item => rewrite(item, at, true))
      }
      case '$defs': {
        return Object.fromEntries(
          Object.entries(value as Record<string, TJsonSchema>).map(([name, d]) => {
            // (a use of the entry inside it stays a reference)
            inlining.add(name)
            const entry = rewrite(d, `$defs.${name}`)
            inlining.delete(name)
            return [name, entry]
          })
        )
      }
      default: {
        return value
      }
    }
  }

  /**
   * `s` with its `allOf` collapsed (see `collapseAllOf`): what it drops in `dropped`, the
   * `$defs` entries it inlines in `entered` (and `inlining`, until `s` is rewritten).
   */
  const collapse = (
    s: TJsonSchema,
    dropped: Array<[string, unknown]>,
    entered: string[]
  ): TJsonSchema => {
    if (!Array.isArray(s.allOf)) {
      return s
    }
    const { allOf, ...rest } = s as TJsonSchema & { allOf: TJsonSchema[] }
    const ref = allOf.length === 1 && hasOnly(allOf[0], '$ref') ? allOf[0].$ref : undefined
    if (typeof ref === 'string') {
      // A `$ref` with notes beside it: the entry inlined, with the notes (and key counts).
      const name = refName(ref)
      const target = defs[name]
      if (target === undefined || inlining.has(name)) {
        // (a use of an entry inside itself: the reference in an `anyOf` of its own, the notes
        // beside it)
        return { anyOf: [{ $ref: ref }], ...rest }
      }
      inlining.add(name)
      entered.push(name)
      return collapse({ ...target, ...rest }, dropped, entered)
    }
    if (!allOf.every(item => hasOnly(item, 'pattern'))) {
      return s
    }
    if (profile.keywords.allOf) {
      // (allowed: the patterns the profile takes stay)
      const kept = allOf.filter(item => {
        if (allowed('pattern', item.pattern)) {
          return true
        }
        dropped.push(['pattern', item.pattern])
        return false
      })
      if (kept.length > 1 || (kept.length === 1 && rest.pattern !== undefined)) {
        return { ...rest, allOf: kept }
      }
      return kept.length === 1 ? { ...rest, pattern: kept[0].pattern } : rest
    }
    // Several patterns: the first one the profile takes, the rest described.
    const out: TJsonSchema = { ...rest }
    for (const { pattern } of allOf) {
      if (out.pattern === undefined && allowed('pattern', pattern)) {
        out.pattern = pattern
      } else {
        dropped.push(['pattern', pattern])
      }
    }
    return out
  }

  const out = rewrite(schema, '')
  if (out.$defs) {
    // (entries only inlined uses referred to: dropped)
    const used = reachable(refsOf(out), edgesOf(out.$defs))
    for (const name of Object.keys(out.$defs)) {
      if (!used.has(name)) {
        delete out.$defs[name]
      }
    }
    if (Object.keys(out.$defs).length === 0) {
      delete out.$defs
    }
  }
  return out
}
